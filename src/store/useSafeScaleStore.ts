/**
 * @file src/store/useSafeScaleStore.ts
 * @description Zustand global state store for the SafeScale Health application.
 *
 * ARCHITECTURAL CONTRACTS:
 *
 * 1. NO AllergenEngine import — the store does not call or reference
 *    AllergenEngine at any point. The UI/controller layer is responsible for
 *    calling `AllergenEngine.analyzeIngredients()` as a pure function and
 *    passing the resulting `AllergenMatchResult` into `triggerAllergenAlert()`.
 *    This eliminates any risk of a circular import dependency chain.
 *
 * 2. Immutable state transitions — every action uses object spread or
 *    array methods (map, filter) that return new references. Direct mutation
 *    of state slices is prohibited.
 *
 * 3. No `any` — the store is fully typed via SafeScaleState from ../types.
 *
 * 4. Seed data — the default store state is populated with realistic seed
 *    values so the UI renders correctly before any live telemetry sync.
 */

import { create } from 'zustand';

import type {
  SafeScaleState,
  MedicationItem,
  BiometricSummary,
  AllergenMatchResult,
  ScanState,
  ScanPayloadMetrics,
  LocalAIAnalysisResult,
  CrowdsourcedReport,
} from '../types';

// ---------------------------------------------------------------------------
// Seed / default values
// ---------------------------------------------------------------------------

/**
 * Default medication schedule seed.
 * Populated with two realistic entries covering a morning and evening dose.
 */
const DEFAULT_MEDICATION_SCHEDULE: MedicationItem[] = [
  {
    id: '1',
    name: 'Lisinopril',
    dosage: '10mg',
    time: '08:00',
    status: 'Pending',
    icon: 'pill',
  },
  {
    id: '2',
    name: 'Atorvastatin',
    dosage: '20mg',
    time: '21:00',
    status: 'Pending',
    icon: 'pill',
  },
];

/**
 * Default biometric summary seed.
 *
 * historicalRHR is pre-seeded with 5 plausible values so the stability
 * score formula activates immediately (length >= MIN_HISTORY_LENGTH of 3)
 * without waiting for real telemetry collection.
 */
const DEFAULT_BIOMETRIC_CORE: BiometricSummary = {
  heartRate: 72,
  restingHeartRate: 65,
  sleepMinutes: 450, // 7.5 hours
  sleepConsistency: 85,
  steps: 8_432,
  activeCalories: 420,
  dailyStabilityScore: 78,
  historicalRHR: [64, 66, 65, 63, 67],
};

/**
 * Empty biometric summary placeholder when test mode is disabled.
 */
const EMPTY_BIOMETRIC_CORE: BiometricSummary = {
  heartRate: 0,
  restingHeartRate: 0,
  sleepMinutes: 0,
  sleepConsistency: 0,
  steps: 0,
  activeCalories: 0,
  dailyStabilityScore: 0,
  historicalRHR: [],
};

