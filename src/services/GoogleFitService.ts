/**
 * @file src/services/GoogleFitService.ts
 * @description Google Fit REST API integration for Android and iOS.
 *
 * Uses OAuth 2.0 via expo-web-browser to authenticate the user with their
 * Google account, then queries the Google Fitness REST API to retrieve:
 * - Step count (steps today)
 * - Active calories burned (today)
 * - Heart rate samples (last 24h)
 * - Sleep sessions (last 24h)
 *
 * This enables users who have Fitbit, Garmin, Polar, or any other
 * device that syncs to Google Fit to read their data in SafeScale Health.
 */

import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// Google OAuth 2.0 endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Google Fitness API base URL
const FITNESS_API_BASE = 'https://www.googleapis.com/fitness/v1/users/me';

// Required OAuth scopes for Fitness and Profile data
const SCOPES = [
  'profile',
  'https://www.googleapis.com/auth/user.birthday.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
].join(' ');

// Google Fitness data source type IDs
const DATA_TYPE_STEPS = 'com.google.step_count.delta';
const DATA_TYPE_CALORIES = 'com.google.calories.expended';
const DATA_TYPE_HEART_RATE = 'com.google.heart_rate.bpm';
const DATA_TYPE_SLEEP = 'com.google.sleep.segment';

export interface GoogleFitResult {
  steps: number;
  activeCalories: number;
  heartRate: number;
  restingHeartRate: number;
  sleepMinutes: number;
  sleepConsistency: number;
}

// ---------------------------------------------------------------------------
// OAuth Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a random code verifier and code challenge for PKCE OAuth flow.
 * This is required for installed app OAuth flows (no client secret).
 */
