/**
 * @file src/services/AllergenEngine.ts
 * @description Stateless, pure allergen cross-reference engine.
 *
 * ARCHITECTURAL CONTRACT:
 * This class must remain completely decoupled from the Zustand store and any
 * React hooks or context. It receives all required data as explicit parameters
 * and returns a typed result object. No singleton state, no side effects,
 * no module-level imports from /store or /context.
 *
 * USAGE PATTERN (from UI controller layer):
 *   const result = AllergenEngine.analyzeIngredients(
 *     detectedIngredients,    // string[] from OCR pipeline
 *     store.userAllergies,    // string[] from Zustand selector
 *     itemName,               // optional product label
 *   );
 *   if (result.matchFound) {
 *     store.triggerAllergenAlert(result.flaggedIngredients, result);
 *   }
 */

import type { AllergenMatchResult } from '../types';

// ---------------------------------------------------------------------------
// Types private to this module
// ---------------------------------------------------------------------------

/**
 * Internal normalized tuple pairing a raw ingredient string with its
 * lower-cased, trimmed comparison form.
 */
type NormalizedIngredient = {
  readonly raw: string;
  readonly normalized: string;
};

/**
 * Internal normalized tuple pairing a raw allergen name with its
 * lower-cased, trimmed comparison form.
 */
type NormalizedAllergen = {
  readonly raw: string;
  readonly normalized: string;
};

// ---------------------------------------------------------------------------
// Safe macro nutrient tags returned for allergen-free products
// ---------------------------------------------------------------------------

/**
 * Static list of positive macro-nutrient labels displayed as green pill
 * badges on the scan results screen when no allergens are detected.
 *
 * In a production build this would be derived from the OCR nutritional
 * facts panel parse. For the current simulation phase these are static.
 */
const SAFE_MACRO_TAGS: ReadonlyArray<string> = [
  'Gluten Free',
  'High Protein',
  'Low Sodium',
  'No Trans Fats',
  'Dairy Free',
] as const;

// ---------------------------------------------------------------------------
// AllergenEngine class
// ---------------------------------------------------------------------------

export class AllergenEngine {
  /**
   * Normalizes an array of raw strings to their trimmed, lower-cased forms
   * while preserving the original string for result output.
   */
  private static normalizeList(
    items: string[],
  ): NormalizedIngredient[] | NormalizedAllergen[] {
    return items.map((item) => ({
      raw: item,
      normalized: item.toLowerCase().trim(),
    }));
  }

  /**
   * Determines whether a single detected ingredient string matches any
   * allergen in the user's profile.
   *
   * Matching strategy:
   *   - Exact match:    "almond"  ↔  "almond"
   *   - Containment A: "almond paste" contains "almond"   → match
   *   - Containment B: "almonds"  contains "almond"        → match
   *
   * The bidirectional containment check (`ingredient.includes(allergen) ||
   * allergen.includes(ingredient)`) is intentionally conservative — it may
   * produce rare false positives for very short allergen tokens (e.g. "egg"
   * matching "eggplant"). In a production ML-backed system this would be
   * replaced with tokenized semantic matching.
   *
   * @param normalizedIngredient - Lower-cased, trimmed ingredient string.
   * @param normalizedAllergens  - Array of lower-cased, trimmed allergen strings.
   * @returns True if any allergen matches the ingredient.
   */
  private static ingredientMatchesAnyAllergen(
    normalizedIngredient: string,
    normalizedAllergens: string[],
  ): boolean {
    return normalizedAllergens.some(
      (allergen) =>
        normalizedIngredient.includes(allergen) ||
        allergen.includes(normalizedIngredient),
    );
  }

  /**
   * Selects a deterministic subset of safe macro tags to display.
   * Returns the first `count` entries from SAFE_MACRO_TAGS.
   * Kept pure and deterministic so UI snapshots remain stable in tests.
   *
   * @param count - Number of tags to return (default: 3).
   */
  private static buildSafeMacroTags(count: number = 3): string[] {
    return [...SAFE_MACRO_TAGS].slice(0, count);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Performs a case-insensitive intersection between a list of OCR-detected
   * ingredient strings and the user's configured allergen list.
   *
   * This is a **pure function**:
   *   - No network calls.
   *   - No store reads or writes.
   *   - No mutation of input arrays.
   *   - Identical inputs always produce identical outputs.
   *
   * @param detectedIngredients - Strings parsed from the OCR payload.
   *                              Expected to be the raw, display-casing form
   *                              (e.g. ["Almond Paste", "Sugar", "Soy Lecithin"]).
   * @param userAllergies       - The user's allergen list read from the store
   *                              by the calling controller.
   *                              (e.g. ["Peanut", "Almond"])
   * @param itemName            - Optional display label for the scanned product.
   *                              Defaults to 'Scanned Product'.
   * @returns                   A fully populated AllergenMatchResult.
   */
  public static analyzeIngredients(
    detectedIngredients: string[],
    userAllergies: string[],
    itemName: string = 'Scanned Product',
  ): AllergenMatchResult {
    // Guard: empty inputs → always safe, no match possible.
    if (detectedIngredients.length === 0 || userAllergies.length === 0) {
      return {
        itemName,
        matchFound: false,
        flaggedIngredients: [],
        alternativeSafeMacros: AllergenEngine.buildSafeMacroTags(),
      };
    }

    // Build normalized comparison lists while preserving originals.
    const normalizedAllergies: string[] = userAllergies.map((a) =>
      a.toLowerCase().trim(),
    );

    const flaggedIngredients: string[] = [];

    for (const rawIngredient of detectedIngredients) {
      const normalizedIngredient = rawIngredient.toLowerCase().trim();

      const isMatch = AllergenEngine.ingredientMatchesAnyAllergen(
        normalizedIngredient,
        normalizedAllergies,
      );

      if (isMatch && !flaggedIngredients.includes(rawIngredient)) {
        flaggedIngredients.push(rawIngredient);
      }
    }

    const matchFound = flaggedIngredients.length > 0;

    return {
      itemName,
      matchFound,
      flaggedIngredients,
      // Only populated when the product is safe; empty array on allergen hit.
      alternativeSafeMacros: matchFound
        ? []
        : AllergenEngine.buildSafeMacroTags(),
    };
  }

  /**
   * Convenience overload for batch-processing multiple scanned items in a
   * single pass (e.g. when scanning a full grocery receipt).
   *
   * @param items         - Array of [itemName, detectedIngredients] tuples.
   * @param userAllergies - The user's allergen list from the store.
   * @returns             - An array of AllergenMatchResult in the same order.
   */
  public static analyzeBatch(
    items: ReadonlyArray<{ itemName: string; detectedIngredients: string[] }>,
    userAllergies: string[],
  ): AllergenMatchResult[] {
    return items.map(({ itemName, detectedIngredients }) =>
      AllergenEngine.analyzeIngredients(
        detectedIngredients,
        userAllergies,
        itemName,
      ),
    );
  }
}
