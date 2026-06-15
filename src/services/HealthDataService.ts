/**
 * @file src/services/HealthDataService.ts
 * @description Platform-agnostic health data interoperability bridge.
 *
 * Responsibilities:
 *   1. Define typed stubs for iOS HealthKit and Android Health Connect
 *      native bridge payloads so the TypeScript layer compiles cleanly
 *      without the actual native modules being present.
 *   2. Normalize platform-divergent metric keys into the shared
 *      BiometricSummary schema consumed by the Zustand store.
 *   3. Compute the composite HealthStabilityScore using a mathematically
 *      sound formula that requires a minimum baseline history length of
 *      >= 3 data points before activating variance calculations.
 */

import { Platform } from 'react-native';
import type { BiometricSummary } from '../types';

let AppleHealthKit: any = null;
if (Platform.OS === 'ios') {
  try {
    AppleHealthKit = require('react-native-health').default;
  } catch (e) {
    console.warn('[HealthDataService] Failed to load react-native-health:', e);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Joules-to-kilocalories conversion factor (1 kcal = 4184 J). */
const JOULES_TO_KCAL = 1 / 4184;

/** The target optimal resting heart rate in bpm used as the RHR score anchor. */
const OPTIMAL_RESTING_HR_BPM = 60;

/**
 * Penalty multiplier applied per bpm of deviation from the optimal RHR.
 * Deviation of 40 bpm → 100% penalty (score floor of 0 before sleep weighting).
 */
const RHR_DEVIATION_PENALTY_PER_BPM = 2.5;

/** Weight applied to the RHR score component in the composite formula. */
const WEIGHT_RHR = 0.4;

/** Weight applied to the sleep consistency component in the composite formula. */
const WEIGHT_SLEEP = 0.6;

/**
 * Multiplier applied to the RHR standard deviation to compute the
 * variance penalty subtracted from the composite score.
 */
const VARIANCE_PENALTY_MULTIPLIER = 1.5;

/** Maximum variance penalty that can be deducted from the composite score. */
const MAX_VARIANCE_PENALTY = 15;

/**
 * Minimum number of historical RHR data points required before the
 * variance-based scoring formula is activated.
 * If fewer points are available the function returns INITIAL_SETUP_SCORE.
 */
const MIN_HISTORY_LENGTH = 3;

/**
 * Neutral baseline score returned during the initial setup period when
 * insufficient historical RHR data has been collected.
 */
const INITIAL_SETUP_SCORE = 85;

/**
 * Rolling window size for the historical RHR array.
 * Entries beyond this limit are dropped from the tail.
 */
const MAX_HISTORY_LENGTH = 14;

/** Fallback average heart rate (bpm) when no HR samples are present in payload. */
const FALLBACK_AVERAGE_HR = 72;

/** Fallback resting heart rate (bpm) when no HR samples are present in payload. */
const FALLBACK_RESTING_HR = 65;

/** Default sleep consistency score used when the platform does not supply one. */
const DEFAULT_SLEEP_CONSISTENCY = 80;

// ---------------------------------------------------------------------------
// Platform payload type stubs
// ---------------------------------------------------------------------------

/**
 * Typed stub representing a single sample record as delivered by the
 * iOS HealthKit native bridge (react-native-health or similar adapter).
 *
 * Only the data types relevant to SafeScale Health are enumerated.
 * Additional HK types can be appended to the union as the feature set expands.
 */
export interface AppleHealthKitSample {
  /** The HealthKit quantity/category type identifier string. */
  dataType:
    | 'HKQuantityTypeIdentifierActiveEnergyBurned'
    | 'HKQuantityTypeIdentifierRestingHeartRate'
    | 'HKQuantityTypeIdentifierHeartRate'
    | 'HKCategoryTypeIdentifierSleepAnalysis';
  /**
   * The numeric measurement value.
   * Units are specified by `unit`. Undefined for category types (e.g. sleep).
   */
  quantityValue?: number;
  /**
   * The unit string for the quantityValue.
   * Common values: "kcal", "J", "joules", "count/min", "BPM"
   */
  unit?: string;
  /** ISO 8601 UTC start timestamp of the sample. */
  startDate: string;
  /** ISO 8601 UTC end timestamp of the sample. */
  endDate: string;
  /**
   * Optional sleep value for HKCategoryTypeIdentifierSleepAnalysis.
   * 0 = InBed, 1 = Asleep, 2 = Awake (as per HKCategoryValueSleepAnalysis).
   */
  value?: 0 | 1 | 2;
}

/**
 * Typed stub representing a record as delivered by the Android
 * Health Connect native bridge (react-native-health-connect or similar).
 */
export interface AndroidHealthConnectRecord {
  /** Health Connect record type identifier. */
  recordType: 'EnergyExpended' | 'HeartRate' | 'SleepSession';
  /**
   * Present when recordType === 'EnergyExpended'.
   * Health Connect delivers energy in kilocalories.
   */
  energy?: {
    kilocalories: number;
  };
  /**
   * Present when recordType === 'HeartRate'.
   * Each element is a timestamped bpm measurement within the session.
   */
  samples?: Array<{
    beatsPerMinute: number;
    /** ISO 8601 UTC timestamp for this individual sample. */
    time: string;
  }>;
  /** ISO 8601 UTC start timestamp of the record. */
  startTime: string;
  /** ISO 8601 UTC end timestamp of the record. */
  endTime: string;
}

// ---------------------------------------------------------------------------
// Internal computation helpers (module-private)
// ---------------------------------------------------------------------------

/**
 * Computes the arithmetic mean of a non-empty number array.
 * Callers are responsible for ensuring length > 0.
 */
function computeMean(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/**
 * Computes the **sample** standard deviation (Bessel-corrected, n-1 denominator)
 * of a number array.
 *
 * Formula:
 *   σ = sqrt( Σ(xᵢ - x̄)² / (n - 1) )
 *
 * Requires values.length >= 2. Returns 0 for single-element arrays as a
 * safe fallback (caller guards via MIN_HISTORY_LENGTH).
 */
function computeSampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = computeMean(values);
  const sumSquaredDiffs = values.reduce(
    (acc, v) => acc + Math.pow(v - mean, 2),
    0,
  );
  return Math.sqrt(sumSquaredDiffs / (values.length - 1));
}

/**
 * Computes the RHR score component — a measure of how close the user's
 * current resting heart rate is to the physiologically optimal value.
 *
 * Formula:
 *   RHR_score = max(0, 100 − |restingHeartRate − OPTIMAL_RESTING_HR_BPM| × 2.5)
 *
 * Examples:
 *   RHR = 60 bpm → deviation = 0 → score = 100
 *   RHR = 80 bpm → deviation = 20 → score = 50
 *   RHR = 100 bpm → deviation = 40 → score = 0
 */
function computeRHRScore(restingHeartRate: number): number {
  const deviation = Math.abs(restingHeartRate - OPTIMAL_RESTING_HR_BPM);
  return Math.max(0, 100 - deviation * RHR_DEVIATION_PENALTY_PER_BPM);
}

// ---------------------------------------------------------------------------
// HealthDataService class
// ---------------------------------------------------------------------------

export class HealthDataService {
  // -------------------------------------------------------------------------
  // Calorie Normalization
  // -------------------------------------------------------------------------

  /**
   * Normalizes active calorie data from a single platform-native payload record
   * into a unified kilocalorie value.
   *
   * Key mapping:
   *   iOS HealthKit  → HKQuantityTypeIdentifierActiveEnergyBurned
   *   Android Health → EnergyExpended (delivered in kilocalories directly)
   *
   * Unit handling (iOS):
   *   - "kcal" or "Cal" → value passed through unchanged.
   *   - "J" or "joules" → value × (1/4184) to convert to kcal.
   *   - Any other unit  → treated as kcal (safe default).
   *
   * @param platform - Target platform identifier.
   * @param payload  - Raw sample or record from the native bridge.
   * @returns        - Active calories in kcal, rounded to the nearest integer.
   *                  Returns 0 if the payload type does not carry calorie data.
   */
  public static normalizeActiveCalories(
    platform: 'ios' | 'android',
    payload: AppleHealthKitSample | AndroidHealthConnectRecord,
  ): number {
    if (platform === 'ios') {
      const sample = payload as AppleHealthKitSample;
      if (
        sample.dataType !== 'HKQuantityTypeIdentifierActiveEnergyBurned'
      ) {
        return 0;
      }
      const rawValue = sample.quantityValue ?? 0;
      const unit = (sample.unit ?? 'kcal').toLowerCase();
      if (unit === 'j' || unit === 'joules') {
        return Math.round(rawValue * JOULES_TO_KCAL);
      }
      // Covers "kcal", "Cal", or any unlisted unit — assume kcal.
      return Math.round(rawValue);
    }

    if (platform === 'android') {
      const record = payload as AndroidHealthConnectRecord;
      if (record.recordType !== 'EnergyExpended') {
        return 0;
      }
      return Math.round(record.energy?.kilocalories ?? 0);
    }

    return 0;
  }

  // -------------------------------------------------------------------------
  // Composite Stability Score
  // -------------------------------------------------------------------------

  /**
   * Calculates the composite Health Stability Score as an integer in [1, 100].
   *
   * DATASET SIZE GUARD:
   *   If `historicalRHR.length < MIN_HISTORY_LENGTH (3)`, the function returns
   *   INITIAL_SETUP_SCORE (85) immediately. This prevents artificially perfect
   *   or meaningless scores during the initial onboarding period when only one
   *   or two days of baseline data have been recorded.
   *
   * FORMULA (when history is sufficient):
   *
   *   Step 1 — RHR Score:
   *     rhrScore = max(0, 100 − |restingHeartRate − 60| × 2.5)
   *
   *   Step 2 — Sample Standard Deviation of historicalRHR:
   *     σ = sqrt( Σ(xᵢ − x̄)² / (n − 1) )   [Bessel-corrected]
   *
   *   Step 3 — Variance Penalty:
   *     variancePenalty = min(MAX_VARIANCE_PENALTY, σ × VARIANCE_PENALTY_MULTIPLIER)
   *                     = min(15, σ × 1.5)
   *
   *   Step 4 — Composite Score:
   *     rawScore = (rhrScore × 0.4) + (sleepConsistency × 0.6) − variancePenalty
   *
   *   Step 5 — Clamp to valid range:
   *     stabilityScore = min(100, max(1, round(rawScore)))
   *
   * @param restingHeartRate - Current session's resting heart rate in bpm.
   * @param sleepConsistency - Sleep consistency score in [0, 100].
   * @param historicalRHR    - Rolling array of daily resting heart rate
   *                           recordings (max 14 entries).
   * @returns                - Integer composite score in [1, 100], or 85 if
   *                           dataset is below minimum threshold.
   */
  public static calculateHealthStabilityScore(
    restingHeartRate: number,
    sleepConsistency: number,
    historicalRHR: number[],
  ): number {
    // ── PROTECTIVE GUARD BLOCK ──────────────────────────────────────────────
    // Enforce minimum dataset size before executing variance calculations.
    // Returns a neutral 85 score during initial system setup weeks.
    if (historicalRHR.length < MIN_HISTORY_LENGTH) {
      return INITIAL_SETUP_SCORE;
    }
    // ────────────────────────────────────────────────────────────────────────

    // Step 1: RHR proximity score relative to the 60 bpm optimal baseline.
    const rhrScore = computeRHRScore(restingHeartRate);

    // Step 2: Bessel-corrected sample standard deviation of the historical window.
    const stdDev = computeSampleStdDev(historicalRHR);

    // Step 3: Variance penalty — capped at MAX_VARIANCE_PENALTY points.
    const variancePenalty = Math.min(
      MAX_VARIANCE_PENALTY,
      stdDev * VARIANCE_PENALTY_MULTIPLIER,
    );

    // Step 4: Weighted composite.
    const rawScore =
      rhrScore * WEIGHT_RHR +
      sleepConsistency * WEIGHT_SLEEP -
      variancePenalty;

    // Step 5: Clamp to [1, 100] and return as integer.
    return Math.min(100, Math.max(1, Math.round(rawScore)));
  }

  // -------------------------------------------------------------------------
  // Telemetry Synchronisation
  // -------------------------------------------------------------------------

  /**
   * Processes a raw array of platform-native health records, normalizes all
   * metric keys into the BiometricSummary schema, and returns the resulting
   * partial update object ready to be dispatched to the Zustand store via
   * `updateBiometrics()`.
   *
   * @param platform       - 'ios' | 'android'
   * @param rawSamples     - Array of platform-native health records.
   *                         Typed as AppleHealthKitSample[] on iOS or
   *                         AndroidHealthConnectRecord[] on Android.
   * @param currentHistory - The existing historicalRHR array from the store,
   *                         used to build the updated rolling window.
   * @returns              - Partial<BiometricSummary> ready for store dispatch.
   */
  public static syncTelemetry(
    platform: 'ios' | 'android',
    rawSamples: AppleHealthKitSample[] | AndroidHealthConnectRecord[],
    currentHistory: number[],
  ): Partial<BiometricSummary> {
    let totalActiveCalories = 0;
    const heartRateReadings: number[] = [];
    let totalSleepMinutes = 0;
    // Sleep consistency is derived from platform summary APIs in production.
    // For the simulation phase a fixed baseline is used; replace with a
    // platform-specific API call or persisted nightly calculation in v2.
    const sleepConsistency: number = DEFAULT_SLEEP_CONSISTENCY;

    // ── iOS HealthKit path ───────────────────────────────────────────────────
    if (platform === 'ios') {
      const samples = rawSamples as AppleHealthKitSample[];

      for (const sample of samples) {
        switch (sample.dataType) {
          case 'HKQuantityTypeIdentifierActiveEnergyBurned':
            totalActiveCalories += HealthDataService.normalizeActiveCalories(
              'ios',
              sample,
            );
            break;

          case 'HKQuantityTypeIdentifierHeartRate':
          case 'HKQuantityTypeIdentifierRestingHeartRate':
            if (sample.quantityValue !== undefined) {
              heartRateReadings.push(sample.quantityValue);
            }
            break;

          case 'HKCategoryTypeIdentifierSleepAnalysis':
            // Only count samples where value === 1 (Asleep); skip InBed/Awake.
            if (sample.value === 1) {
              const startMs = new Date(sample.startDate).getTime();
              const endMs = new Date(sample.endDate).getTime();
              const durationMs = endMs - startMs;
              if (durationMs > 0) {
                totalSleepMinutes += Math.round(durationMs / 60_000);
              }
            }
            break;

          // Exhaustive default — future HealthKit types are silently ignored.
          default:
            break;
        }
      }
    }
    // ── Android Health Connect path ──────────────────────────────────────────
    else {
      const records = rawSamples as AndroidHealthConnectRecord[];

      for (const record of records) {
        switch (record.recordType) {
          case 'EnergyExpended':
            totalActiveCalories += HealthDataService.normalizeActiveCalories(
              'android',
              record,
            );
            break;

          case 'HeartRate':
            if (record.samples) {
              for (const sample of record.samples) {
                heartRateReadings.push(sample.beatsPerMinute);
              }
            }
            break;

          case 'SleepSession': {
            const startMs = new Date(record.startTime).getTime();
            const endMs = new Date(record.endTime).getTime();
            const durationMs = endMs - startMs;
            if (durationMs > 0) {
              totalSleepMinutes += Math.round(durationMs / 60_000);
            }
            break;
          }

          default:
            break;
        }
      }
    }

    // ── Derived metrics ──────────────────────────────────────────────────────

    const heartRate =
      heartRateReadings.length > 0
        ? Math.round(computeMean(heartRateReadings))
        : FALLBACK_AVERAGE_HR;

    // Resting HR is approximated as the minimum observed bpm in the session.
    // A more accurate approach would use a dedicated resting-HR HealthKit type;
    // this fallback is appropriate for the current simulation phase.
    const restingHeartRate =
      heartRateReadings.length > 0
        ? Math.min(...heartRateReadings)
        : FALLBACK_RESTING_HR;

    // Append the new resting HR reading and enforce the 14-day rolling window.
    const updatedHistoricalRHR = [
      ...currentHistory,
      restingHeartRate,
    ].slice(-MAX_HISTORY_LENGTH);

    const dailyStabilityScore =
      HealthDataService.calculateHealthStabilityScore(
        restingHeartRate,
        sleepConsistency,
        updatedHistoricalRHR,
      );

    return {
      heartRate,
      restingHeartRate,
      sleepMinutes: totalSleepMinutes,
      sleepConsistency,
      activeCalories: Math.round(totalActiveCalories),
      dailyStabilityScore,
      historicalRHR: updatedHistoricalRHR,
    };
  }

  /**
   * Requests iOS HealthKit permissions.
   */
  public static requestHealthPermissions(): Promise<boolean> {
    return new Promise((resolve) => {
      if (Platform.OS !== 'ios' || !AppleHealthKit) {
        resolve(false);
        return;
      }

      const P = AppleHealthKit.Constants?.Permissions;
      const readPermissions: string[] = [];
      if (P) {
        if (P.Steps) readPermissions.push(P.Steps);
        else if (P.StepCount) readPermissions.push(P.StepCount);

        if (P.HeartRate) readPermissions.push(P.HeartRate);
        if (P.SleepAnalysis) readPermissions.push(P.SleepAnalysis);
        if (P.ActiveEnergyBurned) readPermissions.push(P.ActiveEnergyBurned);
        if (P.RestingHeartRate) readPermissions.push(P.RestingHeartRate);
      }

      if (readPermissions.length === 0) {
        resolve(false);
        return;
      }

      const permissions = {
        permissions: {
          read: readPermissions,
          write: [],
        },
      };

      AppleHealthKit.initHealthKit(permissions, (error: any) => {
        if (error) {
          console.warn('[HealthKit] Permission request failed:', error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Fetches real telemetry data from iOS HealthKit.
   */
  public static fetchHealthData(): Promise<{
    steps: number;
    activeCalories: number;
    heartRate: number;
    restingHeartRate: number;
    sleepMinutes: number;
    sleepConsistency: number;
  } | null> {
    return new Promise((resolve) => {
      if (Platform.OS !== 'ios' || !AppleHealthKit) {
        resolve(null);
        return;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const optionsToday = {
        startDate: todayStart.toISOString(),
        endDate: new Date().toISOString(),
      };

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const options24h = {
        startDate: oneDayAgo.toISOString(),
        endDate: new Date().toISOString(),
      };

      const results = {
        steps: 0,
        activeCalories: 0,
        heartRate: 72,
        restingHeartRate: 65,
        sleepMinutes: 480, // default baseline
        sleepConsistency: 85,
      };

      let pendingQueries = 5;
      const checkDone = () => {
        pendingQueries--;
        if (pendingQueries === 0) {
          resolve(results);
        }
      };

      // 1. Step Count
      if (typeof AppleHealthKit.getStepCount === 'function') {
        AppleHealthKit.getStepCount(optionsToday, (err: any, res: any) => {
          if (!err && res && typeof res.value === 'number') {
            results.steps = Math.round(res.value);
          }
          checkDone();
        });
      } else {
        checkDone();
      }

      // 2. Active Calories
      if (typeof AppleHealthKit.getActiveEnergyBurned === 'function') {
        AppleHealthKit.getActiveEnergyBurned(optionsToday, (err: any, res: any) => {
          if (!err && res) {
            if (Array.isArray(res)) {
              const total = res.reduce((sum: number, sample: any) => sum + (sample.value || 0), 0);
              results.activeCalories = Math.round(total);
            } else if (typeof res.value === 'number') {
              results.activeCalories = Math.round(res.value);
            }
          }
          checkDone();
        });
      } else {
        checkDone();
      }

      // 3. Heart Rate
      if (typeof AppleHealthKit.getHeartRateSamples === 'function') {
        AppleHealthKit.getHeartRateSamples(options24h, (err: any, res: any) => {
          if (!err && res && Array.isArray(res) && res.length > 0) {
            const values = res.map((sample: any) => sample.value).filter((v: number) => typeof v === 'number');
            if (values.length > 0) {
              const average = values.reduce((sum: number, v: number) => sum + v, 0) / values.length;
              results.heartRate = Math.round(average);
            }
          }
          checkDone();
        });
      } else {
        checkDone();
      }

      // 4. Resting Heart Rate
      const fetchRestingHR = () => {
        if (typeof AppleHealthKit.getRestingHeartRateSamples === 'function') {
          AppleHealthKit.getRestingHeartRateSamples(options24h, (err: any, res: any) => {
            if (!err && res && Array.isArray(res) && res.length > 0) {
              const values = res.map((sample: any) => sample.value).filter((v: number) => typeof v === 'number');
              if (values.length > 0) {
                results.restingHeartRate = Math.round(values[values.length - 1]);
                checkDone();
                return;
              }
            }
            fallbackRestingHR();
          });
        } else {
          fallbackRestingHR();
        }
      };

      const fallbackRestingHR = () => {
        if (typeof AppleHealthKit.getHeartRateSamples === 'function') {
          AppleHealthKit.getHeartRateSamples(options24h, (err: any, res: any) => {
            if (!err && res && Array.isArray(res) && res.length > 0) {
              const values = res.map((sample: any) => sample.value).filter((v: number) => typeof v === 'number');
              if (values.length > 0) {
                results.restingHeartRate = Math.min(...values);
              }
            }
            checkDone();
          });
        } else {
          checkDone();
        }
      };

      fetchRestingHR();

      // 5. Sleep Duration
      if (typeof AppleHealthKit.getSleepSamples === 'function') {
        AppleHealthKit.getSleepSamples(options24h, (err: any, res: any) => {
          if (!err && res && Array.isArray(res)) {
            let sleepMs = 0;
            for (const sample of res) {
              const val = String(sample.value).toUpperCase();
              if (val === 'ASLEEP' || val === '1' || sample.value === 1) {
                const start = new Date(sample.startDate).getTime();
                const end = new Date(sample.endDate).getTime();
                if (end > start) {
                  sleepMs += (end - start);
                }
              }
            }
            if (sleepMs > 0) {
              results.sleepMinutes = Math.round(sleepMs / 60000);
            }
          }
          checkDone();
        });
      } else {
        checkDone();
      }
    });
  }

  /**
   * Requests Android Health Connect permissions.
   */
  public static async requestHealthConnectPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      const HealthConnect = require('react-native-health-connect');
      const isInitialized = await HealthConnect.initialize();
      if (!isInitialized) {
        return false;
      }
      const granted = await HealthConnect.requestPermission([
        { accessType: 'read', recordType: 'Steps' },
        { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        { accessType: 'read', recordType: 'HeartRate' },
        { accessType: 'read', recordType: 'RestingHeartRate' },
        { accessType: 'read', recordType: 'SleepSession' },
      ]);
      return Array.isArray(granted) && granted.length > 0;
    } catch (error) {
      console.warn('[HealthConnect] Permission request failed:', error);
      return false;
    }
  }

  /**
   * Fetches real telemetry data from Android Health Connect.
   */
  public static async fetchHealthConnectData(): Promise<{
    steps: number;
    activeCalories: number;
    heartRate: number;
    restingHeartRate: number;
    sleepMinutes: number;
    sleepConsistency: number;
  } | null> {
    if (Platform.OS !== 'android') {
      return null;
    }
    try {
      const HealthConnect = require('react-native-health-connect');
      const isInitialized = await HealthConnect.initialize();
      if (!isInitialized) {
        return null;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const timeFilter = {
        operator: 'between',
        startTime: todayStart.toISOString(),
        endTime: new Date().toISOString(),
      };

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const timeFilter24h = {
        operator: 'between',
        startTime: oneDayAgo.toISOString(),
        endTime: new Date().toISOString(),
      };

      const results = {
        steps: 0,
        activeCalories: 0,
        heartRate: 72,
        restingHeartRate: 65,
        sleepMinutes: 480,
        sleepConsistency: 85,
      };

      // 1. Steps
      try {
        const stepsRes = await HealthConnect.readRecords('Steps', { timeRangeFilter: timeFilter });
        if (stepsRes && Array.isArray(stepsRes.records)) {
          const totalSteps = stepsRes.records.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
          results.steps = Math.round(totalSteps);
        }
      } catch (e) {
        console.warn('[HealthConnect] Failed to read Steps:', e);
      }

      // 2. Active Calories
      try {
        const calRes = await HealthConnect.readRecords('ActiveCaloriesBurned', { timeRangeFilter: timeFilter });
        if (calRes && Array.isArray(calRes.records)) {
          const totalCal = calRes.records.reduce((sum: number, r: any) => {
            const val = r.energy?.value || r.energy?.kilocalories || 0;
            return sum + val;
          }, 0);
          results.activeCalories = Math.round(totalCal);
        }
      } catch (e) {
        console.warn('[HealthConnect] Failed to read ActiveCaloriesBurned:', e);
      }

      // 3. Heart Rate Average
      try {
        const hrRes = await HealthConnect.readRecords('HeartRate', { timeRangeFilter: timeFilter24h });
        if (hrRes && Array.isArray(hrRes.records) && hrRes.records.length > 0) {
          const bpms: number[] = [];
          for (const rec of hrRes.records) {
            if (Array.isArray(rec.samples)) {
              for (const sample of rec.samples) {
                if (typeof sample.beatsPerMinute === 'number') {
                  bpms.push(sample.beatsPerMinute);
                }
              }
            } else if (typeof rec.value === 'number') {
              bpms.push(rec.value);
            }
          }
          if (bpms.length > 0) {
            results.heartRate = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
          }
        }
      } catch (e) {
        console.warn('[HealthConnect] Failed to read HeartRate:', e);
      }

      // 4. Resting Heart Rate
      try {
        const rhrRes = await HealthConnect.readRecords('RestingHeartRate', { timeRangeFilter: timeFilter24h });
        if (rhrRes && Array.isArray(rhrRes.records) && rhrRes.records.length > 0) {
          const lastRecord = rhrRes.records[rhrRes.records.length - 1];
          if (typeof lastRecord.beatsPerMinute === 'number') {
            results.restingHeartRate = Math.round(lastRecord.beatsPerMinute);
          }
        } else {
          // fallback to minimum of heart rate samples
          const hrRes = await HealthConnect.readRecords('HeartRate', { timeRangeFilter: timeFilter24h });
          if (hrRes && Array.isArray(hrRes.records)) {
            const bpms: number[] = [];
            for (const rec of hrRes.records) {
              if (Array.isArray(rec.samples)) {
                for (const sample of rec.samples) {
                  if (typeof sample.beatsPerMinute === 'number') {
                    bpms.push(sample.beatsPerMinute);
                  }
                }
              }
            }
            if (bpms.length > 0) {
              results.restingHeartRate = Math.min(...bpms);
            }
          }
        }
      } catch (e) {
        console.warn('[HealthConnect] Failed to read RestingHeartRate:', e);
      }

      // 5. Sleep Session duration
      try {
        const sleepRes = await HealthConnect.readRecords('SleepSession', { timeRangeFilter: timeFilter24h });
        if (sleepRes && Array.isArray(sleepRes.records) && sleepRes.records.length > 0) {
          let totalSleepMs = 0;
          for (const rec of sleepRes.records) {
            const start = new Date(rec.startTime).getTime();
            const end = new Date(rec.endTime).getTime();
            if (end > start) {
              totalSleepMs += (end - start);
            }
          }
          if (totalSleepMs > 0) {
            results.sleepMinutes = Math.round(totalSleepMs / 60000);
          }
        }
      } catch (e) {
        console.warn('[HealthConnect] Failed to read SleepSession:', e);
      }

      return results;
    } catch (error) {
      console.warn('[HealthConnect] fetchHealthConnectData failed:', error);
      return null;
    }
  }
}
