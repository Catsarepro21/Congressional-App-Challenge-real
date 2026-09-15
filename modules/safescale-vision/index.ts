/**
 * @file modules/safescale-vision/index.ts
 * @description TypeScript interface for SafeScale native on-device Vision module.
 */

import { Platform } from 'react-native';

export interface VisionClassification {
  identifier: string;
  confidence: number;
}

export interface VisionClassificationResult {
  classifications: VisionClassification[];
  totalObservations: number;
}

interface SafeScaleVisionNativeModule {
  saveWorkoutAsync(id: string, type: string, start: string, end: string, calories: number, distance: number): Promise<boolean>;
  isVisionSupportedAsync(): Promise<boolean>;
  classifyImageAsync(imageUri: string): Promise<VisionClassificationResult>;
  isFoundationModelSupportedAsync(): Promise<boolean>;
  generateTextAsync(prompt: string, context: string): Promise<{ text: string; provider: string; isLocal: boolean }>;
}

let nativeModule: SafeScaleVisionNativeModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireOptionalNativeModule } = require('expo-modules-core');
  if (requireOptionalNativeModule) {
    nativeModule = requireOptionalNativeModule('SafeScaleVision');
  }
} catch {
  // Running in web or test runner without native modules
}

export async function isVisionSupportedAsync(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (!nativeModule) return false;
  try {
    return await nativeModule.isVisionSupportedAsync();
  } catch {
    return false;
  }
}

export async function isFoundationModelSupportedAsync(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (!nativeModule) return false;
  try {
    return await nativeModule.isFoundationModelSupportedAsync();
  } catch {
    return false;
  }
}

export async function generateTextAsync(
  prompt: string,
  context: string,
): Promise<{ text: string; provider: string; isLocal: boolean }> {
  if (!nativeModule) {
    throw new Error('SafeScaleVision native module is not available.');
  }
  return await nativeModule.generateTextAsync(prompt, context);
}

export async function classifyImageAsync(
  imageUri: string,
): Promise<VisionClassificationResult> {
  if (!nativeModule) {
    throw new Error('SafeScaleVision native module is not available in this environment.');
  }
  return await nativeModule.classifyImageAsync(imageUri);
}

export default {
  isVisionSupportedAsync,
  isFoundationModelSupportedAsync,
  generateTextAsync,
  classifyImageAsync,
};

export async function saveWorkoutAsync(id: string, type: string, start: string, end: string, calories: number, distance: number): Promise<boolean> {
  if (Platform.OS !== 'ios' || !nativeModule?.saveWorkoutAsync) return false;
  return nativeModule.saveWorkoutAsync(id,type,start,end,calories,distance);
}