/** Default scan session state — camera inactive, nothing processed. */
const DEFAULT_SCAN_STATE: ScanState = {
  isCameraActive: false,
  isProcessing: false,
  currentPayloadMetrics: null,
  lastMatchResult: null,
};

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export const useSafeScaleStore = create<SafeScaleState>((set) => ({
  // ── Initial State ──────────────────────────────────────────────────────────

  isTestMode: false,

  userAllergies: [],

  medicationSchedule: [],

  biometricCore: EMPTY_BIOMETRIC_CORE,

  scanState: DEFAULT_SCAN_STATE,

  hasTriggeredAllergen: false,

  flaggedIngredients: [],

  isLocalAIOptedIn: false,

  localAIAnalysisResult: null,

  hasHealthPermission: null,

  crowdsourcedReports: [],

  // ── Allergy Management Actions ─────────────────────────────────────────────

  /**
   * Replaces the entire userAllergies array.
   * Use when importing a profile from external storage or settings sync.
   */
  setUserAllergies: (allergies: string[]): void =>
    set({ userAllergies: allergies }),

  /**
   * Appends a new allergen to the list.
   * Guards against duplicates using a case-insensitive comparison
   * so that "Peanut" and "peanut" are treated as the same entry.
   * Is a no-op if the allergen is already present.
   */
  addAllergy: (allergy: string): void =>
    set((state) => {
      const trimmed = allergy.trim();
      const isDuplicate = state.userAllergies.some(
        (existing) => existing.toLowerCase() === trimmed.toLowerCase(),
      );
      if (isDuplicate) return {};
      return { userAllergies: [...state.userAllergies, trimmed] };
    }),

  /**
   * Removes an allergen from the list by name.
   * Case-insensitive match — "PEANUT" will remove "Peanut".
   */
  removeAllergy: (allergy: string): void =>
    set((state) => ({
      userAllergies: state.userAllergies.filter(
        (existing) =>
          existing.toLowerCase() !== allergy.trim().toLowerCase(),
      ),
    })),

  // ── Medication Schedule Actions ────────────────────────────────────────────

  /**
   * Updates the `status` field of a single MedicationItem identified by `id`.
   * All other fields for the matched item, and all other items, are unchanged.
   * Is a no-op if no item with the given id is found.
   */
  setMedicationStatus: (
    id: string,
    status: MedicationItem['status'],
  ): void =>
    set((state) => ({
      medicationSchedule: state.medicationSchedule.map((med) =>
        med.id === id ? { ...med, status } : med,
      ),
    })),

  // ── Biometric Actions ──────────────────────────────────────────────────────

  /**
   * Shallow-merges a partial BiometricSummary update into biometricCore.
   * Only the keys present in `biometrics` are overwritten; all other fields
   * retain their current values.
   *
   * Intended callers:
   *   - HealthDataService.syncTelemetry() result dispatched from a background
   *     polling hook or native event listener.
   */
  updateBiometrics: (biometrics: Partial<BiometricSummary>): void =>
    set((state) => ({
      biometricCore: { ...state.biometricCore, ...biometrics },
    })),

  // ── Scanner Actions ────────────────────────────────────────────────────────

  /**
   * Shallow-merges a partial ScanState update into scanState.
   * Used by the camera controller to update individual fields
   * (e.g., toggling isProcessing, storing payload metrics) without
   * replacing the entire scan state object.
   */
  setScanState: (update: Partial<ScanState>): void =>
    set((state) => ({
      scanState: { ...state.scanState, ...update },
    })),

  /**
   * Elevates the allergen alert state.
   *
   * Called by the UI/controller layer AFTER AllergenEngine.analyzeIngredients()
   * has been invoked as a pure function and returned matchFound === true.
   *
   * Effects:
   *   - Sets hasTriggeredAllergen to true (triggers Coral-Red modal render).
   *   - Populates flaggedIngredients for display in the bottom sheet.
   *   - Stores the full AllergenMatchResult on scanState.lastMatchResult.
   *   - Clears the isProcessing spinner.
   */
  triggerAllergenAlert: (
    flagged: string[],
    matchResult: AllergenMatchResult,
  ): void =>
    set((state) => ({
      hasTriggeredAllergen: true,
      flaggedIngredients: flagged,
      scanState: {
        ...state.scanState,
        lastMatchResult: matchResult,
        isProcessing: false,
      },
    })),

  /**
   * Dismisses the allergen alert overlay without resetting the camera.
   *
   * Intended for the bottom sheet dismiss gesture — clears the alert UI
   * state while leaving scanState.lastMatchResult intact for reference
   * (e.g. the user can scroll back to see what was flagged).
   */
  clearAllergenAlert: (): void =>
    set({
      hasTriggeredAllergen: false,
      flaggedIngredients: [],
    }),

  /**
   * Full scan session reset.
   *
   * Clears all allergen flags and processing state, then re-activates the
   * camera viewfinder for the next scan. Use when the user taps "Scan Again"
   * or navigates back to the scan screen from the results view.
   *
   * Note: biometricCore and userAllergies are deliberately NOT reset here —
   * only scanner-lifecycle state is affected.
   */
  resetScan: (): void =>
    set({
      hasTriggeredAllergen: false,
      flaggedIngredients: [],
      scanState: {
        isCameraActive: true,
        isProcessing: false,
        currentPayloadMetrics: null,
        lastMatchResult: null,
      },
    }),

  /** Updates the opt-in preference for local AI. */
  setLocalAIOptedIn: (optedIn: boolean): void =>
    set({ isLocalAIOptedIn: optedIn }),

  /** Stores the result of a local AI analysis run. */
  setLocalAIAnalysisResult: (result: LocalAIAnalysisResult | null): void =>
    set({ localAIAnalysisResult: result }),

  /** Toggles Test/Simulation Mode on/off. Seeding or clearing data. */
  toggleTestMode: (): void =>
    set((state) => {
      const nextTestMode = !state.isTestMode;
      return {
        isTestMode: nextTestMode,
        userAllergies: nextTestMode ? ['Peanut', 'Almond'] : [],
        medicationSchedule: nextTestMode ? DEFAULT_MEDICATION_SCHEDULE : [],
        biometricCore: nextTestMode ? DEFAULT_BIOMETRIC_CORE : EMPTY_BIOMETRIC_CORE,
      };
    }),

  /** Adds a new medication entry. */
  addMedication: (medication: Omit<MedicationItem, 'id' | 'status'>): void =>
    set((state) => {
      const newItem: MedicationItem = {
        ...medication,
        id: Date.now().toString(),
        status: 'Pending',
      };
      return {
        medicationSchedule: [...state.medicationSchedule, newItem],
      };
    }),

  /** Removes a medication entry. */
  removeMedication: (id: string): void =>
    set((state) => ({
      medicationSchedule: state.medicationSchedule.filter((m) => m.id !== id),
    })),

  setHealthPermission: (granted: boolean | null): void =>
    set({ hasHealthPermission: granted }),

  addCrowdsourcedReport: (report: Omit<CrowdsourcedReport, 'id' | 'timestamp'>): void =>
    set((state) => {
      const newReport: CrowdsourcedReport = {
        ...report,
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      return {
        crowdsourcedReports: [newReport, ...state.crowdsourcedReports],
      };
    }),

  clearCrowdsourcedReports: (): void =>
    set({ crowdsourcedReports: [] }),
}));

// ---------------------------------------------------------------------------
// Selectors (memoization-friendly, exported for use with useShallow)
// ---------------------------------------------------------------------------

/**
 * Returns the user's current allergen list.
 * Use with Zustand's useShallow for stable reference equality.
 *
 * @example
 *   const allergies = useSafeScaleStore(selectUserAllergies);
 */
export const selectUserAllergies = (
  state: SafeScaleState,
): string[] => state.userAllergies;

/**
 * Returns the current biometric core summary snapshot.
 */
export const selectBiometricCore = (
  state: SafeScaleState,
): BiometricSummary => state.biometricCore;

/**
 * Returns the daily stability score as a standalone number.
 * Useful for score ring components that don't need the full biometric object.
 */
export const selectDailyStabilityScore = (
  state: SafeScaleState,
): number => state.biometricCore.dailyStabilityScore;

/**
 * Returns the full scan state object.
 */
export const selectScanState = (state: SafeScaleState): ScanState =>
  state.scanState;

/**
 * Returns true if an allergen alert is currently active.
 * Use as the boolean render condition for the AllergenAlertModal.
 */
export const selectHasTriggeredAllergen = (
  state: SafeScaleState,
): boolean => state.hasTriggeredAllergen;

/**
 * Returns the list of flagged ingredient strings currently in alert state.
 */
export const selectFlaggedIngredients = (
  state: SafeScaleState,
): string[] => state.flaggedIngredients;

/**
 * Returns the ordered medication schedule for the current day.
 */
export const selectMedicationSchedule = (
  state: SafeScaleState,
): MedicationItem[] => state.medicationSchedule;

/**
 * Returns whether the user has opted in to local AI ingredient analysis.
 */
export const selectIsLocalAIOptedIn = (
  state: SafeScaleState,
): boolean => state.isLocalAIOptedIn;

/**
 * Returns the latest local AI analysis result.
 */
export const selectLocalAIAnalysisResult = (
  state: SafeScaleState,
): LocalAIAnalysisResult | null => state.localAIAnalysisResult;

/**
 * Returns whether test/simulation mode is currently active.
 */
export const selectIsTestMode = (
  state: SafeScaleState,
): boolean => state.isTestMode;

/**
 * Returns the health tracker permission status.
 */
export const selectHasHealthPermission = (
  state: SafeScaleState,
): boolean | null => state.hasHealthPermission;

/**
 * Returns crowdsourced map reports.
 */
export const selectCrowdsourcedReports = (
  state: SafeScaleState,
): CrowdsourcedReport[] => state.crowdsourcedReports;
