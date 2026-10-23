import { offlineFetch as fetch } from './OfflinePolicy';
/**
 * @file src/services/WeeklyReportService.ts
 * @description Generates a weekly health summary report.
 *
 * Two modes:
 *   - Offline (default): Rule-based paragraph assembled from stored metrics.
 *   - Gemini (opt-in): AI-generated narrative from anonymized summary stats.
 *
 * PRIVACY: When Gemini mode is used, only aggregate statistics (averages,
 * totals) are sent — never raw log entries or personal identifiers.
 */

import type { WeeklyReport, BiometricSummary, WeeklyHistoryEntry, LoggedItem, MoodEntry, VitalLogEntry } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const avg = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
};

const fmtHours = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

// ---------------------------------------------------------------------------
// Offline report builder
// ---------------------------------------------------------------------------

const buildOfflineReport = (
  history: WeeklyHistoryEntry[],
  loggedItems: LoggedItem[],
  vitalsLogs: VitalLogEntry[],
  moodLogs: MoodEntry[],
  biometrics: BiometricSummary,
): WeeklyReport => {

  // Restrict every input to the same seven local calendar dates.
  const calendarDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = new Date(), start = new Date(today);
  start.setDate(start.getDate() - 6);
  const first = calendarDate(start), last = calendarDate(today);
  const inWindow = (date?: string) => !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= first && date <= last;
  const entryDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : calendarDate(new Date(value));
  history = history.filter(h => inWindow(h.date));
  loggedItems = loggedItems.filter(x => inWindow(x.date));
  vitalsLogs = vitalsLogs.filter(x => inWindow(entryDate(x.timestamp)));
  moodLogs = moodLogs.filter(x => inWindow(entryDate(x.timestamp)));
  const totalSteps = history.reduce((acc, d) => acc + d.steps, 0);
  const avgSleep = avg(history.map(d => d.sleepMinutes).filter(n => n > 0));
  const avgHR = avg(history.map(d => d.heartRate).filter(n => n > 0));
  const mealsByDay = new Map<string, number>();
  for (const meal of loggedItems.filter(x => x.type === 'Meal')) {
    const match = meal.value.match(/^(\d+(?:\.\d+)?)\s*kcal$/i);
    const calories = meal.calories ?? (match ? Number(match[1]) : NaN);
    if (Number.isFinite(calories) && calories >= 0 && meal.date)
      mealsByDay.set(meal.date, (mealsByDay.get(meal.date) || 0) + calories);
  }
  const avgCalories = avg([...mealsByDay.values()]);
  const glucoseVals = vitalsLogs
    .filter((v) => v.bloodGlucose !== undefined && v.bloodGlucose > 0)
    .map((v) => v.bloodGlucose as number);
  const avgGlucose  = glucoseVals.length > 0 ? avg(glucoseVals) : null;

  const spo2Vals  = vitalsLogs
    .filter((v) => v.spo2 !== undefined && v.spo2 > 0)
    .map((v) => v.spo2 as number);
  const avgSpO2   = spo2Vals.length > 0 ? avg(spo2Vals) : null;

  const moodScores = moodLogs.map((m) => m.rating);
  const avgMood    = moodScores.length > 0 ? avg(moodScores) : 0;
  const moodTrend  =
    avgMood >= 8 ? 'Excellent' :
    avgMood >= 6 ? 'Good' :
    avgMood >= 4 ? 'Fair' : 'Low';

  // Build a human-readable narrative from stats
  const parts: string[] = [];

  if (totalSteps > 0) {
    parts.push(`You logged ${totalSteps.toLocaleString()} steps across ${history.length} saved days in the past seven days.`);
  }

  if (avgSleep > 0) {
    const quality = avgSleep >= 420 ? 'healthy' : avgSleep >= 360 ? 'adequate' : 'below-recommended';
    parts.push(`Your average sleep was ${fmtHours(avgSleep)} per night, which is ${quality}.`);
  }

  if (avgCalories > 0) {
    parts.push(`Your logged meals averaged ${avgCalories} kcal per recorded day across ${mealsByDay.size} days. Unlogged meals are not included.`);
  }

  if (avgGlucose !== null) {
    parts.push(`Recorded blood glucose averaged ${avgGlucose} mg/dL. Meal context may differ between readings.`);
  }

  if (avgSpO2 !== null) {
    const status = avgSpO2 >= 95 ? 'healthy' : 'below normal';
    parts.push(`Your average blood oxygen saturation was ${avgSpO2}%, which is ${status}.`);
  }

  if (avgHR > 0) {
    parts.push(`Average recorded heart rate: ${avgHR} bpm.`);
  }

  if (moodScores.length > 0) {
    parts.push(`Your mood trend this week was ${moodTrend} (avg score: ${avgMood}/10).`);
  }

  if (parts.length === 0) {
    parts.push('Start logging your health data to see a personalized weekly summary here.');
  }

  return {
    generatedAt: new Date().toISOString(),
    avgDailyCalories: avgCalories,
    avgSleepMinutes: avgSleep,
    totalSteps,
    avgRestingHR: avgHR,
    avgBloodGlucose: avgGlucose,
    avgSpO2,
    moodTrend,
    narrative: parts.join(' '),
  };
};

