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
  const totalSteps = history.reduce((acc, d) => acc + d.steps, 0);
  const avgSleep   = avg(history.map((d) => d.sleepMinutes));
  const avgHR      = avg(history.map((d) => d.heartRate));

  const calorieEntries = loggedItems
    .filter((item) => item.type === 'Meal')
    .map((item) => {
      const match = item.value.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    });
  const avgCalories = avg(calorieEntries);

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
    const goal = 70000; // 10k/day × 7
    const pct  = Math.round((totalSteps / goal) * 100);
    parts.push(
      `You logged ${totalSteps.toLocaleString()} steps this week — ${pct}% of the recommended 70,000 step weekly goal.`
    );
  }

  if (avgSleep > 0) {
    const quality = avgSleep >= 420 ? 'healthy' : avgSleep >= 360 ? 'adequate' : 'below-recommended';
    parts.push(`Your average sleep was ${fmtHours(avgSleep)} per night, which is ${quality}.`);
  }

  if (avgCalories > 0) {
    parts.push(`You consumed an average of ${avgCalories} kcal per day based on your food logs.`);
  }

  if (avgGlucose !== null) {
    const status = avgGlucose < 100 ? 'normal fasting range' : avgGlucose < 126 ? 'prediabetic range' : 'elevated range';
    parts.push(`Your average blood glucose was ${avgGlucose} mg/dL, which is in the ${status}.`);
  }

  if (avgSpO2 !== null) {
    const status = avgSpO2 >= 95 ? 'healthy' : 'below normal';
    parts.push(`Your average blood oxygen saturation was ${avgSpO2}%, which is ${status}.`);
  }

  if (avgHR > 0) {
    parts.push(`Average resting heart rate: ${avgHR} bpm.`);
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
- Average daily calories consumed: ${stats.avgDailyCalories} kcal
- Average sleep: ${fmtHours(stats.avgSleepMinutes)} per night
- Average resting heart rate: ${stats.avgRestingHR} bpm
- Average blood glucose: ${stats.avgBloodGlucose !== null ? `${stats.avgBloodGlucose} mg/dL` : 'Not logged'}
- Average SpO2: ${stats.avgSpO2 !== null ? `${stats.avgSpO2}%` : 'Not logged'}
- Mood trend: ${stats.moodTrend}`.trim();

  const prompt = `You are a friendly, encouraging health coach writing a personalized weekly health summary for a user.

Based on these anonymized health stats from the past 7 days:
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

export const WeeklyReportService = {
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
      try {
        return await buildGeminiReport(baseReport, apiKey.trim());
      } catch (err) {
        console.warn('[WeeklyReportService] Gemini failed, using offline report:', err);
      }
    }

    return baseReport;
  },
};
