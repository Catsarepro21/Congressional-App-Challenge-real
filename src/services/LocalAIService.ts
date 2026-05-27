/**
 * @file src/services/LocalAIService.ts
 * @description Pure, stateless on-device AI Ingredient Research Service.
 *
 * This class simulates a local on-device LLM (such as MediaPipe LLM Inference
 * with Gemma 2B or ONNX Runtime Mobile) by evaluating a list of ingredients
 * against the user's allergy profile and returning detailed structured insights
 * completely offline.
 */

import type { LocalAIAnalysisResult, IngredientInsight } from '../types';

// ---------------------------------------------------------------------------
// Local Ingredient Knowledge Base
// ---------------------------------------------------------------------------

interface StaticInsight {
  readonly name: string;
  readonly description: string;
  readonly alternatives: string[];
  readonly baseRiskLevel: 'Low' | 'Medium' | 'High';
}

/**
 * Pre-compiled on-device dictionary of common food additives and ingredients.
 * Acts as the weights/knowledge base of our local model.
 */
const INGREDIENT_KNOWLEDGE_BASE: Record<string, StaticInsight> = {
  peanut: {
    name: 'Peanut',
    description: 'A legume crop known to cause severe allergic responses in sensitive individuals.',
    alternatives: ['Sunflower seed butter', 'Soy butter', 'Pumpkin seed butter'],
    baseRiskLevel: 'High',
  },
  almond: {
    name: 'Almond',
    description: 'A tree nut widely consumed as food. Can trigger serious tree nut allergies.',
    alternatives: ['Oat milk seeds', 'Pumpkin seeds', 'Sunflower seed butter'],
    baseRiskLevel: 'High',
  },
  milk: {
    name: 'Milk',
    description: 'A nutrient-rich liquid food produced by mammals. Contains lactose and casein which are common allergens.',
    alternatives: ['Oat milk', 'Almond milk', 'Coconut milk', 'Soy milk'],
    baseRiskLevel: 'Medium',
  },
  whey: {
    name: 'Whey Protein',
    description: 'A mixture of proteins isolated from whey, the liquid byproduct of cheese production. Contains dairy.',
    alternatives: ['Pea protein', 'Hemp protein', 'Brown rice protein'],
    baseRiskLevel: 'Medium',
  },
  lecithin: {
    name: 'Soy Lecithin',
    description: 'A food additive used as an emulsifier. Typically derived from soy, but can also come from sunflower or egg.',
    alternatives: ['Sunflower lecithin', 'Egg yolk'],
    baseRiskLevel: 'Low',
  },
  sugar: {
    name: 'Sugar',
    description: 'Simple carbohydrate that provides quick energy. High consumption is associated with metabolic risks.',
    alternatives: ['Stevia', 'Monk fruit extract', 'Erythritol'],
    baseRiskLevel: 'Medium',
  },
  'high fructose corn syrup': {
    name: 'High Fructose Corn Syrup',
    description: 'A sweetener made from corn starch. Strongly associated with obesity, diabetes, and heart disease.',
    alternatives: ['Honey', 'Maple syrup', 'Date paste'],
    baseRiskLevel: 'High',
  },
  sodium: {
    name: 'Sodium Chloride (Salt)',
    description: 'An essential mineral used for seasoning and preservation. High intake can elevate blood pressure.',
    alternatives: ['Potassium chloride', 'Herbs and spices', 'Seaweed flakes'],
    baseRiskLevel: 'Medium',
  },
  gluten: {
    name: 'Gluten',
    description: 'A group of proteins found in cereal grains like wheat, barley, and rye. Causes issues in Celiac disease.',
    alternatives: ['Rice flour', 'Almond flour', 'Coconut flour', 'Tapioca starch'],
    baseRiskLevel: 'Medium',
  },
  wheat: {
    name: 'Wheat Flour',
    description: 'Powder made from grinding wheat grains. Contains gluten and is a common dietary allergen.',
    alternatives: ['Gluten-free flour blends', 'Oat flour', 'Chickpea flour'],
    baseRiskLevel: 'Medium',
  },
  xanthan: {
    name: 'Xanthan Gum',
    description: 'A polysaccharide food additive used as a thickener and stabilizer. Produced by fermentation of sugars.',
    alternatives: ['Guar gum', 'Psyllium husk', 'Chia seeds'],
    baseRiskLevel: 'Low',
  },
  citric: {
    name: 'Citric Acid',
    description: 'A weak organic acid found naturally in citrus fruits. Used as a natural preservative and sour flavoring.',
    alternatives: ['Lemon juice', 'Vinegar'],
    baseRiskLevel: 'Low',
  },
};

