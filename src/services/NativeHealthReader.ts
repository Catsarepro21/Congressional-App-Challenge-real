import type { HealthWearableInfo } from '../types';

/** Native callback queries are bounded so a missing bridge cannot hang Sync. */
export async function queryHealth(bridge: any, method: string, options: object, timeoutMs = 10000): Promise<any> {
  if (typeof bridge?.[method] !== 'function') return null;
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      bridge[method](options, (error: unknown, result: unknown) => {
        clearTimeout(timer);
        resolve(error ? null : result);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Merge overlapping sleep stages/sources instead of counting the same time twice. */
export function sleepMinutesFromSamples(samples: any[], start: number, end: number): number {
  const asleep = new Set(['1', '3', '4', '5', 'ASLEEP', 'ASLEEPCORE', 'ASLEEPDEEP', 'ASLEEPREM', 'CORE', 'DEEP', 'REM', 'ASLEEPUNSPECIFIED']);
  const intervals = samples.filter(s => asleep.has(String(s.value).replace(/[_\s]/g, '').toUpperCase()))
    .map(s => [Math.max(start, Date.parse(s.startDate)), Math.min(end, Date.parse(s.endDate))])
    .filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((a,b) => a[0] - b[0]);
  let total = 0, previousEnd = -Infinity;
  for (const [a,b] of intervals) {
    total += Math.max(0, b - Math.max(a, previousEnd));
    previousEnd = Math.max(previousEnd, b);
  }
  return Math.round(total / 60000);
}

/**
 * Detect a wearable (Apple Watch) from HealthKit sample metadata.
 * HealthKit samples carry `sourceName` and `device` properties when
 * sourced from a paired device. iPhones lack PPG sensors, so continuous
 * heart rate and resting heart rate data exclusively originate from an
 * Apple Watch or paired heart-rate monitor.
 */
export function detectWearable(...sampleArrays: any[][]): HealthWearableInfo | undefined {
  const watchKeywords = ['watch', 'apple watch'];
  let latestDate = '';
  let deviceName = '';
  let deviceModel = '';
  for (const samples of sampleArrays) {
    if (!Array.isArray(samples)) continue;
    for (const s of samples) {
      const source = String(s.sourceName || '').toLowerCase();
      const device = String(s.device || '').toLowerCase();
      const combined = `${source} ${device}`;
      if (watchKeywords.some(kw => combined.includes(kw))) {
        const sampleDate = s.endDate || s.startDate || '';
        if (!latestDate || sampleDate > latestDate) latestDate = sampleDate;
        if (!deviceName) deviceName = s.sourceName || 'Apple Watch';
        if (!deviceModel && s.device) deviceModel = String(s.device);
      }
    }
  }
  if (deviceName) {
    return {
      detected: true,
      name: deviceName,
      model: deviceModel || undefined,
      source: 'apple' as const,
      lastSampleAt: latestDate || undefined,
    };
  }
  return undefined;
}

export async function readAppleHealth(bridge: any, now = new Date()) {
  if (typeof bridge?.initHealthKit !== 'function') return null;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const today = { startDate: start.toISOString(), endDate: now.toISOString() };
  const dayStart = now.getTime() - 86400000;
  const recent = { startDate: new Date(dayStart).toISOString(), endDate: now.toISOString(), ascending: false };
  const [steps, energy, hr, rhr, sleep, exercise, stand] = await Promise.all([
    queryHealth(bridge, 'getStepCount', today),
    queryHealth(bridge, 'getActiveEnergyBurned', { ...today, unit: 'kilocalorie' }),
    queryHealth(bridge, 'getHeartRateSamples', { ...recent, unit: 'bpm' }),
    queryHealth(bridge, 'getRestingHeartRateSamples', { ...recent, unit: 'bpm' }),
    queryHealth(bridge, 'getSleepSamples', recent),
    queryHealth(bridge, 'getAppleExerciseTime', { ...today, unit: 'minute' }),
    queryHealth(bridge, 'getAppleStandTime', { ...today, unit: 'minute' }),
  ]);
  const values = (samples: any) => Array.isArray(samples) ? samples.filter(s => Number.isFinite(s.value) && s.value >= 0) : [];
  const hrValues = values(hr).filter(s => s.value > 0);
  const rhrValues = values(rhr).filter(s => s.value > 0).sort((a,b) => Date.parse(b.startDate) - Date.parse(a.startDate));
  const sleepMinutes = sleepMinutesFromSamples(Array.isArray(sleep) ? sleep : [], dayStart, now.getTime());
  if (!(Number.isFinite(steps?.value) && steps.value > 0) && !values(energy).length && !hrValues.length && !rhrValues.length && !sleepMinutes) return null;

  // Detect wearable from sample source metadata
  const wearable = detectWearable(
    Array.isArray(hr) ? hr : [],
    Array.isArray(rhr) ? rhr : [],
    Array.isArray(sleep) ? sleep : [],
  );

  const activeCalories = Math.round(values(energy).reduce((sum,s) => sum + s.value, 0));
  const exerciseMins = Number.isFinite(exercise?.value) && exercise.value >= 0 ? Math.round(exercise.value) : 0;
  const standH = Number.isFinite(stand?.value) && stand.value >= 0 ? Math.min(24, Math.round(stand.value / 60) || Math.round(stand.value)) : 0;

  // Zero means unavailable in the current dashboard schema; never substitute normal vitals.
  return {
    steps: Number.isFinite(steps?.value) && steps.value >= 0 ? Math.round(steps.value) : 0,
    activeCalories,
    heartRate: hrValues.length ? Math.round(hrValues.reduce((sum,s) => sum + s.value, 0) / hrValues.length) : 0,
    restingHeartRate: rhrValues.length ? Math.round(rhrValues[0].value) : 0,
    sleepMinutes,
    // A single night cannot establish sleep consistency.
    sleepConsistency: 0,
    wearable,
    activityRings: {
      moveCalories: activeCalories,
      moveTargetCalories: 600,
      exerciseMinutes: exerciseMins,
      exerciseTargetMinutes: 30,
      standHours: standH,
      standTargetHours: 12,
      lastSyncedAt: now.toISOString(),
    },
  };
}
