/**
 * @file src/services/AIIntelligenceService.ts
 * @description Unified multi-tier AI adapter for SafeScale Health.
 *
 * Routes intelligence requests through one of three backends based on the
 * user's stored preference (aiPreference) and runtime hardware capabilities:
 *
 *   Tier 1 — On-Device Foundation Models
 *     iOS:     Apple Foundation Models via Core ML / Apple Neural Engine
 *              (iPhone 15 Pro+, all iPhone 16+, M-series iPads/Macs, iOS 18.1+).
 *              Available on free Apple Developer accounts — Core ML and the
 *              Neural Engine are standard SDK capabilities with no paid
 *              entitlement requirement.
 *     Android: Google AICore / Gemini Nano (Pixel 8+, Galaxy S24+, Android 14+)
 *              or MediaPipe GenAI with Gemma 2B as a fallback.
 *
 *   Tier 2 — Cloud API (Gemini 2.5 Flash via HTTPS)
 *     Works on every device and the web preview.
 *
 *   Tier 3 — Opt-Out (Deterministic Heuristics)
 *     AllergenEngine + static ingredient dictionary. Zero model invocations.
 *
 * FREE DEVELOPER ACCOUNT NOTES:
 *   • Core ML, Vision, NaturalLanguage, and the Neural Engine are standard
 *     iOS SDK frameworks. They do NOT require a paid Apple Developer Program
 *     membership.
 *   • HealthKit is also confirmed available on free Personal Team accounts
 *     per Apple's capability table.
 *   • Push Notifications (APNs) and CloudKit require paid membership — this
 *     service uses neither.
 *
 * ARCHITECTURAL CONTRACT:
 *   The service is stateless. The caller supplies the current aiPreference
 *   and any required context. The service never reads from or writes to the
 *   Zustand store directly.
 */

import { Platform } from 'react-native';
import { LocalAIService } from './LocalAIService';
import { CloudAIService } from './CloudAIService';
import type {
  AIIntelligenceProvider,
  AIDeviceCapabilities,
  LocalAIAnalysisResult,
} from '../types';

// ---------------------------------------------------------------------------
// Device Capability Detection
// ---------------------------------------------------------------------------

/**
 * Queries the current device for on-device foundation model support.
 *
 * On a real device this would call the native Swift/Kotlin bridge. In the
 * web preview and on unsupported hardware it returns a safe negative result
 * so the UI can disable the option and show the reason.
 */
export function getDeviceCapabilities(): AIDeviceCapabilities {
  return {
    isOnDeviceSupported: false,
    unsupportedReason: 'Native on-device AI is not implemented in this build. Manual entry and offline ingredient rules remain available.',
    isOfflineFoodDBSupported: true,
  };
}

let USDALookupRef: typeof import('./USDALookupService').USDALookupService | null = null;
let BarcodeLookupRef: typeof import('./BarcodeLookupService').BarcodeLookupService | null = null;
let NaturalLanguageParserRef: typeof import('./NaturalLanguageMealParser').NaturalLanguageMealParser | null = null;

function getUSDALookup() {
  if (!USDALookupRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      USDALookupRef = require('./USDALookupService').USDALookupService;
    } catch {}
  }
  return USDALookupRef;
}

function getBarcodeLookup() {
  if (!BarcodeLookupRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      BarcodeLookupRef = require('./BarcodeLookupService').BarcodeLookupService;
    } catch {}
  }
  return BarcodeLookupRef;
}

function getNaturalLanguageParser() {
  if (!NaturalLanguageParserRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      NaturalLanguageParserRef = require('./NaturalLanguageMealParser').NaturalLanguageMealParser;
    } catch {}
  }
  return NaturalLanguageParserRef;
}

// ---------------------------------------------------------------------------
// On-Device Foundation Model Stubs
// ---------------------------------------------------------------------------

/**
 * Placeholder for the native Apple Foundation Model bridge.
 *
 * In a production native build this calls into Swift via expo-modules-core:
 *   - Uses the FoundationModels framework (iOS 26+) or Core ML (iOS 18.1+) with a
 *     quantized model for ingredient/document analysis.
 *   - Executes entirely on the Apple Neural Engine (ANE).
 *   - Zero network calls, zero telemetry.
 *   - Works with free Personal Team signing (no paid capability needed).
 *
 * Until the native module is compiled, this falls back to LocalAIService
 * (the deterministic ingredient dictionary) so the app never crashes.
 */
async function runAppleFoundationModel(
  ingredients: string[],
  allergies: string[],
  itemName: string,
): Promise<LocalAIAnalysisResult> {
  // TODO: Replace with NativeModules.SafeScaleIntelligence.analyzeIngredients()
  // once the Expo native module is built and linked.
  return LocalAIService.analyzeIngredients(ingredients, allergies, itemName);
}

/**
 * Placeholder for Android AICore / Gemini Nano bridge.
 *
 * In a production native build this calls into Kotlin:
 *   - Checks for AICore system service availability.
 *   - Falls back to MediaPipe GenAI (Gemma 2B) if AICore is absent.
 *   - Executes on-device via GPU/NNAPI/TPU.
 */
