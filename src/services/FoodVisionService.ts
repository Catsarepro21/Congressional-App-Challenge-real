/**
 * @file src/services/FoodVisionService.ts
 * @description AI-powered food photo analysis service.
 *
 * Routes through the same AI provider the user selected during onboarding:
 *   - 'on-device': Explicitly unavailable until native photo recognition is implemented
 *   - 'cloud':     Google Gemini 2.5 Flash Vision API for high accuracy
 *   - 'opt-out':   Manual entry; this service does not analyze photos offline
 *
 * All modes return a FoodAnalysisResult with identical shape so the UI
 * doesn't need to branch.
 */

import type { AIIntelligenceProvider, FoodAnalysisResult } from '../types';
import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------------------
// Gemini Vision analysis
// ---------------------------------------------------------------------------

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const FOOD_ANALYSIS_PROMPT = `You are a professional nutritionist analyzing a food photo.
Identify the food item(s) in this image and provide a nutritional estimate.

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "foodName": "Name of the food",
  "portionEstimate": "Approximate portion size (e.g. '1 medium burger', '2 cups pasta')",
  "calories": <number>,
  "carbs": <number in grams>,
  "protein": <number in grams>,
  "fat": <number in grams>,
  "fiber": <number in grams>,
  "sugar": <number in grams>,
  "sodium": <number in mg>,
  "confidence": "high" | "medium" | "low",
  "ingredients": ["ingredient1", "ingredient2", ...]
}

Base estimates on standard serving sizes. If multiple foods are visible, estimate the total.
The "ingredients" array should list all identifiable ingredients for allergen cross-checking.
If you cannot identify the food, set foodName to "Unknown Food" and confidence to "low".`;

/**
 * Convert a local image URI to a base64-encoded string for the Gemini API.
 */
const uriToBase64 = async (uri: string): Promise<string> => {
  return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
};

const analyzeWithGemini = async (
  imageUri: string,
  apiKey: string,
): Promise<FoodAnalysisResult> => {
  // Convert image to base64
  const base64Image = await uriToBase64(imageUri);

  // Detect MIME type from URI
  const mimeType = imageUri.toLowerCase().includes('.png')
    ? 'image/png'
    : 'image/jpeg';

  const requestBody = {
    contents: [
      {
        parts: [
          { text: FOOD_ANALYSIS_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    signal: controller.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Photo analysis failed (HTTP ${response.status}). Please try again.`);
  }

  const data = (await response.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Strip any accidental markdown fences
  const jsonText = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonText) as FoodAnalysisResult;

  // Validate the response has required fields
  if (typeof parsed.foodName !== 'string' || !parsed.foodName.trim() || typeof parsed.portionEstimate !== 'string'
      || !['high', 'medium', 'low'].includes(parsed.confidence)
      || ![parsed.calories, parsed.carbs, parsed.protein, parsed.fat, parsed.fiber, parsed.sugar, parsed.sodium].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
      || (parsed.ingredients !== undefined && (!Array.isArray(parsed.ingredients) || !parsed.ingredients.every(x => typeof x === 'string')))) {
    throw new Error('Invalid Gemini response shape');
  }

  return parsed;
  } finally { clearTimeout(timeout); }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const FoodVisionService = {
  /**
   * Analyze a food photo and return nutritional estimates.
   *
   * Routes through the same AI provider the user selected during onboarding:
   *   - 'on-device': Explicitly unavailable
   *   - 'cloud':     Gemini 2.5 Flash Vision API
   *   - 'opt-out':   Explicitly unavailable; use manual entry
   *
   * @param imageUri - Local file URI from expo-camera or expo-image-picker
   * @param provider - The user's AI preference from the store
   * @param apiKey   - Gemini API key (only used when provider is 'cloud')
   */
  analyzeImage: async (
    imageUri: string,
    provider: AIIntelligenceProvider,
    apiKey: string = '',
  ): Promise<FoodAnalysisResult> => {

    if (provider !== 'cloud') {
      throw new Error('Photo recognition is not available offline yet. Use Log meal for manual entry.');
    }
    if (!apiKey.trim()) throw new Error('Add a Gemini API key in Profile to use cloud photo analysis.');
    return analyzeWithGemini(imageUri, apiKey.trim());
  },
};
