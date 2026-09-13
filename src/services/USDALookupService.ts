/**
 * @file src/services/USDALookupService.ts
 * @description Fast, offline-first search and retrieval service for the USDA Food Database.
 *
 * Supports:
 *   - Fuzzy name and alias search with ranked relevance scoring
 *   - Direct lookup by USDA FDC ID
 *   - Offline UPC / EAN barcode lookup
 *   - Category browsing
 *   - Conversion to SafeScale's unified FoodAnalysisResult format
 */

import { USDA_COMMON_FOODS } from '../data/usda_common_foods';
import type {
  USDAFoodEntry,
  USDASearchResult,
  FoodCategory,
  FoodAnalysisResult,
} from '../types';

/**
 * Normalizes text for insensitive matching: lowercase, strip punctuation and extra spaces.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates a match score for a food item against query tokens.
 * Higher score = higher relevance.
 */
function scoreFoodMatch(food: USDAFoodEntry, queryNorm: string, queryTokens: string[]): { score: number; matchedAlias?: string } {
  const nameNorm = normalizeText(food.name);

  // 1. Exact full name match
  if (nameNorm === queryNorm) {
    return { score: 1000 };
  }

  // 2. Exact alias match
  if (food.aliases) {
    for (const alias of food.aliases) {
      const aliasNorm = normalizeText(alias);
      if (aliasNorm === queryNorm) {
        return { score: 950, matchedAlias: alias };
      }
    }
  }

  // 3. Name starts with query
  if (nameNorm.startsWith(queryNorm)) {
    return { score: 800 };
  }

  // 4. Alias starts with query
  if (food.aliases) {
    for (const alias of food.aliases) {
      const aliasNorm = normalizeText(alias);
      if (aliasNorm.startsWith(queryNorm)) {
        return { score: 750, matchedAlias: alias };
      }
    }
  }

  // 5. Query contained inside name
  if (nameNorm.includes(queryNorm)) {
    return { score: 600 };
  }

  // 6. Token-based matching: all tokens must match either name or aliases
  const searchableText = `${nameNorm} ${(food.aliases || []).map(normalizeText).join(' ')} ${normalizeText(food.category)}`;
  let matchedAll = true;
  let tokenScore = 0;

  for (const token of queryTokens) {
    if (token.length === 0) continue;
    if (searchableText.includes(token)) {
      tokenScore += 100;
      if (nameNorm.includes(token)) {
        tokenScore += 50; // extra weight for name match
      }
    } else {
      matchedAll = false;
      break;
    }
  }

  if (matchedAll && queryTokens.length > 0) {
    return { score: tokenScore };
  }

  return { score: 0 };
}

/**
 * Slices ingredients from food name and category for allergen cross-checking.
 */
function deriveIngredients(entry: USDAFoodEntry): string[] {
  const set = new Set<string>();
  const raw = `${entry.name} ${(entry.aliases || []).join(' ')}`.toLowerCase();

  // Common allergens & primary ingredients
  if (raw.includes('milk') || raw.includes('cheese') || raw.includes('butter') || raw.includes('yogurt')) {
    set.add('milk');
    set.add('dairy');
  }
  if (raw.includes('egg')) set.add('egg');
  if (raw.includes('peanut')) set.add('peanuts');
  if (raw.includes('almond') || raw.includes('walnut') || raw.includes('cashew') || raw.includes('pecan')) {
    set.add('tree nuts');
  }
  if (raw.includes('wheat') || raw.includes('bread') || raw.includes('pasta') || raw.includes('flour') || raw.includes('bagel')) {
    set.add('wheat');
    set.add('gluten');
  }
  if (raw.includes('soy') || raw.includes('tofu') || raw.includes('tempeh') || raw.includes('edamame')) {
    set.add('soy');
  }
  if (raw.includes('fish') || raw.includes('salmon') || raw.includes('tuna') || raw.includes('cod') || raw.includes('tilapia')) {
    set.add('fish');
  }
  if (raw.includes('shrimp') || raw.includes('prawn') || raw.includes('crab') || raw.includes('lobster')) {
    set.add('shellfish');
  }
  if (raw.includes('sesame')) set.add('sesame');

  // Also include the primary clean name tokens
  const cleanName = entry.name.split('(')[0].trim();
  set.add(cleanName.toLowerCase());

  return Array.from(set);
}