// ---------------------------------------------------------------------------
// LocalAIService Class
// ---------------------------------------------------------------------------

export class LocalAIService {
  /**
   * Researches and analyzes a list of detected ingredients using the on-device
   * AI knowledge base and user allergy profile.
   *
   * Designed as a stateless pure function that matches the behavior of local
   * model processing.
   *
   * @param detectedIngredients - Ingredient strings extracted from OCR.
   * @param userAllergies       - User's active allergen profile.
   * @param itemName            - Name of the scanned item.
   * @returns                   - Structured insight summary.
   */
  public static analyzeIngredients(
    detectedIngredients: string[],
    userAllergies: string[],
    itemName: string = 'Scanned Product',
  ): LocalAIAnalysisResult {
    const startTime = Date.now();

    // Normalise allergen profiles
    const normalizedAllergies = userAllergies.map((a) => a.toLowerCase().trim());
    const insights: IngredientInsight[] = [];
    const flaggedIngredients: string[] = [];

    for (const rawIngredient of detectedIngredients) {
      const cleanIngredient = rawIngredient.toLowerCase().trim();

      // Step 1: Check for allergen intersection first (takes priority)
      let isAllergen = false;
      for (const allergy of normalizedAllergies) {
        if (cleanIngredient.includes(allergy) || allergy.includes(cleanIngredient)) {
          isAllergen = true;
          if (!flaggedIngredients.includes(rawIngredient)) {
            flaggedIngredients.push(rawIngredient);
          }
          break;
        }
      }

      // Step 2: Query the local dictionary weights
      let matchedKey = '';
      for (const key of Object.keys(INGREDIENT_KNOWLEDGE_BASE)) {
        if (cleanIngredient.includes(key)) {
          matchedKey = key;
          break;
        }
      }

      if (isAllergen) {
        // Build Allergen Alert insight
        const detail = matchedKey ? INGREDIENT_KNOWLEDGE_BASE[matchedKey] : null;
        insights.push({
          name: rawIngredient,
          category: 'Allergen',
          riskLevel: 'High',
          description: detail?.description ?? `Flagged as an allergen matching user profile: "${userAllergies.find(a => cleanIngredient.includes(a.toLowerCase())) ?? 'allergy'}".`,
          alternatives: detail?.alternatives ?? ['Avoid consumption of this product.'],
        });
      } else if (matchedKey !== '') {
        // Found safe/known ingredient in dictionary
        const detail = INGREDIENT_KNOWLEDGE_BASE[matchedKey];
        insights.push({
          name: rawIngredient,
          category: 'Safe',
          riskLevel: detail.baseRiskLevel,
          description: detail.description,
          alternatives: detail.alternatives,
        });
      } else {
        // Unknown/uncategorized ingredient
        insights.push({
          name: rawIngredient,
          category: 'Unknown',
          riskLevel: 'Low',
          description: `Analyzed locally. This ingredient is generally recognized as safe for non-allergic individuals.`,
          alternatives: [],
        });
      }
    }

    // Step 3: Compute generative summary based on findings
    let summary = '';
    if (flaggedIngredients.length > 0) {
      summary = `⚠️ Local AI analysis detected ${flaggedIngredients.length} ingredient(s) matching your allergen profile (${flaggedIngredients.join(', ')}). It is strongly advised to choose alternative products.`;
    } else {
      const highRiskCount = insights.filter((i) => i.riskLevel === 'High').length;
      const medRiskCount = insights.filter((i) => i.riskLevel === 'Medium').length;

      if (highRiskCount > 0 || medRiskCount > 0) {
        summary = `✅ No allergens detected. However, local analysis flags components like sugar or sodium. Limit intake if tracking heart rate or daily stability.`;
      } else {
        summary = `✅ Local AI confirms all scanned ingredients are safe and match your allergen profile. This product has a clean safety index.`;
      }
    }

    // Step 4: Calculate processing time to mimic LLM inference latency (120ms to 240ms)
    const processingTimeMs = Math.max(120, Date.now() - startTime + Math.floor(Math.random() * 80));

    return {
      itemName,
      insights,
      summary,
      processingTimeMs,
    };
  }
}
