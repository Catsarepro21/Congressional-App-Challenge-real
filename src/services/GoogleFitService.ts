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
import { GOOGLE_IOS_CLIENT_ID, createGooglePKCE, googleRedirectUri, validateGoogleCallback } from './GoogleOAuth';

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


/**
 * Exchanges an authorization code for an access token.
 */
async function exchangeCodeForToken(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
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

  const data = await response.json() as { access_token: string; refresh_token?: string };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
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
    if (response.status === 401) {
      throw new Error('UNAUTHENTICATED');
    }
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

/**
 * Robust helper that searches all data sources of a given type and retrieves the sum of all values.
 * Useful if the user has third-party sources (like Fitbit) that write under different package names.
 */
async function fetchSumFromAllSources(
  accessToken: string,
  dataTypeName: string,
  startMs: number,
  endMs: number,
  appWorkouts?: any[]
): Promise<number> {
  try {
    const response = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataSources', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('UNAUTHENTICATED');
      return 0;
    }
    const dsData = await response.json() as { dataSource?: Array<{ dataStreamId: string; dataType: { name: string } }> };
    const sources = (dsData.dataSource || []).filter(ds => ds.dataType.name === dataTypeName);
    
    let sum = 0;
    const startNanos = String(startMs * 1000000);
    const endNanos = String(endMs * 1000000);
 
    for (const source of sources) {
      const streamId = source.dataStreamId;
      const url = `${FITNESS_API_BASE}/dataSources/${streamId}/datasets/${startNanos}-${endNanos}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('UNAUTHENTICATED');
        continue;
      }
      const data = await res.json() as DatasetResponse;
      (data.point || []).forEach((point) => {
        let isDuplicate = false;
        if (appWorkouts && appWorkouts.length > 0 && point.startTimeNanos && point.endTimeNanos) {
          const ptStart = Math.round(parseFloat(point.startTimeNanos) / 1000000);
          const ptEnd = Math.round(parseFloat(point.endTimeNanos) / 1000000);
          isDuplicate = appWorkouts.some((workout) => {
            const wStart = new Date(workout.startTime).getTime();
            const wEnd = new Date(workout.endTime).getTime();
            return ptStart < wEnd && ptEnd > wStart;
          });
        }

        if (!isDuplicate) {
          (point.value || []).forEach((v) => {
            const val = v.intVal !== undefined ? v.intVal : (v.fpVal !== undefined ? v.fpVal : 0);
            sum += val;
          });
        }
      });
    }
    return sum;
  } catch (e) {
      if (e instanceof Error && e.message === "UNAUTHENTICATED") throw e;
    console.warn(`[GoogleFit] fetchSumFromAllSources failed for ${dataTypeName}:`, e);
    return 0;
  }
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
    ios: GOOGLE_IOS_CLIENT_ID,
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
  authorize: async (customClientId?: string): Promise<{ accessToken: string; refreshToken?: string } | null> => {
    // Intercept UI parameters to dodge empty settings configurations
    let clientId = GoogleFitService.CLIENT_ID || '';
    
    if (customClientId && customClientId.trim() && !customClientId.includes('YOUR_')) {
      clientId = customClientId.trim();
    }

    if (!clientId) {
      throw new Error('NO_CLIENT_ID');
    }

    // Android native app client types demand your raw package name with a single trailing slash
    if (Platform.OS !== 'ios') throw new Error('Google browser sign-in is configured for iOS only in this build.');
    const finalRedirectUri = googleRedirectUri(clientId);
    const {verifier: codeVerifier, challenge, state} = await createGooglePKCE();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: finalRedirectUri,
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, finalRedirectUri);

    if (result.type !== 'success' || !result.url) {
      return null;
    }

    const code = validateGoogleCallback(result.url, finalRedirectUri, state);

    const tokens = await exchangeCodeForToken(
      code,
      clientId,
      finalRedirectUri,
      codeVerifier,
    );

    return tokens;
  },

  /**
   * Silently refreshes an expired access token using the stored refresh token.
   */
  refreshAccessToken: async (refreshToken: string, customClientId?: string): Promise<string> => {
    let clientId = GoogleFitService.CLIENT_ID || '';
    if (customClientId && customClientId.trim() && !customClientId.includes('YOUR_')) {
      clientId = customClientId.trim();
    }

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google Fit token refresh failed: ${err}`);
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  },

  fetchFitnessData: async (accessToken: string, appWorkouts?: any[]): Promise<GoogleFitResult> => {
    const now = Date.now();
    const startMs = now - 24 * 60 * 60 * 1000; // Query last 24h to avoid local day/UTC alignment issues
    const last24hStart = now - 24 * 60 * 60 * 1000;
 
    const results: GoogleFitResult = {
      steps: 0,
      activeCalories: 0,
      heartRate: 0,
      restingHeartRate: 0,
      sleepMinutes: 0,
      sleepConsistency: 0,
    };
 
    // 1. Steps
    try {
      let steps = 0;
      const stepsData = await fetchFitnessDataset(accessToken, DATA_TYPE_STEPS, startMs, now);
      (stepsData.point || []).forEach((point) => {
        let isDuplicate = false;
        if (appWorkouts && appWorkouts.length > 0 && point.startTimeNanos && point.endTimeNanos) {
          const ptStart = Math.round(parseFloat(point.startTimeNanos) / 1000000);
          const ptEnd = Math.round(parseFloat(point.endTimeNanos) / 1000000);
          isDuplicate = appWorkouts.some((workout) => {
            const wStart = new Date(workout.startTime).getTime();
            const wEnd = new Date(workout.endTime).getTime();
            return ptStart < wEnd && ptEnd > wStart;
          });
        }

        if (!isDuplicate) {
          (point.value || []).forEach((v) => {
            if (typeof v.intVal === 'number') steps += v.intVal;
          });
        }
      });
 
      if (steps === 0) {
        // Fallback: search all raw/derived data sources for steps
        steps = await fetchSumFromAllSources(accessToken, DATA_TYPE_STEPS, startMs, now, appWorkouts);
      }
      results.steps = Math.round(steps);
    } catch (e) {
      if (e instanceof Error && e.message === "UNAUTHENTICATED") throw e;
      console.warn('[GoogleFit] Steps fetch failed:', e);
    }
 
    // 2. Active Calories
    try {
      let calories = 0;
      const calData = await fetchFitnessDataset(accessToken, DATA_TYPE_CALORIES, startMs, now);
      (calData.point || []).forEach((point) => {
        let isDuplicate = false;
        if (appWorkouts && appWorkouts.length > 0 && point.startTimeNanos && point.endTimeNanos) {
          const ptStart = Math.round(parseFloat(point.startTimeNanos) / 1000000);
          const ptEnd = Math.round(parseFloat(point.endTimeNanos) / 1000000);
          isDuplicate = appWorkouts.some((workout) => {
            const wStart = new Date(workout.startTime).getTime();
            const wEnd = new Date(workout.endTime).getTime();
            return ptStart < wEnd && ptEnd > wStart;
          });
        }

        if (!isDuplicate) {
          (point.value || []).forEach((v) => {
            if (typeof v.fpVal === 'number') calories += v.fpVal;
          });
        }
      });
 
      if (calories === 0) {
        // Fallback: search all raw/derived data sources for calories
        calories = await fetchSumFromAllSources(accessToken, DATA_TYPE_CALORIES, startMs, now, appWorkouts);
      }
      results.activeCalories = Math.round(calories);
    } catch (e) {
      if (e instanceof Error && e.message === "UNAUTHENTICATED") throw e;
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
      if (e instanceof Error && e.message === "UNAUTHENTICATED") throw e;
      console.warn('[GoogleFit] Heart rate fetch failed:', e);
    }

    // 4. Sleep sessions (Google Fit Sessions API)
    try {
      const startTimeISO = new Date(now - 36 * 60 * 60 * 1000).toISOString(); // last 36 hours
      const endTimeISO = new Date(now).toISOString();
      const url = `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${startTimeISO}&endTime=${endTimeISO}&activityType=72`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.status === 401) throw new Error("UNAUTHENTICATED");
      if (res.ok) {
        const data = await res.json() as { session?: Array<{ startTimeMillis: string; endTimeMillis: string }> };
        let totalSleepMin = 0;
        (data.session || []).forEach((s) => {
          const start = parseFloat(s.startTimeMillis);
          const end = parseFloat(s.endTimeMillis);
          if (!isNaN(start) && !isNaN(end)) {
            totalSleepMin += (end - start) / 60_000;
          }
        });
        if (totalSleepMin > 0) {
          results.sleepMinutes = Math.round(totalSleepMin);
          results.sleepConsistency = Math.min(100, Math.round((results.sleepMinutes / 480) * 100));
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message === "UNAUTHENTICATED") throw e;
      console.warn('[GoogleFit] Sleep sessions fetch failed:', e);
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
        const errText = await response.text();
        console.warn('[GoogleFit] People API responded with error:', errText);
        if (response.status === 401) {
          throw new Error('UNAUTHENTICATED');
        }
      }
    } catch (e) {
      console.warn('[GoogleFit] Error fetching People API profile:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    const fetchLatestBodyMetric = async (metricType: 'height' | 'weight'): Promise<number | null> => {
      try {
        const response = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataSources', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          if (response.status === 401) throw new Error('UNAUTHENTICATED');
          return null;
        }
        
        const dsData = await response.json() as { dataSource?: Array<{ dataStreamId: string; dataType: { name: string } }> };
        const targetType = metricType === 'height' ? 'com.google.height' : 'com.google.weight';
        const sources = (dsData.dataSource || []).filter(ds => ds.dataType.name === targetType);
        if (sources.length === 0) return null;

        let latestVal: number | null = null;
        let latestTimeNanos = 0;

        const nowMs = Date.now();
        const startMs = nowMs - 5 * 365 * 24 * 60 * 60 * 1000; // query last 5 years
        const startNanos = String(startMs * 1000000);
        const endNanos = String(nowMs * 1000000);

        for (const source of sources) {
          const streamId = source.dataStreamId;
          const url = `${FITNESS_API_BASE}/dataSources/${streamId}/datasets/${startNanos}-${endNanos}`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          if (!res.ok) {
            if (res.status === 401) throw new Error('UNAUTHENTICATED');
            continue;
          }
          const data = await res.json() as DatasetResponse;
          if (data.point && data.point.length > 0) {
            const lastPoint = data.point[data.point.length - 1];
            const pointTime = parseFloat(lastPoint.endTimeNanos || lastPoint.startTimeNanos || '0');
            if (pointTime > latestTimeNanos) {
              if (lastPoint.value && lastPoint.value.length > 0) {
                const val = lastPoint.value[0];
                const numVal = val.fpVal !== undefined ? val.fpVal : (val.intVal !== undefined ? val.intVal : null);
                if (numVal !== null) {
                  latestVal = numVal;
                  latestTimeNanos = pointTime;
                }
              }
            }
          }
        }
        return latestVal;
      } catch (err) {
        console.warn(`[GoogleFit] Failed to fetch body metric ${metricType}:`, err);
        if (err instanceof Error && err.message === 'UNAUTHENTICATED') throw err;
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
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    try {
      const weight = await fetchLatestBodyMetric('weight');
      if (weight) {
        result.weightKg = Math.round(weight);
      }
    } catch (e) {
      console.warn('[GoogleFit] Error processing weight:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    return result;
  },
};