export const USDALookupService = {
  /**
   * Search offline USDA foods by query text with relevance ranking.
   */
  searchFoods: (
    query: string,
    options?: {
      category?: FoodCategory;
      limit?: number;
    },
  ): USDASearchResult[] => {
    const trimmed = query.trim();
    if (!trimmed) {
      // If no query, return top items in category if specified, or top items overall
      const source = options?.category
        ? USDA_COMMON_FOODS.filter(f => f.category === options.category)
        : USDA_COMMON_FOODS;
      const limit = options?.limit ?? 25;
      return source.slice(0, limit).map(food => ({ food, score: 100 }));
    }

    const queryNorm = normalizeText(trimmed);
    const queryTokens = queryNorm.split(' ').filter(Boolean);
    const limit = options?.limit ?? 30;

    const results: USDASearchResult[] = [];

    for (const food of USDA_COMMON_FOODS) {
      if (options?.category && food.category !== options.category) {
        continue;
      }

      const { score, matchedAlias } = scoreFoodMatch(food, queryNorm, queryTokens);
      if (score > 0) {
        results.push({ food, score, matchedAlias });
      }
    }

    // Sort descending by score, then alphabetically
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.food.name.localeCompare(b.food.name);
    });

    return results.slice(0, limit);
  },

  /**
   * Retrieve a specific food by USDA FoodData Central ID.
   */
  getFoodById: (fdcId: number): USDAFoodEntry | undefined => {
    return USDA_COMMON_FOODS.find(f => f.fdcId === fdcId);
  },

  /**
   * Look up a food item by UPC or EAN barcode offline.
   */
  getFoodByBarcode: (upc: string): USDAFoodEntry | undefined => {
    const cleanUpc = upc.trim().replace(/[^0-9]/g, '');
    if (!cleanUpc) return undefined;

    return USDA_COMMON_FOODS.find(f => {
      if (!f.upc) return false;
      const cleanDbUpc = f.upc.replace(/[^0-9]/g, '');
      // Match exact or match without leading zero (UPC-A vs EAN-13 padding)
      return (
        cleanDbUpc === cleanUpc ||
        cleanDbUpc.replace(/^0+/, '') === cleanUpc.replace(/^0+/, '')
      );
    });
  },

  /**
   * Get all unique categories available in the database.
   */
  getCategories: (): FoodCategory[] => {
    const categories = new Set<FoodCategory>();
    for (const food of USDA_COMMON_FOODS) {
      categories.add(food.category);
    }
    return Array.from(categories);
  },

  /**
   * Get all foods belonging to a specific category.
   */
  getFoodsByCategory: (category: FoodCategory): readonly USDAFoodEntry[] => {
    return USDA_COMMON_FOODS.filter(f => f.category === category);
  },

  /**
   * Convert a USDA food entry into SafeScale's unified FoodAnalysisResult format.
   */
  toFoodAnalysisResult: (
    entry: USDAFoodEntry,
    multiplier: number = 1,
  ): FoodAnalysisResult => {
    const safeMult = Math.max(0.1, Number.isFinite(multiplier) ? multiplier : 1);
    const round = (n: number) => Math.round(n * safeMult * 10) / 10;

    return {
      foodName: entry.name.split('(')[0].trim(),
      portionEstimate: safeMult === 1
        ? entry.servingUnit
        : `${entry.servingUnit} (x${safeMult})`,
      calories: Math.round(entry.calories * safeMult),
      carbs: round(entry.carbs),
      protein: round(entry.protein),
      fat: round(entry.fat),
      fiber: round(entry.fiber),
      sugar: round(entry.sugar),
      sodium: Math.round(entry.sodium * safeMult),
      confidence: 'high',
      ingredients: deriveIngredients(entry),
      source: 'usda',
      barcode: entry.upc,
    };
  },
};
