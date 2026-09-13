import { Platform, NativeModules } from 'react-native';
import { HealthDataService } from './HealthDataService';
import { GoogleFitService } from './GoogleFitService';
import { GoogleHealthService } from './GoogleHealthService';
import { queryHealth } from './NativeHealthReader';
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
  };
}

async function googleProfile(token: string): Promise<ProfileSuggestion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://people.googleapis.com/v1/people/me?personFields=names,birthdays', {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    });
    if (!response.ok) return {};
    const data = await response.json();
    const date = data.birthdays?.find((entry: { date?: { year?: number } }) => entry.date?.year)?.date;
    return {
      name: data.names?.[0]?.displayName,
      dob: date?.year && date?.month && date?.day ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}` : undefined,
    };
  } catch { return {}; } finally { clearTimeout(timer); }
}

export async function syncHealthSource(source: HealthSource, previous?: HealthConnection, customClientId?: string, includeProfile = false): Promise<HealthSyncResult | null> {
  if (source === 'apple' || source === 'health-connect') {
    const expected = source === 'apple' ? 'ios' : 'android';
    if (Platform.OS !== expected) throw new Error(`${HEALTH_SOURCE_NAMES[source]} requires the native ${expected === 'ios' ? 'iPhone' : 'Android'} app.`);
    const allowed = await bounded(source === 'apple' ? HealthDataService.requestHealthPermissions() : HealthDataService.requestHealthConnectPermissions());
    if (!allowed) throw new Error('Health access was not enabled. Check permissions and try again, or continue manually.');
    const rawData = await bounded(source === 'apple' ? HealthDataService.fetchHealthData() : HealthDataService.fetchHealthConnectData());
    const wearable = (rawData as any)?.wearable ?? previous?.wearable;
    const readings = readableData(rawData);
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

  if (Platform.OS !== 'ios') throw new Error('Google account sign-in is currently configured for the native iPhone app. On Android, use Health Connect.');
  const service = source === 'google-fit' ? GoogleFitService : GoogleHealthService;
  let tokens = previous?.accessToken ? { accessToken: previous.accessToken, refreshToken: previous.refreshToken } : await service.authorize(customClientId);
  if (!tokens) return null;
  const read = (token: string) => bounded(source === 'google-fit' ? GoogleFitService.fetchFitnessData(token) : GoogleHealthService.fetchFitnessData(token, null));
  let data: Partial<BiometricSummary>;
  try { data = await read(tokens.accessToken); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'UNAUTHENTICATED') throw error;
    if (tokens.refreshToken) {
      try { tokens = { ...tokens, accessToken: await bounded(service.refreshAccessToken(tokens.refreshToken, customClientId)) }; }
      catch { tokens = await service.authorize(customClientId); }
    } else tokens = await service.authorize(customClientId);
    if (!tokens) return null;
    data = await read(tokens.accessToken);
  }
  const readings = readableData(data);
  return { readings, profile: includeProfile ? await googleProfile(tokens.accessToken) : undefined,
    connection: { ...previous, ...tokens, connectedAt: previous?.connectedAt || new Date().toISOString(), ...(readings ? { lastSyncedAt: new Date().toISOString() } : {}) } };
}
