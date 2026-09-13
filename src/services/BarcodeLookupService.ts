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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const url = `${OPEN_FOOD_FACTS_BASE}/${cleanBarcode}.json?fields=product_name,product_name_en,serving_size,nutriments,ingredients_text,ingredients_tags,allergens_tags`;
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
        const serving = p.serving_size || '1 serving (estimated 100g)';

        // Calories extraction (prioritize serving, then 100g)
        let calories = n['energy-kcal_serving'] ?? n['energy-kcal_100g'] ?? n['energy-kcal'];
        if (calories === undefined && n.energy_100g) {
          calories = Math.round(n.energy_100g / 4.184); // kJ to kcal
        }
        calories = Math.max(0, Math.round(calories ?? 0));

        const protein = Math.max(0, Math.round((n.proteins_serving ?? n.proteins_100g ?? n.proteins ?? 0) * 10) / 10);
        const carbs = Math.max(0, Math.round((n.carbohydrates_serving ?? n.carbohydrates_100g ?? n.carbohydrates ?? 0) * 10) / 10);
        const fat = Math.max(0, Math.round((n.fat_serving ?? n.fat_100g ?? n.fat ?? 0) * 10) / 10);
        const fiber = Math.max(0, Math.round((n.fiber_serving ?? n.fiber_100g ?? n.fiber ?? 0) * 10) / 10);
        const sugar = Math.max(0, Math.round((n.sugars_serving ?? n.sugars_100g ?? n.sugars ?? 0) * 10) / 10);

        // Sodium extraction (mg)
        let sodiumMg = 0;
        if (n.sodium_serving !== undefined) {
          sodiumMg = n.sodium_serving * 1000;
        } else if (n.sodium_100g !== undefined) {
          sodiumMg = n.sodium_100g * 1000;
        } else if (n.sodium !== undefined) {
          sodiumMg = n.sodium * 1000;
        } else if (n.salt_100g !== undefined) {
          sodiumMg = (n.salt_100g / 2.5) * 1000;
        }
        sodiumMg = Math.max(0, Math.round(sodiumMg));

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
          confidence: 'high',
          ingredients,
          source: 'openfoodfacts',
          barcode: cleanBarcode,
        };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('AbortError')) {
        throw new Error('Barcode lookup timed out. Check your network or enter manually.');
      }
    } finally {
      clearTimeout(timeoutId);
    }

    throw new Error(
      `Barcode ${cleanBarcode} was not found in the offline database or Open Food Facts. You can search by name or enter it manually.`,
    );
  },
};
