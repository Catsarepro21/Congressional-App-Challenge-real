/**
 * @file src/types/usda.ts
 * @description Type definitions for the offline USDA Food & Nutrition Database and Barcode lookup system.
 */

export type FoodCategory =
  | 'Fruits'
  | 'Vegetables'
  | 'Poultry & Meat'
  | 'Fish & Seafood'
  | 'Dairy & Eggs'
  | 'Grains & Pasta'
  | 'Legumes & Beans'
  | 'Nuts & Seeds'
  | 'Beverages'
  | 'Snacks & Sweets'
  | 'Fast Food'
  | 'Condiments & Sauces'
  | 'Prepared Meals';

export interface USDAFoodEntry {
  readonly fdcId: number;
  readonly name: string;
  readonly category: FoodCategory;
  readonly servingSize: number;
  readonly servingUnit: string; // e.g. "1 medium", "100g", "1 cup", "1 slice"
  readonly calories: number;
  readonly protein: number;  // grams
  readonly carbs: number;    // grams
  readonly fat: number;      // grams
  readonly fiber: number;    // grams
  readonly sugar: number;    // grams
  readonly sodium: number;   // milligrams
  readonly aliases?: readonly string[];
  readonly upc?: string;      // Barcode / UPC-A / EAN-13 if applicable
  readonly micronutrients?: {
    potassiumMg?: number;
    calciumMg?: number;
    ironMg?: number;
    vitaminCMg?: number;
    vitaminAIu?: number;
    cholesterolMg?: number;
  };
}

export interface USDASearchResult {
  readonly food: USDAFoodEntry;
  readonly score: number;
  readonly matchedAlias?: string;
}

export type NutritionSource =
  | 'usda'
  | 'openfoodfacts'
  | 'cloud-gemini'
  | 'manual'
  | 'on-device';
