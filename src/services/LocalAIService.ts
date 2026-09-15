/** Offline dictionary and allergen cross-reference; this is not a language model. */

import type { LocalAIAnalysisResult, IngredientInsight } from '../types';
import { AllergenEngine } from './AllergenEngine';

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

    const ingredients = detectedIngredients.map(value => value.trim()).filter(Boolean);
    const flaggedIngredients = [...AllergenEngine.analyzeIngredients(ingredients, userAllergies, itemName).flaggedIngredients];
    const insights: IngredientInsight[] = [];
    for (const rawIngredient of ingredients) {
      const cleanIngredient = rawIngredient.toLowerCase();
      const isAllergen = flaggedIngredients.includes(rawIngredient);

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
          alternatives: [], // Ingredient matches cannot verify a substitute product's safety.
        });
      } else if (matchedKey !== '') {
        // Found safe/known ingredient in dictionary
        const detail = INGREDIENT_KNOWLEDGE_BASE[matchedKey];
        insights.push({
          name: rawIngredient,
          category: 'Unknown',
          riskLevel: detail.baseRiskLevel,
          description: detail.description,
          alternatives: [],
        });
      } else {
        // Unknown/uncategorized ingredient
        insights.push({
          name: rawIngredient,
          category: 'Unknown',
          riskLevel: 'Low',
          description: 'No reliable entry is available in the offline dictionary. Check the full label and manufacturer information.',
          alternatives: [],
        });
      }
    }

    const summary = flaggedIngredients.length > 0
      ? `Possible allergy matches: ${flaggedIngredients.join(', ')}. Check the full label and avoid suspected allergens.`
      : ingredients.length === 0
        ? 'No ingredients were available to check. Safety cannot be assessed.'
        : 'No matches found for your saved allergies in the provided text. This does not establish safety or rule out missing ingredients or cross-contact.';
    const processingTimeMs = Date.now() - startTime;

    return {
      itemName,
      insights,
      summary,
      processingTimeMs,
    };
  }
}
