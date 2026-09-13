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

  type Stage = 'deep' | 'rem' | 'core' | 'awake' | 'unspecified' | 'bed';
  const changes: { at: number; stage: Stage; delta: number }[] = [];
  for (const sample of samples) {
    const start = Date.parse(sample.startDate), end = Date.parse(sample.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const value = String(sample.value).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const stage: Stage | undefined = value.includes('DEEP') || value === '4' ? 'deep'
      : value.includes('REM') || value === '5' ? 'rem'
      : value.includes('CORE') || value.includes('LIGHT') || value === '3' ? 'core'
      : value.includes('AWAKE') || value === '2' ? 'awake'
      : value.includes('INBED') || value === '0' ? 'bed'
      : value.includes('ASLEEP') || value === '1' ? 'unspecified' : undefined;
    if (stage) changes.push({ at: start, stage, delta: 1 }, { at: end, stage, delta: -1 });
  }
  changes.sort((a, b) => a.at - b.at);
  const active = { deep: 0, rem: 0, core: 0, awake: 0, unspecified: 0, bed: 0 };
  const ms = { deep: 0, rem: 0, core: 0, awake: 0, unspecified: 0, bed: 0 };
  let last = changes[0]?.at || 0;
  for (const change of changes) {
    const duration = change.at - last;
    if (active.bed > 0) ms.bed += duration;
    // Union duplicates. Awake wins over sleep; conflicting detailed stages remain unspecified.
    const detailed = (['deep', 'rem', 'core'] as const).filter(stage => active[stage] > 0);
    if (active.awake > 0) ms.awake += duration;
    else if (detailed.length === 1) ms[detailed[0]] += duration;
    else if (detailed.length > 1 || active.unspecified > 0) ms.unspecified += duration;
    active[change.stage] += change.delta;
    last = change.at;
  }
  const minutes = (value: number) => Math.round(value / 60000);
  const total = ms.deep + ms.rem + ms.core + ms.unspecified;
  const bed = Math.max(ms.bed, total + ms.awake);
  const end = changes.length ? new Date(changes[changes.length - 1].at) : undefined;
  return {
    deepMinutes: minutes(ms.deep), remMinutes: minutes(ms.rem), coreMinutes: minutes(ms.core),
    unspecifiedMinutes: minutes(ms.unspecified), awakeMinutes: minutes(ms.awake),
    inBedMinutes: minutes(bed), totalSleepMinutes: minutes(total),
    efficiencyPercent: bed > 0 ? Math.round(total / bed * 100) : 0,
    lastRecordedDate: end ? `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` : undefined,
  };
}

/**
 * Calculates cumulative sleep debt against an 8-hour target over a 7-day rolling window.
 */
export function calculateSleepDebt(
  weeklySleepMinutes: number[],
  targetMinutesPerNight: number = 480,
): SleepDebtData {
  const recorded = weeklySleepMinutes.filter(m => Number.isFinite(m) && m > 0).slice(-7);
  const days = recorded.length;
  const totalActualMinutes = recorded.reduce((sum, m) => sum + m, 0);
  const weeklyAverageMinutes = days ? Math.round(totalActualMinutes / days) : 0;
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
    recommendation: `Using a ${targetWakeTimeStr} wake time and ${targetSleepMinutes / 60}h sleep target, plan to wind down between ${startFmt} and ${endFmt}.`,
  };
}
