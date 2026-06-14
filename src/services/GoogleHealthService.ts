/**
 * @file src/services/GoogleHealthService.ts
 * @description Google Health REST API integration (using Google's OAuth and Health REST v4 endpoints).
 *
 * Uses OAuth 2.0 via expo-web-browser to authenticate the user with their
 * Google account, then queries the Google Health REST API to retrieve:
 * - Profile details (Name, DOB from People API, height, weight from Health API)
 * - Step count (steps today)
 * - Active calories burned (today)
 * - Heart rate samples (last 24h)
 * - Sleep sessions (last 24h)
 */

import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// Google OAuth 2.0 endpoints representing Google Health
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Required OAuth scopes for Google Health and Profile data
const SCOPES = [
  'profile',
  'https://www.googleapis.com/auth/user.birthday.read',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
].join(' ');

export interface GoogleHealthProfileData {
  name?: string;
  dob?: string;
  heightCm?: number;
  weightKg?: number;
}

export interface GoogleHealthFitResult {
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

function generateCodeVerifier(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let verifier = '';
  for (let i = 0; i < 128; i++) {
    verifier += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return verifier;
}

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
    throw new Error(`Google Health token exchange failed: ${err}`);
  }

  const data = await response.json() as { access_token: string; refresh_token?: string };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

// ---------------------------------------------------------------------------
// Google Health API v4 Data Fetchers
// ---------------------------------------------------------------------------

async function fetchHealthDataPoints(
  accessToken: string,
  dataType: string,
  filterExpression: string,
  pageSize = 1000
): Promise<any[]> {
  const url = `https://health.googleapis.com/v4/users/me/dataTypes/${dataType}/dataPoints:reconcile?filter=${encodeURIComponent(filterExpression)}&pageSize=${pageSize}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const err = await response.text();
    console.warn(`[GoogleHealth] API error for ${dataType}: ${err}`);
    if (response.status === 401) {
      throw new Error('UNAUTHENTICATED');
    }
    return [];
  }

  const data = await response.json() as { dataPoints?: any[] };
  return data.dataPoints || [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const GoogleHealthService = {
  CLIENT_ID: Platform.select({
    ios: '386274527686-ou82vu9atibl8ckmlsj37cp7oo9o708b.apps.googleusercontent.com',
    android: '386274527686-ug0ea412sbbg40ska0i4ds7b4qau8ori.apps.googleusercontent.com',
    default: '386274527686-ug0ea412sbbg40ska0i4ds7b4qau8ori.apps.googleusercontent.com'
  }),
  get DEFAULT_CLIENT_ID(): string {
    return GoogleHealthService.CLIENT_ID || '';
  },

  /**
   * Starts the Google OAuth flow using expo-web-browser for Google Health.
   */
  authorize: async (customClientId?: string): Promise<{ accessToken: string; refreshToken?: string } | null> => {
    let clientId = GoogleHealthService.CLIENT_ID || '';
    
    if (customClientId && customClientId.trim() && !customClientId.includes('YOUR_')) {
      clientId = customClientId.trim();
    }

    if (!clientId) {
      throw new Error('NO_CLIENT_ID');
    }

    const finalRedirectUri = Platform.OS === 'android'
      ? 'com.anonymous.safescalehealth:/'
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
      access_type: 'offline',
      prompt: 'consent',
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
    let clientId = GoogleHealthService.CLIENT_ID || '';
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
      throw new Error(`Google Health token refresh failed: ${err}`);
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  },

  /**
   * Fetches today's health metrics from Google cloud using a valid access token.
   */
  fetchFitnessData: async (
    accessToken: string,
    lastSuccessfulSync?: string | null,
    appWorkouts?: any[]
  ): Promise<GoogleHealthFitResult> => {
    const now = Date.now();
    const startMs = now - 24 * 60 * 60 * 1000; // Query last 24h
    const startTimeISO = lastSuccessfulSync ? lastSuccessfulSync : new Date(startMs).toISOString();
    const endTimeISO = new Date(now).toISOString();

    // Calculate local civil calendar dates (today and tomorrow) to bound steps/calories queries
    const localDate = new Date();
    const yyyy = localDate.getFullYear();
    const mm = String(localDate.getMonth() + 1).padStart(2, '0');
    const dd = String(localDate.getDate()).padStart(2, '0');
    const todayDateStr = `${yyyy}-${mm}-${dd}`;

    const tomorrowDate = new Date(localDate.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowYyyy = tomorrowDate.getFullYear();
    const tomorrowMm = String(tomorrowDate.getMonth() + 1).padStart(2, '0');
    const tomorrowDd = String(tomorrowDate.getDate()).padStart(2, '0');
    const tomorrowDateStr = `${tomorrowYyyy}-${tomorrowMm}-${tomorrowDd}`;

    const results: GoogleHealthFitResult = {
      steps: 0,
      activeCalories: 0,
      heartRate: 72,
      restingHeartRate: 65,
      sleepMinutes: 480,
      sleepConsistency: 85,
    };

    // 1. Steps (bounded by civil calendar day OR last sync time if doing delta sync)
    try {
      const stepFilter = lastSuccessfulSync
        ? `steps.interval.start_time > "${lastSuccessfulSync}"`
        : `steps.interval.civil_start_time >= "${todayDateStr}" AND steps.interval.civil_start_time < "${tomorrowDateStr}"`;
      const stepPoints = await fetchHealthDataPoints(
        accessToken,
        'steps',
        stepFilter
      );
      let stepsSum = 0;
      stepPoints.forEach((point) => {
        // Check for overlap with any appWorkout
        let isDuplicate = false;
        if (appWorkouts && appWorkouts.length > 0 && point?.interval?.startTime) {
          const ptStart = new Date(point.interval.startTime).getTime();
          const ptEnd = new Date(point.interval.endTime || point.interval.startTime).getTime();
          
          isDuplicate = appWorkouts.some((workout) => {
            const wStart = new Date(workout.startTime).getTime();
            const wEnd = new Date(workout.endTime).getTime();
            // Overlap: point starts before workout ends and ends after workout starts
            return ptStart < wEnd && ptEnd > wStart;
          });
        }

        if (!isDuplicate && point?.steps?.count) {
          const count = parseInt(point.steps.count, 10);
          if (!isNaN(count)) stepsSum += count;
        }
      });
      results.steps = Math.round(stepsSum);
    } catch (e) {
      console.warn('[GoogleHealth] Steps fetch failed:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    // 2. Active Calories (bounded by civil calendar day OR last sync time)
    try {
      const calorieFilter = lastSuccessfulSync
        ? `active_energy_burned.interval.start_time > "${lastSuccessfulSync}"`
        : `active_energy_burned.interval.civil_start_time >= "${todayDateStr}" AND active_energy_burned.interval.civil_start_time < "${tomorrowDateStr}"`;
      const caloriePoints = await fetchHealthDataPoints(
        accessToken,
        'active-energy-burned',
        calorieFilter
      );
      let caloriesSum = 0;
      caloriePoints.forEach((point) => {
        // Check for overlap with any appWorkout
        let isDuplicate = false;
        if (appWorkouts && appWorkouts.length > 0 && point?.interval?.startTime) {
          const ptStart = new Date(point.interval.startTime).getTime();
          const ptEnd = new Date(point.interval.endTime || point.interval.startTime).getTime();
          
          isDuplicate = appWorkouts.some((workout) => {
            const wStart = new Date(workout.startTime).getTime();
            const wEnd = new Date(workout.endTime).getTime();
            return ptStart < wEnd && ptEnd > wStart;
          });
        }

        if (!isDuplicate && point?.activeEnergyBurned?.kcal) {
          const kcal = parseFloat(point.activeEnergyBurned.kcal);
          if (!isNaN(kcal)) caloriesSum += kcal;
        }
      });
      results.activeCalories = Math.round(caloriesSum);
    } catch (e) {
      console.warn('[GoogleHealth] Calories fetch failed:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    // 3. Heart Rate & Resting Heart Rate
    try {
      const hrPoints = await fetchHealthDataPoints(
        accessToken,
        'heart-rate',
        `heart_rate.sample_time.physical_time >= "${startTimeISO}" AND heart_rate.sample_time.physical_time < "${endTimeISO}"`
      );
      const bpms: number[] = [];
      hrPoints.forEach((point) => {
        if (point?.heartRate?.beatsPerMinute) {
          const bpm = parseInt(point.heartRate.beatsPerMinute, 10);
          if (!isNaN(bpm) && bpm > 30) bpms.push(bpm);
        }
      });

      if (bpms.length > 0) {
        results.heartRate = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
        results.restingHeartRate = Math.round(Math.min(...bpms));
      }

      // Try to query daily-resting-heart-rate for a more accurate resting HR if available
      try {
        const yesterday = new Date(now - 24 * 60 * 60 * 1000);
        const yesterdayDateStr = yesterday.toISOString().split('T')[0];
        const restingHrPoints = await fetchHealthDataPoints(
          accessToken,
          'daily-resting-heart-rate',
          `daily_resting_heart_rate.date >= "${yesterdayDateStr}"`
        );
        if (restingHrPoints && restingHrPoints.length > 0) {
          const latestRestingPoint = restingHrPoints.reduce((latest, current) => {
            const latestDate = latest.dailyRestingHeartRate?.date;
            const currentDate = current.dailyRestingHeartRate?.date;
            if (!latestDate) return current;
            if (!currentDate) return latest;
            const lStr = `${latestDate.year || 0}-${String(latestDate.month || 0).padStart(2, '0')}-${String(latestDate.day || 0).padStart(2, '0')}`;
            const cStr = `${currentDate.year || 0}-${String(currentDate.month || 0).padStart(2, '0')}-${String(currentDate.day || 0).padStart(2, '0')}`;
            return cStr > lStr ? current : latest;
          });

          if (latestRestingPoint?.dailyRestingHeartRate?.beatsPerMinute) {
            const rBpm = parseInt(latestRestingPoint.dailyRestingHeartRate.beatsPerMinute, 10);
            if (!isNaN(rBpm)) {
              results.restingHeartRate = rBpm;
            }
          }
        }
      } catch (rErr) {
        console.warn('[GoogleHealth] Fetching daily resting HR failed, using calculated min:', rErr);
        if (rErr instanceof Error && rErr.message === 'UNAUTHENTICATED') throw rErr;
      }
    } catch (e) {
      console.warn('[GoogleHealth] Heart rate fetch failed:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    // 4. Sleep
    try {
      const sleepPoints = await fetchHealthDataPoints(
        accessToken,
        'sleep',
        `sleep.interval.end_time >= "${startTimeISO}" AND sleep.interval.end_time < "${endTimeISO}"`
      );
      let totalSleepMin = 0;
      sleepPoints.forEach((point) => {
        if (point?.sleep?.summary?.minutesAsleep) {
          const min = parseInt(point.sleep.summary.minutesAsleep, 10);
          if (!isNaN(min)) {
            totalSleepMin += min;
          }
        } else if (point?.sleep?.interval?.startTime && point?.sleep?.interval?.endTime) {
          // Fallback: calculate duration from start and end times
          const start = new Date(point.sleep.interval.startTime).getTime();
          const end = new Date(point.sleep.interval.endTime).getTime();
          if (!isNaN(start) && !isNaN(end)) {
            totalSleepMin += (end - start) / 60000;
          }
        }
      });

      if (totalSleepMin > 0) {
        results.sleepMinutes = Math.round(totalSleepMin);
        results.sleepConsistency = Math.min(100, Math.round((results.sleepMinutes / 480) * 100));
      }
    } catch (e) {
      console.warn('[GoogleHealth] Sleep fetch failed:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    return results;
  },

  /**
   * Fetches the user's name, DOB, height, and weight from Google.
   */
  fetchProfileData: async (accessToken: string): Promise<GoogleHealthProfileData> => {
    const result: GoogleHealthProfileData = {};

    // 1. Fetch Name and DOB using People API
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
        console.warn('[GoogleHealth] People API responded with error:', errText);
        if (response.status === 401) {
          throw new Error('UNAUTHENTICATED');
        }
      }
    } catch (e) {
      console.warn('[GoogleHealth] Error fetching People API profile:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    // 2. Fetch latest height and weight from Google Health API
    const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
    const fiveYearsAgoISO = fiveYearsAgo.toISOString();

    // Height
    try {
      const heightPoints = await fetchHealthDataPoints(
        accessToken,
        'height',
        `height.sample_time.physical_time >= "${fiveYearsAgoISO}"`
      );
      if (heightPoints && heightPoints.length > 0) {
        // Find latest point based on sampleTime.physicalTime
        const latestPoint = heightPoints.reduce((latest, current) => {
          const latestTime = new Date(latest.height?.sampleTime?.physicalTime || 0).getTime();
          const currentTime = new Date(current.height?.sampleTime?.physicalTime || 0).getTime();
          return currentTime > latestTime ? current : latest;
        });
        
        if (latestPoint?.height?.heightMillimeters) {
          const heightMillimeters = parseInt(latestPoint.height.heightMillimeters, 10);
          if (!isNaN(heightMillimeters)) {
            result.heightCm = Math.round(heightMillimeters / 10);
          }
        }
      }
    } catch (e) {
      console.warn('[GoogleHealth] Error processing height:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    // Weight
    try {
      const weightPoints = await fetchHealthDataPoints(
        accessToken,
        'weight',
        `weight.sample_time.physical_time >= "${fiveYearsAgoISO}"`
      );
      if (weightPoints && weightPoints.length > 0) {
        const latestPoint = weightPoints.reduce((latest, current) => {
          const latestTime = new Date(latest.weight?.sampleTime?.physicalTime || 0).getTime();
          const currentTime = new Date(current.weight?.sampleTime?.physicalTime || 0).getTime();
          return currentTime > latestTime ? current : latest;
        });

        if (latestPoint?.weight?.weightGrams) {
          const weightGrams = parseFloat(latestPoint.weight.weightGrams);
          if (!isNaN(weightGrams)) {
            result.weightKg = Math.round(weightGrams / 1000);
          }
        }
      }
    } catch (e) {
      console.warn('[GoogleHealth] Error processing weight:', e);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e;
    }

    return result;
  },
};
