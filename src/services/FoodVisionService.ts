import { offlineFetch as fetch } from './OfflinePolicy';
/**
 * @file src/services/FoodVisionService.ts
 * @description AI-powered food photo analysis service with multi-tier routing.
 *
 * Sourcing tiers:
 *   - 'on-device': Checks local USDA database heuristics / offline index, falls back to cloud if key configured
 *   - 'cloud':     Google Gemini 2.5 Flash Vision API for high-accuracy cloud analysis
 *   - 'opt-out':   Manual entry and offline USDA search only; no cloud photo processing
 *
 * All modes return a FoodAnalysisResult with identical shape so the UI doesn't need to branch.
 */

import type { AIIntelligenceProvider, FoodAnalysisResult } from '../types';
import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------------------
// Dynamic USDALookupService reference to support isolated test runners
// ---------------------------------------------------------------------------
let USDALookupServiceRef: typeof import('./USDALookupService').USDALookupService | null = null;
let NativeVisionServiceRef: typeof import('./NativeVisionService').NativeVisionService | null = null;
let NaturalLanguageMealParserRef: typeof import('./NaturalLanguageMealParser').NaturalLanguageMealParser | null = null;

function getUSDAService() {
  if (!USDALookupServiceRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      USDALookupServiceRef = require('./USDALookupService').USDALookupService;
    } catch {
      // Running in an isolated test runner where ./USDALookupService is mocked separately
    }
  }
  return USDALookupServiceRef;
}

function getNativeVisionService() {
  if (!NativeVisionServiceRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      NativeVisionServiceRef = require('./NativeVisionService').NativeVisionService;
    } catch {}
  }
  return NativeVisionServiceRef;
}

function getNaturalLanguageParser() {
  if (!NaturalLanguageMealParserRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      NaturalLanguageMealParserRef = require('./NaturalLanguageMealParser').NaturalLanguageMealParser;
    } catch {}
  }
  return NaturalLanguageMealParserRef;
}

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

let guardRef: typeof import('./CloudPermissionGuard').CloudPermissionGuard | null = null;
function getGuard() {
  if (!guardRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      guardRef = require('./CloudPermissionGuard').CloudPermissionGuard;
    } catch {}
  }
  return guardRef;
}

const analyzeWithGemini = async (
  imageUri: string,
  apiKey: string,
): Promise<FoodAnalysisResult> => {
  const performGeminiCall = async (): Promise<FoodAnalysisResult> => {
    const base64Image = await uriToBase64(imageUri);

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
        maxOutputTokens: 1024,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
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
      if (
        typeof parsed.foodName !== 'string' ||
        !parsed.foodName.trim() ||
        typeof parsed.portionEstimate !== 'string' ||
        !['high', 'medium', 'low'].includes(parsed.confidence) ||
        ![parsed.calories, parsed.carbs, parsed.protein, parsed.fat, parsed.fiber, parsed.sugar, parsed.sodium].every(
          n => typeof n === 'number' && Number.isFinite(n) && n >= 0,
        ) ||
        (parsed.ingredients !== undefined &&
          (!Array.isArray(parsed.ingredients) || !parsed.ingredients.every(x => typeof x === 'string')))
      ) {
        throw new Error('Invalid Gemini response shape');
      }

      parsed.source = 'cloud-gemini';
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  };

  const guard = getGuard();
  if (guard) {
    return await guard.executeWithPermission(
      {
        purpose: 'Analyze food photo nutrition with Google Gemini Cloud Vision',
        endpoint: 'https://generativelanguage.googleapis.com (Gemini 2.5 Flash)',
        dataPayloadSummary: 'Meal photo image pixels (approx. 200 KB)',
        sensitiveFields: ['Camera meal photo'],
      },
      performGeminiCall,
    );
  }

  throw new Error('Cloud consent is unavailable. No data was sent.');
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const FoodVisionService = {
  /**
   * Attempt on-device food identification using filename keywords, visual heuristics,
   * or user meal hints matched against the embedded USDA database.
   */
  analyzeImageOffline: async (
    imageUri: string,
    keywordHint?: string,
  ): Promise<FoodAnalysisResult> => {
    const hint = (keywordHint || '').trim();

    // 1. If user provided a multi-item or natural text description, parse offline
    if (hint) {
      const nlp = getNaturalLanguageParser();
      if (nlp) {
        try {
          return nlp.parseMealText(hint);
        } catch {
          // Fall through to USDA single match
        }
      }

      const usda = getUSDAService();
      if (usda) {
        const matches = usda.searchFoods(hint, { limit: 1 });
        if (matches.length > 0) {
          const res = usda.toFoodAnalysisResult(matches[0].food);
          return {
            ...res,
            source: 'on-device',
            confidence: matches[0].score >= 700 ? 'high' : 'medium',
          };
        }
      }
    }

    // 2. Try on-device Apple Vision pixel classification
    const nativeVision = getNativeVisionService();
    if (nativeVision) {
      try {
        return await nativeVision.classifyAndLookup(imageUri);
      } catch (err: unknown) {
        // If image could not be classified, throw informative message
        if (err instanceof Error && err.message.includes('Apple Vision could not identify')) {
          throw err;
        }
      }
    }

    throw new Error('Photo recognition is not available offline yet. Use the offline USDA Food Search or Log meal for manual entry.');
  },

  /**
   * Analyze a food photo and return nutritional estimates.
   *
   * Routes through the appropriate tier based on user preferences:
   *   - 'on-device': Runs Apple Vision on-device classifier + offline USDA / NLP
   *   - 'cloud':     Gemini 2.5 Flash Vision API
   *   - 'opt-out':   Offline manual entry & USDA search only
   *
   * @param imageUri    - Local file URI from camera or picker
   * @param provider    - The user's AI preference from the store
   * @param apiKey      - Gemini API key (used when provider is 'cloud' or on-device fallback)
   * @param keywordHint - Optional user text hint for on-device matching
   */
  analyzeImage: async (
    imageUri: string,
    provider: AIIntelligenceProvider,
    apiKey: string = '',
    keywordHint?: string,
  ): Promise<FoodAnalysisResult> => {
    if (provider === 'opt-out') {
      throw new Error('Photo recognition is not available offline yet. Use Log meal for manual entry.');
    }

    if (provider === 'on-device') {
      return FoodVisionService.analyzeImageOffline(imageUri, keywordHint);
    }

    // Cloud provider
    throw new Error('Cloud photo analysis is disabled. Select On-Device AI or log the meal manually.');
  },
};
