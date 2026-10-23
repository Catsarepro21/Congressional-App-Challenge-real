import { Platform, NativeModules } from 'react-native';
import { HealthDataService } from './HealthDataService';
import { queryHealth } from './NativeHealthReader';
import { GoogleHealthService } from './GoogleHealthService';
import type { BiometricSummary, HealthConnection, HealthSource } from '../types';

export const HEALTH_SOURCE_NAMES: Record<HealthSource, string> = {
  apple: 'Apple Health', 'health-connect': 'Health Connect',
  'google-health': 'Google Health', 'google-fit': 'Google Fit',
};
export type ProfileSuggestion = {
  name?: string;
  dob?: string;
  bloodType?: string;
  height?: number;
  weight?: number;
};
export interface HealthSyncResult {
  connection: HealthConnection;
  readings: Partial<BiometricSummary> | null;
  profile?: ProfileSuggestion;
  activityRings?: any;
  sleepStages?: any;
  hrvMs?: number;
}
let googleSyncController: AbortController | undefined;
export function cancelGoogleHealthSync(): void {
  googleSyncController?.abort(); googleSyncController = undefined;
}

export async function bounded<T>(operation: Promise<T>, milliseconds = 45000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The health service took too long to respond. Please try again.')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

/** Old adapters use zero for unavailable values; don't replace saved data with an empty response. */
export function readableData(data: Partial<BiometricSummary> | null): Partial<BiometricSummary> | null {
  if (!data || ![data.steps, data.heartRate, data.restingHeartRate, data.sleepMinutes, data.activeCalories].some(value => Number.isFinite(value) && Number(value) > 0)) return null;
  // Replace this reading snapshot when switching providers; never sum cloud/native sources.
  return {
    steps: Number.isFinite(data.steps) ? Math.max(0, data.steps!) : 0,
    activeCalories: Number.isFinite(data.activeCalories) ? Math.max(0, data.activeCalories!) : 0,
    heartRate: Number.isFinite(data.heartRate) ? Math.max(0, data.heartRate!) : 0,
    restingHeartRate: Number.isFinite(data.restingHeartRate) ? Math.max(0, data.restingHeartRate!) : 0,
    sleepMinutes: Number.isFinite(data.sleepMinutes) ? Math.max(0, data.sleepMinutes!) : 0,
    dailyStabilityScore: 0, sleepConsistency: 0, historicalRHR: [],
    readingMetadata: data.readingMetadata || {},
  };
}

export async function syncHealthSource(source: HealthSource, previous?: HealthConnection, customClientId?: string, includeProfile = false): Promise<HealthSyncResult | null> {
  if (source === 'google-health') {
    if (Platform.OS !== 'ios') throw new Error('Google Health is available in the native iPhone app.');
    if ((!previous?.accessToken || previous.consentVersion !== 1) && !includeProfile) throw new Error('Reconnect Google Health to enable imports.');
    if (googleSyncController && !includeProfile) throw new Error('A Google Health import is already in progress.');
    cancelGoogleHealthSync();
    const controller = new AbortController(); googleSyncController = controller;
    try {
      let connection = previous?.consentVersion === 1 ? {...previous} : undefined;
      if (!connection?.accessToken) {
        // Background sync must never launch sign-in or reuse tokens predating explicit consent.
        if (!includeProfile) throw new Error('Reconnect Google Health to enable imports.');
        const tokens = await GoogleHealthService.authorize(customClientId);
        if (!tokens) return null;
        if (controller.signal.aborted) throw new Error('Google Health import canceled.');
        connection = {...tokens, connectedAt:new Date().toISOString(), consentVersion:1};
      }
      let rawData;
      try {rawData = await bounded(GoogleHealthService.fetchFitnessData(connection.accessToken!, undefined, undefined, controller.signal));}
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'UNAUTHENTICATED' || !connection.refreshToken) throw error;
        connection.accessToken = await GoogleHealthService.refreshAccessToken(connection.refreshToken, customClientId, controller.signal);
        rawData = await bounded(GoogleHealthService.fetchFitnessData(connection.accessToken, undefined, undefined, controller.signal));
      }
      const readings = readableData(rawData);
      annotateImport(readings, 'Google Health / Fitbit');
      const importedProfile = includeProfile ? await bounded(GoogleHealthService.fetchProfileData(connection.accessToken!, controller.signal)).catch(() => undefined) : undefined;
      if (controller.signal.aborted) throw new Error('Google Health import canceled.');
      return {connection:{...connection, ...(readings ? {lastSyncedAt:new Date().toISOString()} : {})}, readings,
        profile: importedProfile ? {name:importedProfile.name, dob:importedProfile.dob, height:importedProfile.heightCm, weight:importedProfile.weightKg} : undefined};
    } finally {controller.abort(); if (googleSyncController === controller) googleSyncController = undefined;}
  }
  if (source !== 'apple' && source !== 'health-connect') throw new Error('Google Fit legacy access is disabled. Use Google Health for Fitbit imports.');
  if (source === 'apple' || source === 'health-connect') {
    const expected = source === 'apple' ? 'ios' : 'android';
    if (Platform.OS !== expected) throw new Error(`${HEALTH_SOURCE_NAMES[source]} requires the native ${expected === 'ios' ? 'iPhone' : 'Android'} app.`);
    const allowed = await bounded(source === 'apple' ? HealthDataService.requestHealthPermissions() : HealthDataService.requestHealthConnectPermissions());
    if (!allowed) throw new Error('Health access was not enabled. Check permissions and try again, or continue manually.');
    const rawData = await bounded(source === 'apple' ? HealthDataService.fetchHealthData() : HealthDataService.fetchHealthConnectData());
    const wearable = (rawData as any)?.wearable ?? previous?.wearable;
    const readings = readableData(rawData);
    annotateImport(readings, HEALTH_SOURCE_NAMES[source]);
    let profile: ProfileSuggestion | undefined;
    if (source === 'apple' && includeProfile) {
      const bridge = typeof (HealthDataService as any).getAppleHealthKit === 'function'
        ? (HealthDataService as any).getAppleHealthKit()
        : NativeModules?.AppleHealthKit;
      const [dobRes, bloodRes, heightRes, weightRes] = await Promise.all([
        queryHealth(bridge, 'getDateOfBirth', {}, 5000),
        queryHealth(bridge, 'getBloodType', {}, 5000),
        queryHealth(bridge, 'getLatestHeight', { unit: 'cm' }, 5000),
        queryHealth(bridge, 'getLatestWeight', { unit: 'kg' }, 5000),
      ]);
      const date = typeof dobRes?.value === 'string' ? dobRes.value.slice(0, 10) : undefined;
      const blood = typeof bloodRes?.value === 'string' && bloodRes.value !== 'unknown' ? bloodRes.value : undefined;
      const height = typeof heightRes?.value === 'number' && heightRes.value > 0 ? Math.round(heightRes.value) : undefined;
      const weight = typeof weightRes?.value === 'number' && weightRes.value > 0 ? Math.round(weightRes.value * 10) / 10 : undefined;
      if (date || blood || height || weight) {
        profile = { dob: date, bloodType: blood, height, weight };
      }
    }
    const activityRings = (rawData as any)?.activityRings;
    const sleepStages = (rawData as any)?.sleepStages;
    const hrvMs = (rawData as any)?.hrvMs;
    return {
      readings,
      profile,
      activityRings,
      sleepStages,
      hrvMs,
      connection: {
        ...previous,
        connectedAt: previous?.connectedAt || new Date().toISOString(),
        ...(readings ? { lastSyncedAt: new Date().toISOString() } : {}),
        ...(wearable ? { wearable } : {}),
      },
    };
  }

  return null;
}

function annotateImport(data: Partial<BiometricSummary> | null, source: string): void {
  if (!data) return;
  const importedAt = new Date().toISOString();
  data.readingMetadata = {...data.readingMetadata};
  for (const name of ['steps','activeCalories','heartRate','restingHeartRate','sleepMinutes'] as const) {
    if (!data.readingMetadata[name] && Number(data[name]) > 0) data.readingMetadata[name] = {source, importedAt};
  }
}
