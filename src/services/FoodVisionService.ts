/**
 * @file src/services/FoodVisionService.ts
 * @description AI-powered food photo analysis service with multi-tier routing.
 *
 * Sourcing tiers:
 *   - 'on-device': Checks local USDA database heuristics / offline index, never uploads photos
 *   - 'cloud':     Disabled in this local-only build
 *   - 'opt-out':   Manual entry and offline USDA search only; no cloud photo processing
 *
 * All modes return a FoodAnalysisResult with identical shape so the UI doesn't need to branch.
 */

import type { AIIntelligenceProvider, FoodAnalysisResult } from '../types';

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
   *   - 'cloud':     Disabled in this local-only build
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