// ---------------------------------------------------------------------------
// Gemini-powered narrative
// ---------------------------------------------------------------------------

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const buildGeminiReport = async (
  stats: Omit<WeeklyReport, 'narrative'>,
  apiKey: string,
): Promise<WeeklyReport> => {
  const statsText = `
- Total steps: ${stats.totalSteps.toLocaleString()}
- Average logged calories per recorded day (may be incomplete): ${stats.avgDailyCalories} kcal
- Average sleep: ${fmtHours(stats.avgSleepMinutes)} per night
- Average recorded heart rate: ${stats.avgRestingHR} bpm
- Average blood glucose: ${stats.avgBloodGlucose !== null ? `${stats.avgBloodGlucose} mg/dL` : 'Not logged'}
- Average SpO2: ${stats.avgSpO2 !== null ? `${stats.avgSpO2}%` : 'Not logged'}
- Mood trend: ${stats.moodTrend}`.trim();

  const prompt = `You are a friendly, encouraging health coach writing a personalized weekly health summary for a user.

Do not diagnose, infer causes, or treat missing or incomplete logs as measured totals. Based on these aggregate health stats from the past 7 days:
${statsText}

Write a concise, encouraging 3-4 sentence paragraph that:
1. Highlights what went well
2. Gently notes any areas to improve
3. Gives one practical tip for next week

Write in second person ("You..."). Be specific and warm, not clinical.`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };

  const narrative = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  return { ...stats, narrative };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let guardRef: typeof import('./CloudPermissionGuard').CloudPermissionGuard | null = null;
function getGuard() {
  if (!guardRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      guardRef = require('./CloudPermissionGuard').CloudPermissionGuard;
    } catch {}
  }
  return guardRef;
}

export const WeeklyReportService = {
  buildOfflineReport,

  /**
   * Generate a weekly health report.
   *
   * @param history - 7-day history entries from the store
   * @param loggedItems - Health logged items from the store
   * @param vitalsLogs - Vitals logs from the store
   * @param moodLogs - Mood logs from the store
   * @param biometrics - Current biometric summary
   * @param useGemini - If true and apiKey is set, uses Gemini for narrative
   * @param apiKey - Gemini API key (only used when useGemini is true)
   */
  generateReport: async (
    history: WeeklyHistoryEntry[],
    loggedItems: LoggedItem[],
    vitalsLogs: VitalLogEntry[],
    moodLogs: MoodEntry[],
    biometrics: BiometricSummary,
    useGemini: boolean,
    apiKey: string = '',
  ): Promise<WeeklyReport> => {
    const baseReport = buildOfflineReport(history, loggedItems, vitalsLogs, moodLogs, biometrics);

    if (useGemini && apiKey.trim().length > 0) {
      const guard = getGuard();
      if (guard) {
        try {
          return await guard.executeWithPermission(
            {
              purpose: 'Generate personalized weekly health summary via Google Gemini Cloud AI',
              endpoint: 'https://generativelanguage.googleapis.com (Gemini 2.5 Flash)',
              dataPayloadSummary: 'Weekly steps, sleep average, heart rate average, and mood trend',
              sensitiveFields: ['Weekly aggregate vitals', 'Mood trend'],
            },
            () => buildGeminiReport(baseReport, apiKey.trim()),
            async () => baseReport,
          );
        } catch (err) {
          console.warn('[WeeklyReportService] Gemini failed or cancelled, using offline report:', err);
          return baseReport;
        }
      } else {
        try {
          return baseReport;
        } catch (err) {
          console.warn('[WeeklyReportService] Gemini failed, using offline report:', err);
        }
      }
    }

    return baseReport;
  },
};
