/**
 * @file src/services/SleepAnalysisService.ts
 * @description Domain logic for Sleep Architecture (Deep, REM, Core, Awake hypnogram),
 * sleep debt computation, and circadian rhythm bedtime window recommendations.
 */

import type { SleepStageBreakdown, SleepDebtData } from '../types';

/**
 * Standard adult target sleep distribution benchmarks (National Sleep Foundation).
 */
export const SLEEP_STAGE_BENCHMARKS = {
  deep: { minPct: 15, maxPct: 25, label: 'Deep (Slow-Wave)' },
  rem: { minPct: 20, maxPct: 25, label: 'REM (Dreaming)' },
  core: { minPct: 45, maxPct: 55, label: 'Core (Light)' },
  awake: { maxPct: 10, label: 'Awake / WASO' },
};

export interface RawSleepSample {
  value: string | number;
  startDate: string;
  endDate: string;
}

/**
 * Parses Apple HealthKit HKCategoryValueSleepAnalysis samples into structured stages.
 */
export function parseSleepStageSamples(samples: RawSleepSample[]): SleepStageBreakdown {
  let deepMs = 0;
  let remMs = 0;
  let coreMs = 0;
  let awakeMs = 0;
  let inBedMs = 0;

  for (const sample of samples) {
    const start = Date.parse(sample.startDate);
    const end = Date.parse(sample.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const duration = end - start;

    const valStr = String(sample.value).toUpperCase();

    if (valStr.includes('DEEP') || sample.value === 4) {
      deepMs += duration;
    } else if (valStr.includes('REM') || sample.value === 5) {
      remMs += duration;
    } else if (valStr.includes('CORE') || valStr.includes('LIGHT') || sample.value === 3 || valStr === 'ASLEEP') {
      coreMs += duration;
    } else if (valStr.includes('AWAKE') || sample.value === 2) {
      awakeMs += duration;
    } else if (valStr.includes('IN_BED') || sample.value === 0) {
      inBedMs += duration;
    }
  }

  const deepMinutes = Math.round(deepMs / (1000 * 60));
  const remMinutes = Math.round(remMs / (1000 * 60));
  const coreMinutes = Math.round(coreMs / (1000 * 60));
  const awakeMinutes = Math.round(awakeMs / (1000 * 60));
  const inBedMinutes = Math.round(inBedMs / (1000 * 60));

  const totalSleepMinutes = deepMinutes + remMinutes + coreMinutes;
  const effectiveInBed = inBedMinutes > totalSleepMinutes ? inBedMinutes : (totalSleepMinutes + awakeMinutes);

  const efficiencyPercent = effectiveInBed > 0
    ? Math.min(100, Math.round((totalSleepMinutes / effectiveInBed) * 100))
    : 85;

  return {
    deepMinutes,
    remMinutes,
    coreMinutes,
    awakeMinutes,
    totalSleepMinutes,
    efficiencyPercent,
    lastRecordedDate: new Date().toISOString().split('T')[0],
  };
}

/**
 * Calculates cumulative sleep debt against an 8-hour target over a 7-day rolling window.
 */
export function calculateSleepDebt(
  weeklySleepMinutes: number[],
  targetMinutesPerNight: number = 480,
): SleepDebtData {
  const days = Math.max(1, weeklySleepMinutes.length);
  const totalActualMinutes = weeklySleepMinutes.reduce((sum, m) => sum + (m || 0), 0);
  const weeklyAverageMinutes = Math.round(totalActualMinutes / days);
  const expectedMinutes = targetMinutesPerNight * days;
  const debtMinutes = totalActualMinutes - expectedMinutes; // Negative = deficit, positive = surplus

  // Compute circadian bedtime recommendation
  const bedtime = calculateCircadianBedtime();

  return {
    targetMinutes: targetMinutesPerNight,
    debtMinutes,
    weeklyAverageMinutes,
    circadianBedtimeWindow: bedtime,
  };
}

/**
 * Calculates the optimal 45-minute circadian bedtime window.
 * Default assumes a typical 7:00 AM wake time unless adjusted.
 */
export function calculateCircadianBedtime(
  targetWakeTimeStr: string = '07:00',
  targetSleepMinutes: number = 480,
): {
  start: string;
  end: string;
  recommendation: string;
} {
  const [wakeHour, wakeMin] = targetWakeTimeStr.split(':').map(Number);
  const wakeTotalMinutes = (wakeHour * 60 + wakeMin + 1440) % 1440;

  // Add 20 minutes for normal sleep latency
  const totalNeededMinutes = targetSleepMinutes + 20;
  const idealBedtimeMinutes = (wakeTotalMinutes - totalNeededMinutes + 1440) % 1440;

  const startWindowMinutes = (idealBedtimeMinutes - 20 + 1440) % 1440;
  const endWindowMinutes = (idealBedtimeMinutes + 25 + 1440) % 1440;

  const fmt = (totalMin: number) => {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const period = h >= 12 && h < 24 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const startFmt = fmt(startWindowMinutes);
  const endFmt = fmt(endWindowMinutes);

  return {
    start: startFmt,
    end: endFmt,
    recommendation: `Based on your circadian rhythm and 8h sleep target, aim to wind down between ${startFmt} and ${endFmt}.`,
  };
}
