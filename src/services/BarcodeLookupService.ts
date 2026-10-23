import { offlineFetch as fetch } from './OfflinePolicy';
/**
 * @file src/services/BarcodeLookupService.ts
 * @description Multi-tier barcode resolution service for SafeScale Health.
 *
 * Sourcing hierarchy:
 *   1. Local USDA DB — Instant, zero-latency, 100% offline.
 *   2. Open Food Facts API — Free, public crowd-sourced database (no API key required).
 *
 * Resolves to a unified FoodAnalysisResult for immediate macro tracking & allergen verification.
 */

import { USDALookupService } from './USDALookupService';
import type { FoodAnalysisResult } from '../types';

interface OpenFoodFactsNutriments {
  'energy-kcal'?: number;
  'energy-kcal_100g'?: number;
  'energy-kcal_serving'?: number;
  'energy_100g'?: number;
  proteins?: number;
  proteins_100g?: number;
  proteins_serving?: number;
  carbohydrates?: number;
  carbohydrates_100g?: number;
  carbohydrates_serving?: number;
  fat?: number;
  fat_100g?: number;
  fat_serving?: number;
  fiber?: number;
  fiber_100g?: number;
  fiber_serving?: number;
  sugars?: number;
  sugars_100g?: number;
  sugars_serving?: number;
  sodium?: number;
  sodium_100g?: number;
  sodium_serving?: number;
  salt_100g?: number;
}

interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_en?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: OpenFoodFactsNutriments;
  ingredients_text?: string;
  ingredients_tags?: string[];
  allergens_tags?: string[];
}

interface OpenFoodFactsResponse {
  status: number;
  status_verbose?: string;
  product?: OpenFoodFactsProduct;
}

const OPEN_FOOD_FACTS_BASE = 'https://world.openfoodfacts.org/api/v2/product';

/**
 * Parses raw ingredient string or tag list into an array of clean ingredient tokens.
 */
function parseIngredients(product: OpenFoodFactsProduct): string[] {
  const set = new Set<string>();

  if (product.allergens_tags) {
    for (const tag of product.allergens_tags) {
      const clean = tag.replace(/^en:/, '').replace(/-/g, ' ').trim().toLowerCase();
      if (clean) set.add(clean);
    }
  }

  if (product.ingredients_tags) {
    for (const tag of product.ingredients_tags) {
      const clean = tag.replace(/^en:/, '').replace(/-/g, ' ').trim().toLowerCase();
      if (clean) set.add(clean);
    }
  }

  if (product.ingredients_text) {
    const tokens = product.ingredients_text
      .split(/[,.;()]/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 1 && s.length < 40);
    for (const t of tokens) set.add(t);
  }

  return Array.from(set);
}

export const BarcodeLookupService = {
  /**
   * Resolve a UPC/EAN barcode to nutritional info using the multi-tier cascade.
   *
   * @param barcode Raw barcode string detected from camera or input.
   * @returns Unified FoodAnalysisResult.
   */
  lookupBarcode: async (barcode: string): Promise<FoodAnalysisResult> => {
    const cleanBarcode = barcode.trim().replace(/[^0-9]/g, '');
    if (!cleanBarcode) {
      throw new Error('Please scan or enter a valid numeric barcode.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tier 1: Local Offline USDA Database
    // ─────────────────────────────────────────────────────────────────────────
    const localMatch = USDALookupService.getFoodByBarcode(cleanBarcode);
    if (localMatch) {
      const result = USDALookupService.toFoodAnalysisResult(localMatch);
      return {
        ...result,
        barcode: cleanBarcode,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tier 2: Open Food Facts Free API
    // ─────────────────────────────────────────────────────────────────────────
    // A local miss is not permission to contact a third-party database.
    const { CloudPermissionGuard } = await import('./CloudPermissionGuard');
    const allowed = await CloudPermissionGuard.requestPermission({
      purpose: 'Look up this barcode in Open Food Facts', endpoint: 'https://world.openfoodfacts.org',
      dataPayloadSummary: `Barcode ${cleanBarcode}; your health profile is not sent.`, sensitiveFields: ['Product barcode'],
    });
    if (!allowed) throw new Error('Online lookup canceled. Search the offline database or enter the food manually.');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const url = `${OPEN_FOOD_FACTS_BASE}/${cleanBarcode}.json?fields=product_name,product_name_en,serving_size,serving_quantity,nutriments,ingredients_text,ingredients_tags,allergens_tags`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SafeScaleHealth/1.0 (CongressionalAppChallenge)',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Open Food Facts lookup failed (HTTP ${response.status})`);
      }

      const data = (await response.json()) as OpenFoodFactsResponse;

      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = p.nutriments || {};

        const name = p.product_name_en || p.product_name || `Scanned Product (${cleanBarcode})`;
        const nValues = n as Record<string, number | undefined>;
        const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
        // Use explicit gram weights only: volume servings need density, which we do not know.
        const grams = p.serving_size?.match(/(?:^|[ (])(\d+(?:\.\d+)?)\s*g(?:\b|\))/i);
        const weight = grams ? Number(grams[1]) : undefined;
        const hasWeight = weight !== undefined && weight > 0;
        const hasServing = !!p.serving_size?.trim() && Object.keys(nValues).some(key => key.endsWith('_serving') && valid(nValues[key]));
        const useServing = hasWeight || hasServing;
        const serving = useServing ? p.serving_size! : '100 g (reference amount; adjust your portion)';
        const nutrient = (key: string): number | undefined => {
          const direct = nValues[`${key}_serving`]; const per100 = nValues[`${key}_100g`];
          if (useServing && valid(direct)) return direct;
          if (valid(per100) && (!useServing || hasWeight)) return per100 * (hasWeight ? weight! / 100 : 1);
          return undefined;
        };
        const rounded = (value: number | undefined, factor = 1) => value === undefined ? undefined : Math.round(value * factor * 10) / 10;
        const energy = nutrient('energy-kcal');
        const kj = nutrient('energy');
        const calories = rounded(energy ?? (kj === undefined ? undefined : kj / 4.184));
        const protein = rounded(nutrient('proteins'));
        const carbs = rounded(nutrient('carbohydrates'));
        const fat = rounded(nutrient('fat'));
        const fiber = rounded(nutrient('fiber'));
        const sugar = rounded(nutrient('sugars'));
        const sodium = nutrient('sodium'); const salt = nutrient('salt');
        const sodiumMg = rounded(sodium ?? (salt === undefined ? undefined : salt / 2.5), 1000);

        const ingredients = parseIngredients(p);

        return {
          foodName: name,
          portionEstimate: serving,
          calories,
          protein,
          carbs,
          fat,
          fiber,
          sugar,
          sodium: sodiumMg,
          confidence: 'low',
          ingredients,
          source: 'openfoodfacts',
          barcode: cleanBarcode,
        };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Barcode lookup timed out. Check your network or enter manually.');
      }
      throw new Error(errorMsg || 'Online lookup failed. Please try again.');
    } finally {
      clearTimeout(timeoutId);
    }

    throw new Error(
      `Barcode ${cleanBarcode} was not found in the offline database or Open Food Facts. You can search by name or enter it manually.`,
    );
  },
};
