/**
 * @file health.ts
 * @description Platform-specific raw payload types for iOS HealthKit and Android
 * Health Connect, plus the normalized internal data structures they map into.
 * Zero usage of `any` — all sensor record shapes are explicitly typed.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED HEALTHKIT QUANTITY TYPE IDENTIFIERS
// ─────────────────────────────────────────────────────────────────────────────

export type HKQuantityTypeIdentifier =
  | 'HKQuantityTypeIdentifierActiveEnergyBurned'
  | 'HKQuantityTypeIdentifierRestingHeartRate'
  | 'HKQuantityTypeIdentifierStepCount'
  | 'HKCategoryTypeIdentifierSleepAnalysis';

export type HKUnit = 'kcal' | 'count' | 'count/min' | 'min';

/**
 * Represents a single raw quantity sample as returned by Apple HealthKit.
 * Each sample is a discrete measurement with a time interval.
 */
export interface HKQuantitySample {
  /** The HealthKit type identifier key for this data point */
  quantityType: HKQuantityTypeIdentifier;
  /** The numeric value of the sample (unit is specified separately) */
  quantity: number;
  /** The unit of measure for the quantity field */
  unit: HKUnit;
  /** ISO 8601 start datetime of the measurement window */
  startDate: string;
  /** ISO 8601 end datetime of the measurement window */
  endDate: string;
  /** Optional source app or device that recorded this sample */
  sourceRevision?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED HEALTH CONNECT RECORD TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type HealthConnectRecordType =
  | 'EnergyExpended'
  | 'HeartRateRecord'
  | 'StepsRecord'
  | 'SleepSessionRecord';

export interface HealthConnectEnergyData {
  /** Total energy in kilocalories */
  kilocalories: number;
}

export interface HealthConnectHeartRateSample {
  /** Heart rate measurement in beats per minute */
  beatsPerMinute: number;
  /** ISO 8601 timestamp for this individual sample */
  time: string;
}

/**
 * Represents a raw record as returned by the Android Health Connect API.
 * Different record types expose different payload shapes.
 */
export interface HealthConnectRecord {
  recordType: HealthConnectRecordType;
  /** ISO 8601 start time of the session or measurement window */
  startTime: string;
  /** ISO 8601 end time of the session or measurement window */
  endTime: string;
  /** Present when recordType === 'EnergyExpended' */
  energy?: HealthConnectEnergyData;
  /** Present when recordType === 'HeartRateRecord'; array of timed samples */
  samples?: HealthConnectHeartRateSample[];
  /** Present when recordType === 'StepsRecord' */
  count?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZED INTERNAL DATA STRUCTURES
// These are the canonical shapes used throughout the SafeScale state layer.
// ─────────────────────────────────────────────────────────────────────────────

export type DataSource = 'HealthKit' | 'HealthConnect' | 'Mock';

/**
 * Unified calorie record — the final internal shape regardless of platform origin.
 * Both `HKQuantityTypeIdentifierActiveEnergyBurned` (iOS)
 * and `EnergyExpended` (Android) normalize into this structure.
 */
export interface NormalizedActivityData {
  /** Platform-agnostic calorie value in kilocalories */
  activeCalories: number;
  /** ISO 8601 timestamp of the measurement (maps to endDate / endTime) */
  timestamp: string;
  /** Indicates which platform produced this record */
  source: DataSource;
}

/**
 * Unified heart rate record, normalized from both platforms.
 */
export interface NormalizedHeartRateData {
  /** Heart rate in beats per minute */
  beatsPerMinute: number;
  /** ISO 8601 timestamp of this reading */
  timestamp: string;
  source: DataSource;
}

/**
 * Unified sleep session record.
 */
export interface NormalizedSleepData {
  /** Total sleep duration in minutes for this session */
  durationMinutes: number;
  /** ISO 8601 start time of the sleep session */
  startTime: string;
  /** ISO 8601 end time of the sleep session */
  endTime: string;
  source: DataSource;
}

/**
 * Aggregate container returned by the HealthDataService
 * after a full background sync cycle.
 */
export interface HealthSyncPayload {
  activeCalories: NormalizedActivityData[];
  heartRateReadings: NormalizedHeartRateData[];
  sleepSessions: NormalizedSleepData[];
  syncedAt: string; // ISO 8601 timestamp of when this sync completed
}