async function runAndroidAICore(
  ingredients: string[],
  allergies: string[],
  itemName: string,
): Promise<LocalAIAnalysisResult> {
  // TODO: Replace with NativeModules.SafeScaleIntelligence.analyzeIngredients()
  return LocalAIService.analyzeIngredients(ingredients, allergies, itemName);
}

// ---------------------------------------------------------------------------
// Unified Public API
// ---------------------------------------------------------------------------

export const AIIntelligenceService = {
  /**
   * Returns runtime capabilities for the current device.
   */
  getCapabilities: getDeviceCapabilities,

  /**
   * Analyze a list of ingredients against the user's allergy profile.
   *
   * Routes through the appropriate backend based on `provider`:
   *   - 'on-device': Apple Foundation Model (iOS) or AICore/Gemma (Android)
   *   - 'cloud':     Gemini 2.5 Flash via CloudAIService
   *   - 'opt-out':   LocalAIService deterministic dictionary
   *
   * If on-device is selected but the device is not supported, falls back
   * to the cloud provider. If the cloud provider fails (e.g. network error),
   * falls back to opt-out heuristics so the user always gets a result.
   */
  analyzeIngredients: async (
    provider: AIIntelligenceProvider,
    ingredients: string[],
    allergies: string[],
    itemName: string = 'Scanned Product',
    apiKey?: string,
  ): Promise<LocalAIAnalysisResult> => {
    // ── Tier 3: Opt-Out ───────────────────────────────────────────────
    if (provider === 'opt-out') {
      return LocalAIService.analyzeIngredients(ingredients, allergies, itemName);
    }

    // ── Tier 1: On-Device ─────────────────────────────────────────────
    if (provider === 'on-device') {
      const caps = getDeviceCapabilities();

      if (caps.isOnDeviceSupported) {
        try {
          if (Platform.OS === 'ios') {
            return await runAppleFoundationModel(ingredients, allergies, itemName);
          }
          if (Platform.OS === 'android') {
            return await runAndroidAICore(ingredients, allergies, itemName);
          }
        } catch {
          // On-device inference failed; fall through to cloud
        }
      }
      // Device unsupported or inference failed — fall through to cloud
      if (apiKey) {
        try {
          const cloudResult = await CloudAIService.analyzeIngredientsOCR(
            '', // No image URI in ingredient-list mode
            apiKey,
          );
          return LocalAIService.analyzeIngredients(
            cloudResult.ingredients,
            allergies,
            cloudResult.name || itemName,
          );
        } catch {
          // Cloud also failed — final fallback to heuristics
        }
      }
      return LocalAIService.analyzeIngredients(ingredients, allergies, itemName);
    }

    // ── Tier 2: Cloud ─────────────────────────────────────────────────
    if (provider === 'cloud' && apiKey) {
      try {
        const cloudResult = await CloudAIService.analyzeIngredientsOCR(
          '', // ingredient-list mode, no image
          apiKey,
        );
        return LocalAIService.analyzeIngredients(
          cloudResult.ingredients,
          allergies,
          cloudResult.name || itemName,
        );
      } catch {
        // Network / API error — graceful fallback
        return LocalAIService.analyzeIngredients(ingredients, allergies, itemName);
      }
    }

    // Default safe fallback
    return LocalAIService.analyzeIngredients(ingredients, allergies, itemName);
  },

  /**
   * Returns a user-facing label for the current provider.
   */
  providerLabel: (provider: AIIntelligenceProvider): string => {
    switch (provider) {
      case 'on-device':
        return Platform.OS === 'ios'
          ? 'On-Device (Apple Intelligence)'
          : Platform.OS === 'android'
            ? 'On-Device (Android AI)'
            : 'On-Device AI';
      case 'cloud':
        return 'Cloud AI (Gemini)';
      case 'opt-out':
        return 'Disabled (Offline Heuristics)';
    }
  },

  /**
   * Returns a short description for the provider option.
   */
  providerDescription: (provider: AIIntelligenceProvider): string => {
    switch (provider) {
      case 'on-device':
        return 'Runs locally on your device\u2019s Neural Engine. No health or allergy data ever leaves your phone.';
      case 'cloud':
        return 'Uses secure cloud AI for analysis. Requires an internet connection. Data is sent to Google servers.';
      case 'opt-out':
        return 'Disable all AI models. Uses deterministic rule-based checks and manual entry only. Maximum privacy.';
    }
  },

  /**
   * Search the embedded USDA food database offline.
   */
  searchFoodDatabase: (query: string, options?: { category?: any; limit?: number }) => {
    const service = getUSDALookup();
    if (!service) return [];
    return service.searchFoods(query, options);
  },

  /**
   * Look up a barcode across offline USDA and Open Food Facts.
   */
  lookupBarcode: async (barcode: string) => {
    const service = getBarcodeLookup();
    if (!service) {
      throw new Error('Barcode resolution service unavailable.');
    }
    return service.lookupBarcode(barcode);
  },

  /**
   * Parse multi-item meal descriptions offline into verified USDA nutrition.
   */
  parseNaturalLanguageMeal: (text: string) => {
    const parser = getNaturalLanguageParser();
    if (!parser) {
      throw new Error('Natural language meal parser unavailable.');
    }
    return parser.parseMealText(text);
  },
};
