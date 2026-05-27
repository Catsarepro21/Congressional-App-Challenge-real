/**
 * @file state.ts
 * @description Strict TypeScript interface definitions for all SafeScale Health global state domains.
 * All types are fully typed with zero usage of `any`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// MEDICATION DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

export type MedicationStatus = 'Completed' | 'Active' | 'Pending';

export type MedicationIcon =
  | 'pill'
  | 'syringe'
  | 'droplet'
  | 'capsule'
  | 'inhaler'
  | 'tablet'
  | 'patch';

export interface MedicationItem {
  /** Unique identifier for this medication entry (nanoid or UUID) */
  id: string;
  /** Human-readable drug name */
  name: string;
  /** Dosage string, e.g., "500mg", "2 puffs", "10ml" */
  dosage: string;
  /** Scheduled intake time in 24h format "HH:mm", e.g., "08:00" */
  time: string;
  /** Lifecycle state of this medication entry for today */
  status: MedicationStatus;
  /** Icon identifier key mapped to a UI icon component */
  icon: MedicationIcon;
  /** ISO 8601 timestamp recorded when status transitions to 'Completed' */
  takenAt?: string;
  /** Optional short notes for the user (e.g., "take with food") */
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BIOMETRIC DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

export interface BiometricSummary {
  /** Instantaneous heart rate in beats per minute (bpm) */
  heartRate: number;
  /** Total sleep duration in minutes for the last recorded night */
  sleepMinutes: number;
  /** Total step count for today */
  steps: number;
  /**
   * Composite stability score derived from RHR variance and sleep consistency.
   * Range: 1 (critical instability) → 100 (optimal stability).
   */
  dailyStabilityScore: number;
  /**
   * Rolling 7-day resting heart rate readings (bpm).
   * Index 0 = 6 days ago, Index 6 = today.
   */
  restingHeartRateHistory: number[];
  /**
   * Rolling 7-day sleep duration recordings (minutes).
   * Index 0 = 6 days ago, Index 6 = last night.
   */
  sleepConsistencyHistory: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ALLERGEN / SCANNER DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

export interface AllergenMatchResult {
  /** The name or label of the scanned food item */
  itemName: string;
  /** True when one or more detected ingredients intersect with user allergies */
  matchFound: boolean;
  /** Subset of userAllergies that were found in the scanned ingredient list */
  flaggedIngredients: string[];
  /**
   * Suggested allergen-safe macro nutrients to surface in the UI
   * when no match is found (e.g., "Nut-Free Certified", "High Fiber").
   */
  alternativeSafeMacros: string[];
}

export interface ImagePayloadMetrics {
  width: number;
  height: number;
}

export interface ScanState {
  /** Whether the camera viewfinder is currently in an active/live state */
  isCameraActive: boolean;
  /** Dimensions of the last captured image frame */
  imagePayloadSize?: ImagePayloadMetrics;
  /** Tokenized ingredient strings parsed from the CV image payload */
  detectedIngredients: string[];
  /** The result object from the last allergen intersection check */
  allergenResult: AllergenMatchResult | null;
  /**
   * Global UI flag. TRUE triggers the M3 slide-up Modal bottom sheet with
   * Coral-Red alert block. FALSE surfaces the green macro pill tags.
   */
  hasTriggeredAllergen: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZUSTAND STORE ROOT INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface SafeScaleState {
  // ── State Slices ────────────────────────────────────────────────────────────
  userAllergies: string[];
  medicationSchedule: MedicationItem[];
  biometricCore: BiometricSummary;
  scanState: ScanState;

  // ── Allergy Actions ─────────────────────────────────────────────────────────
  /** Add a single allergy string; no-ops on duplicates (case-insensitive guard) */
  addAllergy: (allergy: string) => void;
  /** Remove an allergy entry by its exact string value */
  removeAllergy: (allergy: string) => void;
  /** Bulk-replace the entire allergy array (e.g., on settings save) */
  setUserAllergies: (allergies: string[]) => void;

  // ── Medication Actions ───────────────────────────────────────────────────────
  /** Append a new medication; id and status are auto-assigned internally */
  addMedication: (medication: Omit<MedicationItem, 'id' | 'status'>) => void;
  /** Transition a medication's status; sets takenAt when moving to 'Completed' */
  updateMedicationStatus: (id: string, status: MedicationStatus) => void;
  /** Remove a medication entry from the schedule by id */
  removeMedication: (id: string) => void;

  // ── Biometric Actions ────────────────────────────────────────────────────────
  /** Partial-merge incoming biometric sensor data into the current core state */
  updateBiometrics: (biometrics: Partial<BiometricSummary>) => void;
  /** Directly overwrite the composite stability score (called after service calculation) */
  setDailyStabilityScore: (score: number) => void;

  // ── Scanner Actions ──────────────────────────────────────────────────────────
  /** Toggle the camera viewfinder active state */
  setCameraActive: (active: boolean) => void;
  /** Record image payload dimensions after a frame is captured */
  updateScanPayload: (width: number, height: number) => void;
  /**
   * Core pipeline action: runs AllergenEngine, writes the match result,
   * and sets the global `hasTriggeredAllergen` UI flag.
   */
  processScanResult: (detectedIngredients: string[], itemName?: string) => void;
  /** Reset scanner state to initial empty values between scans */
  resetScanState: () => void;
}
