/** AI routing: availability comes from the installed native module, never device-name guesses. */
import { Platform } from 'react-native';
import { LocalAIService } from './LocalAIService';
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
let capabilities: AIDeviceCapabilities = {isOnDeviceSupported:false, isOfflineFoodDBSupported:true,
  unsupportedReason:'Checking native model availability.'};
export function getDeviceCapabilities(): AIDeviceCapabilities { return capabilities; }
export async function refreshDeviceCapabilities(): Promise<AIDeviceCapabilities> {
  let vision = false; let text = false;
  if (Platform.OS === 'ios') {
    try {
      const native = require('../../modules/safescale-vision');
      [vision, text] = await Promise.all([native.isVisionSupportedAsync(), native.isFoundationModelSupportedAsync()]);
    } catch { /* Unlinked modules are unavailable, not simulated. */ }
  }
  capabilities = {isOnDeviceSupported:vision || text, isVisionSupported:vision, isTextGenerationSupported:text,
    runtime:text ? 'apple-foundation' : undefined, isOfflineFoodDBSupported:true,
    unsupportedReason:vision || text ? undefined : Platform.OS === 'ios'
      ? 'Native AI is unavailable. Install the current native build; Apple text generation also requires an available Apple Intelligence model.'
      : 'Native AI is not implemented for this platform. Offline food search and ingredient checks are available.'};
  return capabilities;
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
// Ingredient checks remain deterministic; photo and chat model calls have separate services.

// Unified Public API
// ---------------------------------------------------------------------------

export const AIIntelligenceService = {
  /**
   * Returns runtime capabilities for the current device.
   */
  getCapabilities: getDeviceCapabilities,
  refreshCapabilities: refreshDeviceCapabilities,

  /**
   * Analyze a list of ingredients against the user's allergy profile.
   *
   * Checks extracted text locally for every provider. Photo OCR has its own consent-gated path.
   */
  analyzeIngredients: async (
    provider: AIIntelligenceProvider,
    ingredients: string[],
    allergies: string[],
    itemName: string = 'Scanned Product',
    apiKey?: string,
  ): Promise<LocalAIAnalysisResult> => {
    // Already-extracted ingredient text needs no image upload or model. In particular,
    // never send an empty image URI or silently escalate a local request to cloud.
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
        return 'Use available native photo and text models. Ingredient checks stay offline. Cloud processing is disabled.';
      case 'cloud':
        return 'Cloud processing is disabled in this local-only build.';
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