function generateCodeVerifier(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let verifier = '';
  for (let i = 0; i < 128; i++) {
    verifier += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return verifier;
}

/**
 * Exchanges an authorization code for an access token.
 */
async function exchangeCodeForToken(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Fitness API Data Fetchers
// ---------------------------------------------------------------------------

interface DatasetResponse {
  point?: Array<{
    value?: Array<{ intVal?: number; fpVal?: number }>;
    startTimeNanos?: string;
    endTimeNanos?: string;
  }>;
}

async function fetchFitnessDataset(
  accessToken: string,
  dataTypeName: string,
  startMs: number,
  endMs: number,
): Promise<DatasetResponse> {
  const url = `${FITNESS_API_BASE}/dataset:aggregate`;

  const body = {
    aggregateBy: [{ dataTypeName }],
    bucketByTime: { durationMillis: String(endMs - startMs) },
    startTimeMillis: String(startMs),
    endTimeMillis: String(endMs),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Fitness API error for ${dataTypeName}: ${err}`);
  }

  const data = await response.json() as {
    bucket?: Array<{ dataset?: Array<{ point?: DatasetResponse['point'] }> }>;
  };

  const points: DatasetResponse['point'] = [];
  (data.bucket || []).forEach((bucket) => {
    (bucket.dataset || []).forEach((dataset) => {
      (dataset.point || []).forEach((point) => points.push(point));
    });
  });

  return { point: points };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GoogleProfileData {
  name?: string;
  dob?: string;
  heightCm?: number;
  weightKg?: number;
}

export const GoogleFitService = {
  /**
   * Hardcoded OAuth 2.0 Client IDs assigned dynamically by target environment.
   */
  CLIENT_ID: Platform.select({
    ios: '386274527686-ou82vu9atibl8ckmlsj37cp7oo9o708b.apps.googleusercontent.com',
    android: '386274527686-ug0ea412sbbg40ska0i4ds7b4qau8ori.apps.googleusercontent.com',
    default: '386274527686-ug0ea412sbbg40ska0i4ds7b4qau8ori.apps.googleusercontent.com'
  }),
  get DEFAULT_CLIENT_ID(): string {
    return GoogleFitService.CLIENT_ID || '';
  },

  /**
   * Starts the Google OAuth flow using expo-web-browser.
   * Returns an access token if successful, null if cancelled.
   */
  authorize: async (customClientId?: string): Promise<string | null> => {
    // Intercept UI parameters to dodge empty settings configurations
    let clientId = GoogleFitService.CLIENT_ID;
    
    if (customClientId && customClientId.trim() && !customClientId.includes('YOUR_')) {
      clientId = customClientId.trim();
    }

    if (!clientId) {
      throw new Error('NO_CLIENT_ID');
    }

    // Android requires a localhost loopback channel for secure external sessions
    const finalRedirectUri = Platform.OS === 'android'
      ? 'https://localhost'
      : 'com.anonymous.safescalehealth://oauth2';

    const codeVerifier = generateCodeVerifier();
    const state = Math.random().toString(36).slice(2);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: finalRedirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeVerifier, 
      code_challenge_method: 'plain',
      access_type: 'online',
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, finalRedirectUri);

    if (result.type !== 'success' || !result.url) {
      return null;
    }

    const returnedUrl = new URL(result.url);
    const code = returnedUrl.searchParams.get('code');
    if (!code) {
      throw new Error('No authorization code in redirect URL');
    }

    const accessToken = await exchangeCodeForToken(
      code,
      clientId,
      finalRedirectUri,
      codeVerifier,
    );

    return accessToken;
  },

  /**
   * Fetches today's health metrics from Google Fit using a valid access token.
   */
  fetchFitnessData: async (accessToken: string): Promise<GoogleFitResult> => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const startMs = todayStart.getTime();
    const last24hStart = now - 24 * 60 * 60 * 1000;

    const results: GoogleFitResult = {
      steps: 0,
      activeCalories: 0,
      heartRate: 72,
      restingHeartRate: 65,
      sleepMinutes: 480,
      sleepConsistency: 85,
    };

    // 1. Steps (today)
    try {
      const stepsData = await fetchFitnessDataset(accessToken, DATA_TYPE_STEPS, startMs, now);
      let totalSteps = 0;
      (stepsData.point || []).forEach((point) => {
        (point.value || []).forEach((v) => {
          if (typeof v.intVal === 'number') totalSteps += v.intVal;
        });
      });
      results.steps = Math.round(totalSteps);
    } catch (e) {
      console.warn('[GoogleFit] Steps fetch failed:', e);
    }

    // 2. Active Calories (today)
    try {
      const calData = await fetchFitnessDataset(accessToken, DATA_TYPE_CALORIES, startMs, now);
      let totalCal = 0;
      (calData.point || []).forEach((point) => {
        (point.value || []).forEach((v) => {
          if (typeof v.fpVal === 'number') totalCal += v.fpVal;
        });
      });
      results.activeCalories = Math.round(totalCal);
    } catch (e) {
      console.warn('[GoogleFit] Calories fetch failed:', e);
    }

    // 3. Heart Rate (last 24h)
    try {
      const hrData = await fetchFitnessDataset(accessToken, DATA_TYPE_HEART_RATE, last24hStart, now);
      const bpms: number[] = [];
      (hrData.point || []).forEach((point) => {
        (point.value || []).forEach((v) => {
          if (typeof v.fpVal === 'number' && v.fpVal > 30) bpms.push(v.fpVal);
        });
      });
      if (bpms.length > 0) {
        results.heartRate = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
        results.restingHeartRate = Math.round(Math.min(...bpms));
      }
    } catch (e) {
      console.warn('[GoogleFit] Heart rate fetch failed:', e);
    }

    // 4. Sleep (last 24h)
    try {
      const sleepData = await fetchFitnessDataset(accessToken, DATA_TYPE_SLEEP, last24hStart, now);
      let totalSleepMs = 0;
      (sleepData.point || []).forEach((point) => {
        const isSleep = (point.value || []).some(
          (v) => v.intVal !== undefined && [1, 4, 5, 6].includes(v.intVal),
        );
        if (isSleep) {
          const startNs = parseInt(point.startTimeNanos || '0', 10);
          const endNs = parseInt(point.endTimeNanos || '0', 10);
          totalSleepMs += (endNs - startNs) / 1_000_000;
        }
      });
      if (totalSleepMs > 0) {
        results.sleepMinutes = Math.round(totalSleepMs / 60_000);
        results.sleepConsistency = Math.min(100, Math.round((results.sleepMinutes / 420) * 100));
      }
    } catch (e) {
      console.warn('[GoogleFit] Sleep fetch failed:', e);
    }

    return results;
  },

  /**
   * Fetches the user's name, DOB, height, and weight from Google.
   */
  fetchProfileData: async (accessToken: string): Promise<GoogleProfileData> => {
    const result: GoogleProfileData = {};

    try {
      const response = await fetch(
        'https://people.googleapis.com/v1/people/me?personFields=names,birthdays',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.names && data.names.length > 0) {
          result.name = data.names[0].displayName;
        }
        if (data.birthdays && data.birthdays.length > 0) {
          const bday = data.birthdays.find((b: any) => b.date);
          if (bday && bday.date) {
            const { year, month, day } = bday.date;
            if (year && month && day) {
              const mm = String(month).padStart(2, '0');
              const dd = String(day).padStart(2, '0');
              result.dob = `${year}-${mm}-${dd}`;
            }
          }
        }
      } else {
        console.warn('[GoogleFit] People API responded with error:', await response.text());
      }
    } catch (e) {
      console.warn('[GoogleFit] Error fetching People API profile:', e);
    }

    const fetchLatestBodyMetric = async (metricType: 'height' | 'weight'): Promise<number | null> => {
      try {
        const nowMs = Date.now();
        const startMs = nowMs - 5 * 365 * 24 * 60 * 60 * 1000;
        const startNanos = startMs * 1_000_000;
        const endNanos = nowMs * 1_000_000;

        const streamId = metricType === 'height'
          ? 'derived:com.google.height:com.google.android.gms:merge_height'
          : 'derived:com.google.weight:com.google.android.gms:merge_weight';

        const url = `${FITNESS_API_BASE}/dataSources/${streamId}/datasets/${startNanos}-${endNanos}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.warn(`[GoogleFit] Fitness API dataSource error for ${metricType}:`, await response.text());
          return null;
        }

        const data = await response.json() as DatasetResponse;
        if (data.point && data.point.length > 0) {
          const lastPoint = data.point[data.point.length - 1];
          if (lastPoint.value && lastPoint.value.length > 0) {
            const val = lastPoint.value[0];
            return val.fpVal !== undefined ? val.fpVal : (val.intVal !== undefined ? val.intVal : null);
          }
        }
      } catch (err) {
        console.warn(`[GoogleFit] Failed to fetch body metric ${metricType}:`, err);
      }
      return null;
    };

    try {
      const height = await fetchLatestBodyMetric('height');
      if (height) {
        result.heightCm = height < 3 ? Math.round(height * 100) : Math.round(height);
      }
    } catch (e) {
      console.warn('[GoogleFit] Error processing height:', e);
    }

    try {
      const weight = await fetchLatestBodyMetric('weight');
      if (weight) {
        result.weightKg = Math.round(weight);
      }
    } catch (e) {
      console.warn('[GoogleFit] Error processing weight:', e);
    }

    return result;
  },
};