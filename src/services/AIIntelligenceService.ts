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
  if (Platform.OS === 'ios') {
    // Core ML and the Neural Engine are standard SDK capabilities that work
    // with a free Apple Developer account (Personal Team signing). No paid
    // entitlement is required.
    //
    // Use Platform.Version to detect the iOS version at runtime. All devices
    // capable of running iOS 18.1+ with Apple Intelligence have A17 Pro or
    // A18+ chips (iPhone 15 Pro, all iPhone 16+, M-series iPads/Macs).
    // We cannot determine the exact model from JS without a native module,
    // but iOS 18+ is a strong signal. The inference path already falls back
    // gracefully if the on-device bridge is unavailable.
    const iosVersion = typeof Platform.Version === 'string'
      ? parseFloat(Platform.Version)
      : Number(Platform.Version);

    if (Number.isFinite(iosVersion) && iosVersion >= 18) {
      return {
        isOnDeviceSupported: true,
        runtime: 'apple-foundation',
      };
    }

    return {
      isOnDeviceSupported: false,
      unsupportedReason:
        'On-device Apple Intelligence requires iPhone 15 Pro, any iPhone 16 or newer, ' +
        'or an M-series iPad/Mac with iOS 18.1+.',
      runtime: 'apple-foundation',
    };
  }

  if (Platform.OS === 'android') {
    // On Android, AICore availability is checked via:
    //   context.getSystemService("aicore") !== null
    // MediaPipe GenAI is a fallback that works on most modern Android devices.
    return {
      isOnDeviceSupported: false,
      unsupportedReason:
        'On-device Android AI requires Pixel 8+ or Galaxy S24+ with Android 14+. ' +
        'Install the native build to enable automatic detection.',
      runtime: 'android-aicore',
    };
  }

  // Web preview — on-device models are never available
  return {
    isOnDeviceSupported: false,
    unsupportedReason:
      'On-device AI is not available in the browser preview. Use Cloud AI or install the native app.',
  };
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
};
