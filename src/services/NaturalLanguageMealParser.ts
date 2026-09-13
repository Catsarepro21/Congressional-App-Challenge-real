/**
 * @file src/services/NaturalLanguageMealParser.ts
 * @description Offline Natural Language Meal & Recipe Parser.
 *
 * Converts plain English meal descriptions (e.g. "2 eggs and a slice of whole wheat toast")
 * into itemized, verified USDA database entries with exact aggregated calories and macros.
 * Runs 100% offline with zero network latency.
 */

import { USDALookupService } from './USDALookupService';
import type { FoodAnalysisResult, USDAFoodEntry } from '../types';

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
  double: 2,
  triple: 3,
};

export interface ParsedMealItem {
  food: USDAFoodEntry;
  quantity: number;
  unit?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  portionDescription: string;
}

export interface ParsedMealResult extends FoodAnalysisResult {
  items: ParsedMealItem[];
}

/**
 * Extracts quantity and clean food query from a natural text segment.
 * E.g., "2 large eggs" -> { quantity: 2, query: "large eggs", unit: "large" }
 * E.g., "a slice of whole wheat toast" -> { quantity: 1, query: "whole wheat toast", unit: "slice" }
 */
function parseSegment(segment: string): { quantity: number; query: string; unit?: string } {
  let text = segment.trim().toLowerCase();

  // Strip leading words like "some", "a plate of", "a bowl of", "side of"
  text = text.replace(/^(a plate of|a bowl of|a cup of|a side of|side of|plate of|bowl of|some)\s+/i, '');

  let quantity = 1;
  let unit: string | undefined;

  // Match digit or fraction at start (e.g. "2", "1.5", "1/2", "3")
  const numMatch = text.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*/);
  if (numMatch) {
    const rawNum = numMatch[1];
    if (rawNum.includes('/')) {
      const [num, den] = rawNum.split('/').map(Number);
      quantity = den ? num / den : 1;
    } else {
      quantity = Number(rawNum) || 1;
    }
    text = text.slice(numMatch[0].length).trim();
  } else {
    // Check word numbers (e.g. "two eggs", "half an apple")
    const words = text.split(' ');
    const firstWord = words[0];
    if (firstWord in WORD_NUMBERS) {
      quantity = WORD_NUMBERS[firstWord];
      text = words.slice(1).join(' ').trim();
      // Handle "half an / a"
      if (quantity === 0.5 && (words[1] === 'a' || words[1] === 'an')) {
        text = words.slice(2).join(' ').trim();
      }
    }
  }

  // Detect and strip unit descriptors (slice, cup, scoop, piece, can, tablespoon, etc.)
  const unitMatch = text.match(/^(slice|slices|cup|cups|can|cans|piece|pieces|tbsp|tablespoon|tablespoons|oz|ounces?|serving|servings|bowl|bowls|scoop|scoops|pat|pats)\s+(?:of\s+)?/i);
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    text = text.slice(unitMatch[0].length).trim();
  }

  return { quantity, query: text, unit };
}

export const NaturalLanguageMealParser = {
  /**
   * Parse a natural language meal description into aggregated USDA components.
   *
   * @param text Natural language description (e.g. "2 eggs, whole wheat toast, and black coffee")
   * @returns Aggregated FoodAnalysisResult with itemized breakdown
   */
  parseMealText: (text: string): ParsedMealResult => {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Please enter a meal description to parse.');
    }

    // Split text by delimiters: comma, semicolon, "and", "with", "+", "&"
    const rawSegments = trimmed
      .split(/(?:,|\band\b|\bwith\b|\+|&|;)/i)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const parsedItems: ParsedMealItem[] = [];
    const allIngredients = new Set<string>();

    for (const seg of rawSegments) {
      const { quantity, query, unit } = parseSegment(seg);
      if (!query) continue;

      const matches = USDALookupService.searchFoods(query, { limit: 1 });
      if (matches.length > 0 && matches[0].score >= 150) {
        const food = matches[0].food;
        const res = USDALookupService.toFoodAnalysisResult(food, quantity);

        if (res.ingredients) {
          for (const ing of res.ingredients) allIngredients.add(ing);
        }

        const portionDesc = unit
          ? `${quantity} ${unit} (${food.name.split('(')[0].trim()})`
          : quantity === 1
          ? food.servingUnit
          : `${food.servingUnit} (x${quantity})`;

        parsedItems.push({
          food,
          quantity,
          unit,
          calories: res.calories,
          protein: res.protein,
          carbs: res.carbs,
          fat: res.fat,
          portionDescription: portionDesc,
        });
      }
    }

    if (parsedItems.length === 0) {
      throw new Error(
        `Could not recognize foods in "${trimmed}". Try using common food terms like eggs, toast, rice, chicken, or apple.`,
      );
    }

    // Aggregate values
    const totalCalories = parsedItems.reduce((acc, item) => acc + item.calories, 0);
    const totalProtein = Math.round(parsedItems.reduce((acc, item) => acc + item.protein, 0) * 10) / 10;
    const totalCarbs = Math.round(parsedItems.reduce((acc, item) => acc + item.carbs, 0) * 10) / 10;
    const totalFat = Math.round(parsedItems.reduce((acc, item) => acc + item.fat, 0) * 10) / 10;
    const totalFiber = Math.round(
      parsedItems.reduce((acc, item) => acc + item.food.fiber * item.quantity, 0) * 10,
    ) / 10;
    const totalSugar = Math.round(
      parsedItems.reduce((acc, item) => acc + item.food.sugar * item.quantity, 0) * 10,
    ) / 10;
    const totalSodium = Math.round(
      parsedItems.reduce((acc, item) => acc + item.food.sodium * item.quantity, 0),
    );

    const mealTitle = parsedItems
      .map(item => `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.food.name.split('(')[0].trim()}`)
      .join(', ');

    return {
      foodName: mealTitle,
      portionEstimate: `${parsedItems.length} ${parsedItems.length === 1 ? 'item' : 'items'}`,
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
      fiber: totalFiber,
      sugar: totalSugar,
      sodium: totalSodium,
      confidence: 'high',
      ingredients: Array.from(allIngredients),
      source: 'on-device',
      items: parsedItems,
    };
  },
};
