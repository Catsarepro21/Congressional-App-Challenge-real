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

import { localDate, validDate, validateVitalReadings, currentMedications, changeDose } from '../utils/daily';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SecureHealthStorage } from '../services/SecureHealthStorage';

import type {
  SafeScaleState,
  MedicationItem,
  BiometricSummary,
  AllergenMatchResult,
  ScanState,
  ScanPayloadMetrics,
  LocalAIAnalysisResult,
  CrowdsourcedReport,
  WeeklyHistoryEntry,
  LoggedItem,
  MedicalRecord,
  EmergencyContact,
  SymptomLog,
  UserProfile,
  VaccineMilestone,
  MoodEntry,
  VitalLogEntry,
  AIIntelligenceProvider,
  WorkoutSession,
  WorkoutType,
  ActivityRingsData,
  RecoveryReadinessScore,
  SleepStageBreakdown,
  SleepDebtData,
  FastingProtocol,
  FastingSession,
  FastingHistoryEntry,
  HRVMetrics,
} from '../types';
import { HealthDataService } from '../services/HealthDataService';
import { NotificationService } from '../services/NotificationService';
import { syncHealthSource, readableData } from '../services/HealthSyncService';
import type { HealthSource } from '../types';
import { getSuggestedOwnerName } from '../utils/deviceName';
import {
  estimateCaloriesBurned,
  workoutElapsedSeconds,
  computeRecoveryScore,
} from '../services/WorkoutService';
import { calculateSleepDebt } from '../services/SleepAnalysisService';
import { getProtocolTargetHours } from '../services/FastingService';
import { classifyHRV } from '../services/CardioDiagnosticsService';

// ---------------------------------------------------------------------------
// Vaccine Milestones Generator
// ---------------------------------------------------------------------------

const calculateAgeInYears = (dobString: string): number => {
  try {
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return 30;
  }
};

const generateMilestones = (dobString: string): VaccineMilestone[] => {
  if (!validDate(dobString)) return [];
  const age = calculateAgeInYears(dobString);
  const birth = new Date(dobString);
  
  const formatDateOffset = (monthsOffset: number): string => {
    const d = new Date(birth);
    d.setMonth(d.getMonth() + monthsOffset);
    return d.toLocaleDateString();
  };

  const formatYearOffset = (yearsOffset: number): string => {
    const d = new Date(birth);
    d.setFullYear(d.getFullYear() + yearsOffset);
    return d.toLocaleDateString();
  };

  if (age < 18) {
    return [
      { id: 'v_hepb_1', name: 'Hepatitis B (Dose 1)', recommendedAge: 'Birth', targetDisease: 'Hepatitis B', status: 'Pending', dueDate: formatDateOffset(0) },
      { id: 'v_hepb_2', name: 'Hepatitis B (Dose 2)', recommendedAge: '1-2 Months', targetDisease: 'Hepatitis B', status: 'Pending', dueDate: formatDateOffset(2) },
      { id: 'v_rota_1', name: 'Rotavirus (Dose 1)', recommendedAge: '2 Months', targetDisease: 'Rotavirus Gastroenteritis', status: 'Pending', dueDate: formatDateOffset(2) },
      { id: 'v_dtap_1', name: 'DTaP (Dose 1)', recommendedAge: '2 Months', targetDisease: 'Diphtheria, Tetanus, Pertussis', status: 'Pending', dueDate: formatDateOffset(2) },
      { id: 'v_hib_1', name: 'Haemophilus influenzae type b (Dose 1)', recommendedAge: '2 Months', targetDisease: 'Meningitis, Pneumonia', status: 'Pending', dueDate: formatDateOffset(2) },
      { id: 'v_pcv_1', name: 'Pneumococcal Conjugate (Dose 1)', recommendedAge: '2 Months', targetDisease: 'Pneumococcal Meningitis/Pneumonia', status: 'Pending', dueDate: formatDateOffset(2) },
      { id: 'v_ipv_1', name: 'Inactivated Poliovirus (Dose 1)', recommendedAge: '2 Months', targetDisease: 'Polio', status: 'Pending', dueDate: formatDateOffset(2) },
      { id: 'v_dtap_2', name: 'DTaP (Dose 2)', recommendedAge: '4 Months', targetDisease: 'Diphtheria, Tetanus, Pertussis', status: 'Pending', dueDate: formatDateOffset(4) },
      { id: 'v_pcv_2', name: 'Pneumococcal Conjugate (Dose 2)', recommendedAge: '4 Months', targetDisease: 'Pneumococcal Meningitis/Pneumonia', status: 'Pending', dueDate: formatDateOffset(4) },
      { id: 'v_ipv_2', name: 'Inactivated Poliovirus (Dose 2)', recommendedAge: '4 Months', targetDisease: 'Polio', status: 'Pending', dueDate: formatDateOffset(4) },
      { id: 'v_dtap_3', name: 'DTaP (Dose 3)', recommendedAge: '6 Months', targetDisease: 'Diphtheria, Tetanus, Pertussis', status: 'Pending', dueDate: formatDateOffset(6) },
      { id: 'v_ipv_3', name: 'Inactivated Poliovirus (Dose 3)', recommendedAge: '6-18 Months', targetDisease: 'Polio', status: 'Pending', dueDate: formatDateOffset(12) },
      { id: 'v_mmr_1', name: 'MMR (Dose 1)', recommendedAge: '12-15 Months', targetDisease: 'Measles, Mumps, Rubella', status: 'Pending', dueDate: formatDateOffset(15) },
      { id: 'v_var_1', name: 'Varicella (Dose 1)', recommendedAge: '12-15 Months', targetDisease: 'Chickenpox', status: 'Pending', dueDate: formatDateOffset(15) },
      { id: 'v_hepa_1', name: 'Hepatitis A (Dose 1)', recommendedAge: '12-23 Months', targetDisease: 'Hepatitis A', status: 'Pending', dueDate: formatDateOffset(18) },
      { id: 'v_men_1', name: 'Meningococcal ACWY (Dose 1)', recommendedAge: '11-12 Years', targetDisease: 'Meningitis', status: 'Pending', dueDate: formatYearOffset(11) },
    ];
  } else {
    return [
      { id: 'v_flu_annual', name: 'Influenza (Flu Vaccine)', recommendedAge: 'Annually', targetDisease: 'Seasonal Influenza', status: 'Pending', dueDate: new Date(new Date().getFullYear(), 9, 15).toLocaleDateString() },
      { id: 'v_covid_annual', name: 'COVID-19 Vaccine (Updated)', recommendedAge: 'Annually', targetDisease: 'COVID-19', status: 'Pending', dueDate: new Date(new Date().getFullYear(), 8, 20).toLocaleDateString() },
      { id: 'v_tdap_10', name: 'Tdap Booster', recommendedAge: 'Every 10 Years', targetDisease: 'Tetanus, Diphtheria, Pertussis', status: 'Pending', dueDate: formatYearOffset(10) },
      { id: 'v_shingrix', name: 'Zoster Vaccine (Shingrix)', recommendedAge: 'Age 50+', targetDisease: 'Shingles', status: 'Pending', dueDate: age >= 50 ? formatDateOffset(0) : formatYearOffset(50 - age) },
      { id: 'v_pneumo', name: 'Pneumococcal Conjugate', recommendedAge: 'Age 65+', targetDisease: 'Pneumonia/Meningitis', status: 'Pending', dueDate: age >= 65 ? formatDateOffset(0) : formatYearOffset(65 - age) },
    ];
  }
};

// ---------------------------------------------------------------------------
// Seed / default values
// ---------------------------------------------------------------------------

/**
 * Default user profile seed.
 */
const DEFAULT_USER_PROFILE: UserProfile = {
  name: '',
  dob: '',
  bloodType: 'Unknown',
  height: 0,
  weight: 0,
  organDonor: false,
  unitPreference: 'metric',
  useGeminiFoodVision: true,
  geminiApiKey: '',
  useGeminiWeeklyReport: true,
  useCloudAIDocuments: true,
  deviceNameSuggestedName: '',
};

const DEFAULT_ACTIVITY_RINGS: ActivityRingsData = {
  moveCalories: 0,
  moveTargetCalories: 600,
  exerciseMinutes: 0,
  exerciseTargetMinutes: 30,
  standHours: 0,
  standTargetHours: 12,
};

const DEFAULT_SLEEP_STAGES: SleepStageBreakdown = {
  deepMinutes: 0,
  remMinutes: 0,
  coreMinutes: 0,
  awakeMinutes: 0,
  totalSleepMinutes: 0,
  efficiencyPercent: 0,
};

const DEFAULT_SLEEP_DEBT: SleepDebtData = {
  targetMinutes: 480,
  debtMinutes: 0,
  weeklyAverageMinutes: 0,
  circadianBedtimeWindow: {
    start: '10:15 PM',
    end: '11:00 PM',
    recommendation: 'Based on circadian rhythm and an 8h sleep target, aim to wind down between 10:15 PM and 11:00 PM.',
  },
};

const DEFAULT_FASTING_SESSION: FastingSession = {
  isFasting: false,
  startedAt: null,
  targetHours: 16,
  protocol: '16:8',
  history: [],
};

const DEFAULT_HRV_METRICS: HRVMetrics = {
  sdnnMs: 0,
  status: 'Balanced',
  balanceDescription: 'No HRV telemetry recorded yet. Wear Apple Watch during rest to calibrate autonomic balance.',
};

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
    stock: 18,
    refillThreshold: 5,
    refillAlertsEnabled: true,
    inactiveIngredients: ['Starch (Wheat derivative)', 'Calcium Phosphate', 'Magnesium Stearate'],
  },
  {
    id: '2',
    name: 'Atorvastatin',
    dosage: '20mg',
    time: '21:00',
    status: 'Pending',
    icon: 'pill',
    stock: 4,
    refillThreshold: 5,
    refillAlertsEnabled: true,
    inactiveIngredients: ['Lactose (Milk derivative)', 'Microcrystalline Cellulose', 'Croscarmellose Sodium'],
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

/** Generates a dynamic 7-day weekly history up to today for test mode seeding. */
const generateSeedWeeklyHistory = (): WeeklyHistoryEntry[] => {
  const history: WeeklyHistoryEntry[] = [];
  const baseSteps = [7200, 9400, 8100, 6500, 10200, 8900, 8432];
  const baseCalories = [350, 480, 410, 310, 510, 440, 420];
  const baseScores = [75, 82, 78, 70, 88, 80, 78];
  const baseSleep = [440, 480, 450, 420, 500, 460, 450];
  const baseHR = [70, 68, 72, 75, 66, 71, 72];
  const baseAdherence = [100, 50, 100, 100, 0, 50, 100];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const index = 6 - i;
    history.push({
      date: dateStr,
      steps: baseSteps[index],
      activeCalories: baseCalories[index],
      stabilityScore: baseScores[index],
      sleepMinutes: baseSleep[index],
      heartRate: baseHR[index],
      medicationAdherence: baseAdherence[index],
    });
  }
  return history;
};

const updateAdherenceInHistory = (
  history: WeeklyHistoryEntry[],
  meds: MedicationItem[]
): WeeklyHistoryEntry[] => {
  const today = localDate();
  const completed = meds.filter(m => m.status === 'Completed').length;
  const total = meds.length;
  const adherence = total > 0 ? Math.round((completed / total) * 100) : 100;

  let updated = false;
  const newHistory = history.map((entry) => {
    if (entry.date === today) {
      updated = true;
      return { ...entry, medicationAdherence: adherence };
    }
    return entry;
  });

  if (!updated) {
    newHistory.push({
      date: today,
      steps: 0,
      activeCalories: 0,
      stabilityScore: 0,
      sleepMinutes: 0,
      heartRate: 0,
      medicationAdherence: adherence,
    });
  }
  return newHistory.slice(-7);
};

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

let demoSnapshot: SafeScaleState | null = null;

export const useSafeScaleStore = create<SafeScaleState>()(
  persist(
    (set) => ({
  // ── Initial State ──────────────────────────────────────────────────────────

  isTestMode: false,

  lastSyncedAt: null,

  isAutoSyncing: false,
  dataRevision: 0,
  isDeletingData: false,

  setAutoSyncEnabled: (enabled: boolean): void => {
    set((state) => ({
      profile: {
        ...state.profile,
        autoSyncEnabled: enabled,
      },
    }));
  },

  triggerAutoSync: (): void => {
    const state = useSafeScaleStore.getState();
    if (state.isAutoSyncing || state.isTestMode || state.isDeletingData) return;
    if (state.profile.autoSyncEnabled === false) return;
    const connections = state.profile.healthConnections;
    const lastSource = state.profile.lastHealthSource;
    if (!connections || !lastSource || !connections[lastSource]) return;
    // Throttle: skip if synced less than 15 minutes ago
    const lastSync = connections[lastSource]?.lastSyncedAt;
    if (lastSync) {
      const elapsed = Date.now() - new Date(lastSync).getTime();
      if (elapsed < 15 * 60 * 1000) return;
    }
    set({ isAutoSyncing: true });
    syncHealthSource(lastSource as HealthSource, connections[lastSource])
      .then(result => {
        if (!result) return;
        const current = useSafeScaleStore.getState();
        if (current.dataRevision !== state.dataRevision || current.isTestMode || current.isDeletingData || !current.profile.healthConnections?.[lastSource]) return;
        current.updateProfile({
          healthConnections: { ...current.profile.healthConnections, [lastSource]: result.connection },
        });
        if (result.readings) {
          current.updateBiometrics(result.readings);
          useSafeScaleStore.setState({ lastSyncedAt: result.connection.lastSyncedAt ?? null });
        }
        if (result.activityRings) {
          current.setActivityRings(result.activityRings);
        }
        if (result.sleepStages) {
          current.updateSleepStages(result.sleepStages);
        }
        if (typeof result.hrvMs === 'number' && result.hrvMs > 0) {
          const diag = classifyHRV(result.hrvMs);
          current.updateHRVMetrics({ ...diag, lastSyncedAt: new Date().toISOString() });
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => set({ isAutoSyncing: false }));
  },

  weeklyHistory: [],

  // ----- Built-in GPS & Step Tracker Slices -----
  isTrackingActive: false,
  trackingType: null,
  trackingStartTime: null,
  trackingPath: [],
  trackingSteps: 0,
  trackingDistance: 0,
  trackingCalories: 0,
  appWorkouts: [],
  workouts: [],
  activeWorkout: null,
  activityRings: DEFAULT_ACTIVITY_RINGS,
  recoveryScore: undefined,
  sleepStages: DEFAULT_SLEEP_STAGES,
  sleepDebt: DEFAULT_SLEEP_DEBT,
  fastingSession: DEFAULT_FASTING_SESSION,
  hrvMetrics: DEFAULT_HRV_METRICS,
  lastSuccessfulSync: null,

  // ----- Direct Wearable APIs State -----
  connectedDevices: {
    fitbit: false,
    strava: false,
    polar: false,
    withings: false,
  },

  userAllergies: [],

  loggedItems: [],

  medicationSchedule: [],
  medicationDay: null,
  doseEvents: [],
  ensureCurrentDay: () => {
    const state = useSafeScaleStore.getState();
    const today = localDate();
    const updates: Partial<SafeScaleState> = {};
    if (state.medicationDay !== today) {
      updates.medicationSchedule = currentMedications(state.medicationSchedule, state.medicationDay, today);
      updates.medicationDay = today;
    }
    const importedDay = state.lastSyncedAt && Number.isFinite(Date.parse(state.lastSyncedAt)) ? localDate(new Date(state.lastSyncedAt)) : null;
    if (!state.isTestMode && importedDay !== today) {
      const metadata = {...state.biometricCore.readingMetadata};
      delete metadata.steps; delete metadata.activeCalories;
      if (state.biometricCore.steps || state.biometricCore.activeCalories || state.biometricCore.readingMetadata?.steps || state.biometricCore.readingMetadata?.activeCalories) {
        updates.biometricCore = {...state.biometricCore, steps:0, activeCalories:0, readingMetadata:metadata};
      }
    }
    const ringsDate = state.activityRings.lastSyncedAt;
    if (!state.isTestMode && ringsDate && localDate(new Date(ringsDate)) !== today) {
      updates.activityRings = {...state.activityRings,moveCalories:0,exerciseMinutes:0,standHours:0,lastSyncedAt:undefined};
    }
    // Auto-detect owner name from device if not yet set
    if (!state.profile.name || state.profile.name === 'Jane Doe') {
      const suggested = getSuggestedOwnerName();
      if (suggested) {
        updates.profile = {
          ...state.profile,
          name: state.profile.name && state.profile.name !== 'Jane Doe' ? state.profile.name : suggested,
          deviceNameSuggestedName: suggested,
        };
      }
    }
    if (Object.keys(updates).length > 0) {
      set(updates);
    }
  },

  hydrationGoal: 2000,

  calorieGoal: 2000,

  medicalRecords: [],

  hydrationNotificationsEnabled: false,

  hydrationIntervalHours: 2,

  emergencyContacts: [],

  symptomLogs: [],

  vaccineMilestones: [],

  moodLogs: [],

  vitalsLogs: [],

  hasCompletedOnboarding: false,

  profile: DEFAULT_USER_PROFILE,

  biometricCore: EMPTY_BIOMETRIC_CORE,

  scanState: DEFAULT_SCAN_STATE,

  hasTriggeredAllergen: false,

  flaggedIngredients: [],

  isLocalAIOptedIn: false,

  aiPreference: 'opt-out' as AIIntelligenceProvider,

  setAIPreference: (pref: AIIntelligenceProvider): void => {
    set({ aiPreference: pref });
  },

  localAIAnalysisResult: null,

  hasHealthPermission: null,

  crowdsourcedReports: [],

  // ── Allergy Management Actions ─────────────────────────────────────────────

  /**
   * Replaces the entire userAllergies array.
   * Use when importing a profile from external storage or settings sync.
   */
  setUserAllergies: (allergies: string[]): void => {
    set({ userAllergies: allergies });
  },

  /**
   * Appends a new allergen to the list.
   * Guards against duplicates using a case-insensitive comparison
   * so that "Peanut" and "peanut" are treated as the same entry.
   * Is a no-op if the allergen is already present.
   */
  addAllergy: (allergy: string): void => {
    set((state) => {
      const trimmed = allergy.trim();
      const isDuplicate = state.userAllergies.some(
        (existing) => existing.toLowerCase() === trimmed.toLowerCase(),
      );
      if (isDuplicate) return {};
      return { userAllergies: [...state.userAllergies, trimmed] };
    });
  },

  /**
   * Removes an allergen from the list by name.
   * Case-insensitive match — "PEANUT" will remove "Peanut".
   */
  removeAllergy: (allergy: string): void => {
    set((state) => ({
      userAllergies: state.userAllergies.filter(
        (existing) =>
          existing.toLowerCase() !== allergy.trim().toLowerCase(),
      ),
    }));
  },

  // ── Medication Schedule Actions ────────────────────────────────────────────

  /**
   * Updates the `status` field of a single MedicationItem identified by `id`.
   * All other fields for the matched item, and all other items, are unchanged.
   * Is a no-op if no item with the given id is found.
   */
  setMedicationStatus: (
    id: string,
    status: MedicationItem['status'],
  ): void => {
    set((state) => {
      const today = localDate();
      const nextSchedule = currentMedications(state.medicationSchedule, state.medicationDay, today)
        .map(med => med.id === id ? changeDose(med, status) : med);
      const med = nextSchedule.find(item => item.id === id);
      if (!med) return {};
      // Keep one completion per scheduled dose/day. Undo removes only that day's event.
      const eventId = `${today}:${id}`;
      const existing = (state.doseEvents || []).find(event => event.id === eventId);
      const doseEvents = (state.doseEvents || []).filter(event => event.id !== eventId);
      if (status === 'Completed') doseEvents.push(existing || {
        id: eventId, medicationId: id, name: med.name, dosage: med.dosage,
        date: today, recordedAt: new Date().toISOString(),
      });
      return {
        medicationSchedule: nextSchedule,
        doseEvents,
        medicationDay: today,
        weeklyHistory: updateAdherenceInHistory(state.weeklyHistory, nextSchedule),
      };
    });
  },

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
  updateBiometrics: (biometrics: Partial<BiometricSummary>): void => {
    set((state) => {
      const updatedBiometricCore = { ...state.biometricCore, ...biometrics };
      const today = localDate();
      
      const meds = state.medicationSchedule || [];
      const completed = meds.filter(m => m.status === 'Completed').length;
      const total = meds.length;
      const medicationAdherence = total > 0 ? Math.round((completed / total) * 100) : 100;

      let historyUpdated = false;
      const newHistory = state.weeklyHistory.map((entry) => {
        if (entry.date === today) {
          historyUpdated = true;
          return {
            date: today,
            steps: updatedBiometricCore.steps !== undefined ? updatedBiometricCore.steps : entry.steps,
            activeCalories: updatedBiometricCore.activeCalories !== undefined ? updatedBiometricCore.activeCalories : entry.activeCalories,
            stabilityScore: updatedBiometricCore.dailyStabilityScore !== undefined ? updatedBiometricCore.dailyStabilityScore : entry.stabilityScore,
            sleepMinutes: updatedBiometricCore.sleepMinutes !== undefined ? updatedBiometricCore.sleepMinutes : entry.sleepMinutes,
            heartRate: updatedBiometricCore.heartRate !== undefined ? updatedBiometricCore.heartRate : entry.heartRate,
            medicationAdherence: medicationAdherence,
          };
        }
        return entry;
      });

      if (!historyUpdated) {
        newHistory.push({
          date: today,
          steps: updatedBiometricCore.steps || 0,
          activeCalories: updatedBiometricCore.activeCalories || 0,
          stabilityScore: updatedBiometricCore.dailyStabilityScore || 0,
          sleepMinutes: updatedBiometricCore.sleepMinutes || 0,
          heartRate: updatedBiometricCore.heartRate || 0,
          medicationAdherence: medicationAdherence,
        });
      }

      return {
        biometricCore: updatedBiometricCore,
        weeklyHistory: newHistory.slice(-7),
        activityRings: {
          ...state.activityRings,
          ...(updatedBiometricCore.activeCalories !== undefined ? { moveCalories: updatedBiometricCore.activeCalories } : {}),
        },
      };
    });
    useSafeScaleStore.getState().recalculateRecoveryScore();
  },

  // ── Scanner Actions ────────────────────────────────────────────────────────

  /**
   * Shallow-merges a partial ScanState update into scanState.
   * Used by the camera controller to update individual fields
   * (e.g., toggling isProcessing, storing payload metrics) without
   * replacing the entire scan state object.
   */
  setScanState: (update: Partial<ScanState>): void => {
    set((state) => ({
      scanState: { ...state.scanState, ...update },
    }));
  },

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
  ): void => {
    set((state) => ({
      hasTriggeredAllergen: true,
      flaggedIngredients: flagged,
      scanState: {
        ...state.scanState,
        lastMatchResult: matchResult,
        isProcessing: false,
      },
    }));
  },

  /**
   * Dismisses the allergen alert overlay without resetting the camera.
   *
   * Intended for the bottom sheet dismiss gesture — clears the alert UI
   * state while leaving scanState.lastMatchResult intact for reference
   * (e.g. the user can scroll back to see what was flagged).
   */
  clearAllergenAlert: (): void => {
    set({
      hasTriggeredAllergen: false,
      flaggedIngredients: [],
    });
  },

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
  resetScan: (): void => {
    set({
      hasTriggeredAllergen: false,
      flaggedIngredients: [],
      scanState: {
        isCameraActive: true,
        isProcessing: false,
        currentPayloadMetrics: null,
        lastMatchResult: null,
      },
    });
  },

  /** Updates the opt-in preference for local AI. */
  setLocalAIOptedIn: (optedIn: boolean): void => {
    set({ isLocalAIOptedIn: optedIn });
  },

  /** Stores the result of a local AI analysis run. */
  setLocalAIAnalysisResult: (result: LocalAIAnalysisResult | null): void => {
    set({ localAIAnalysisResult: result });
  },

  /** Toggles Test/Simulation Mode on/off. Seeding or clearing data. */
  toggleTestMode: (): void => {
    if (useSafeScaleStore.getState().isDeletingData) return;
    set((state) => {
      if (state.isTestMode && demoSnapshot) {
        const restored = demoSnapshot;
        demoSnapshot = null;
        return { ...restored, isTestMode: false, dataRevision: state.dataRevision + 1 };
      }
      demoSnapshot = { ...state };
      const nextTestMode = true;
      return {
        isTestMode: nextTestMode,
        dataRevision: state.dataRevision + 1,
        connectedDevices: nextTestMode ? {
          fitbit: true,
          strava: true,
          polar: false,
          withings: false,
        } : {
          fitbit: false,
          strava: false,
          polar: false,
          withings: false,
        },
        userAllergies: nextTestMode ? ['Peanut', 'Almond'] : [],
        medicationSchedule: nextTestMode ? DEFAULT_MEDICATION_SCHEDULE : [],
        biometricCore: nextTestMode ? DEFAULT_BIOMETRIC_CORE : EMPTY_BIOMETRIC_CORE,
        weeklyHistory: nextTestMode ? generateSeedWeeklyHistory() : [],
        lastSyncedAt: nextTestMode ? new Date().toISOString() : null,
        medicationDay: localDate(),
        doseEvents: [],
        profile: { ...DEFAULT_USER_PROFILE, name: 'Sample Profile' },
        emergencyContacts: nextTestMode ? [
          { id: 'e1', name: 'Dr. Sarah Jenkins (Allergist)', phone: '555-0199' },
          { id: 'e2', name: 'Emergency Contact (Mom)', phone: '555-0144' }
        ] : [],
        symptomLogs: nextTestMode ? [
          { id: 's1', type: 'Mild Hives', severity: 3, timestamp: '14:20', date: localDate() }
        ] : [],
        vaccineMilestones: nextTestMode ? generateMilestones(DEFAULT_USER_PROFILE.dob) : [],
        moodLogs: nextTestMode ? [
          { id: 'm1', timestamp: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().split('T')[0], rating: 8, stressLevel: 'Low', feelings: ['Calm', 'Energetic'], notes: 'Felt great today, highly productive.' },
          { id: 'm2', timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().split('T')[0], rating: 7, stressLevel: 'Medium', feelings: ['Focused'], notes: 'Slightly busy afternoon.' },
          { id: 'm3', timestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString().split('T')[0], rating: 4, stressLevel: 'High', feelings: ['Anxious', 'Fatigued'], notes: 'Slept poorly, forgot my morning medication.' },
          { id: 'm4', timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().split('T')[0], rating: 8, stressLevel: 'Low', feelings: ['Calm', 'Happy'], notes: 'Relaxing evening.' },
          { id: 'm5', timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0], rating: 9, stressLevel: 'Low', feelings: ['Focused', 'Energetic'], notes: 'Ran 5k and felt very energized.' },
          { id: 'm6', timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0], rating: 5, stressLevel: 'High', feelings: ['Stressed', 'Fatigued'], notes: 'Work pressure was intense.' },
          { id: 'm7', timestamp: localDate(), rating: 8, stressLevel: 'Low', feelings: ['Calm', 'Focused'], notes: 'Balanced day.' }
        ] : [],
        vitalsLogs: nextTestMode ? [
          { id: 'vt1', timestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString().split('T')[0], systolicBP: 122, diastolicBP: 81, bloodGlucose: 99, glucoseContext: 'Fasting', spo2: 98, temperature: 98.5 },
          { id: 'vt2', timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().split('T')[0], systolicBP: 142, diastolicBP: 91, bloodGlucose: 145, glucoseContext: 'Post-Meal', spo2: 97, temperature: 99.1 },
          { id: 'vt3', timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0], systolicBP: 125, diastolicBP: 82, bloodGlucose: 105, glucoseContext: 'General', spo2: 99, temperature: 98.7 },
          { id: 'vt4', timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0], systolicBP: 132, diastolicBP: 85, bloodGlucose: 110, glucoseContext: 'Fasting', spo2: 98, temperature: 98.4 },
          { id: 'vt5', timestamp: localDate(), systolicBP: 120, diastolicBP: 80, bloodGlucose: 95, glucoseContext: 'Fasting', spo2: 98, temperature: 98.6 }
        ] : [],
        workouts: nextTestMode ? [
          {
            id: 'sample-w1',
            type: 'Running',
            name: 'Morning River Run',
            startedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
            endedAt: new Date(Date.now() - 1200 * 1000).toISOString(),
            durationSeconds: 2400,
            caloriesBurned: 395,
            distanceMeters: 5120,
            avgHeartRate: 152,
            maxHeartRate: 171,
            source: 'apple-health',
          },
          {
            id: 'sample-w2',
            type: 'Strength',
            name: 'Upper Body Hypertrophy',
            startedAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
            endedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
            durationSeconds: 3000,
            caloriesBurned: 280,
            source: 'app',
            strengthSets: [
              { exercise: 'Bench Press', reps: 10, weightKg: 75, completed: true },
              { exercise: 'Incline DB Press', reps: 12, weightKg: 26, completed: true },
              { exercise: 'Lat Pulldown', reps: 12, weightKg: 65, completed: true },
            ],
          },
        ] : [],
        activityRings: nextTestMode ? {
          moveCalories: 420,
          moveTargetCalories: 600,
          exerciseMinutes: 40,
          exerciseTargetMinutes: 30,
          standHours: 9,
          standTargetHours: 12,
          lastSyncedAt: new Date().toISOString(),
        } : DEFAULT_ACTIVITY_RINGS,
        sleepStages: nextTestMode ? {
          deepMinutes: 85,
          remMinutes: 105,
          coreMinutes: 230,
          awakeMinutes: 30,
          totalSleepMinutes: 420,
          efficiencyPercent: 93,
          lastRecordedDate: localDate(),
        } : DEFAULT_SLEEP_STAGES,
        sleepDebt: nextTestMode ? {
          targetMinutes: 480,
          debtMinutes: -60,
          weeklyAverageMinutes: 445,
          circadianBedtimeWindow: {
            start: '10:20 PM',
            end: '11:05 PM',
            recommendation: 'Based on circadian rhythm and an 8h sleep target, aim to wind down between 10:20 PM and 11:05 PM.',
          },
        } : DEFAULT_SLEEP_DEBT,
        fastingSession: nextTestMode ? {
          isFasting: true,
          startedAt: new Date(Date.now() - 14 * 3600 * 1000 - 22 * 60 * 1000).toISOString(),
          targetHours: 16,
          protocol: '16:8',
          history: [
            {
              id: 'fast-sample-1',
              startedAt: new Date(Date.now() - 38 * 3600 * 1000).toISOString(),
              endedAt: new Date(Date.now() - 22 * 3600 * 1000).toISOString(),
              targetHours: 16,
              durationSeconds: 16 * 3600 + 15 * 60,
              protocol: '16:8',
              completed: true,
            },
          ],
        } : DEFAULT_FASTING_SESSION,
        hrvMetrics: nextTestMode ? {
          sdnnMs: 68,
          status: 'High',
          balanceDescription: 'Optimal parasympathetic (vagal) recovery. Your nervous system is resilient and primed for training.',
          lastSyncedAt: new Date().toISOString(),
        } : DEFAULT_HRV_METRICS,
      };
    });
    useSafeScaleStore.getState().recalculateRecoveryScore();
  },

  /** Adds a new medication entry. */
  addMedication: (medication: Omit<MedicationItem, 'id' | 'status'>): void => {
    useSafeScaleStore.getState().ensureCurrentDay();
    set((state) => {
      const newItem: MedicationItem = {
        ...medication,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        status: 'Pending',
        stock: medication.stock,
        refillThreshold: medication.refillThreshold !== undefined ? medication.refillThreshold : 5,
        refillAlertsEnabled: medication.refillAlertsEnabled !== undefined ? medication.refillAlertsEnabled : true,
        inactiveIngredients: medication.inactiveIngredients || [],
      };
      const nextSchedule = [...state.medicationSchedule, newItem];

      // Schedule local notification reminder asynchronously
      if (!state.isTestMode) void NotificationService.scheduleMedicationReminder(
        newItem.id,
        newItem.name,
        newItem.dosage,
        newItem.time
      );

      return {
        medicationSchedule: nextSchedule,
        weeklyHistory: updateAdherenceInHistory(state.weeklyHistory, nextSchedule),
      };
    });
  },

  /** Removes a medication entry. */
  removeMedication: (id: string): void => {
    // Cancel local notification reminder
    if (!useSafeScaleStore.getState().isTestMode) void NotificationService.cancelMedicationReminder(id);

    set((state) => {
      const nextSchedule = state.medicationSchedule.filter((m) => m.id !== id);
      return {
        medicationSchedule: nextSchedule,
        weeklyHistory: updateAdherenceInHistory(state.weeklyHistory, nextSchedule),
      };
    });
  },

  setHealthPermission: (granted: boolean | null): void => {
    set({ hasHealthPermission: granted });
  },

  addCrowdsourcedReport: (report: Omit<CrowdsourcedReport, 'id' | 'timestamp'>): void => {
    set((state) => {
      const newReport: CrowdsourcedReport = {
        ...report,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      };
      return {
        crowdsourcedReports: [newReport, ...state.crowdsourcedReports],
      };
    });
  },

  clearCrowdsourcedReports: (): void => {
    set({ crowdsourcedReports: [] });
  },

  addLoggedItem: (item: Omit<LoggedItem, 'id' | 'timestamp'>): void => {
    set((state) => {
      const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      const newItem: LoggedItem = {
        ...item,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp,
        date: localDate(),
      };

      const updatedLoggedItems = [newItem, ...state.loggedItems];

      return { loggedItems: updatedLoggedItems };
    });
  },

  deleteLoggedItem: (id: string): void => {
    set(state => ({ loggedItems: state.loggedItems.filter(item => item.id !== id) }));
  },

  clearLoggedItems: (): void => {
    set({ loggedItems: [] });
  },

  setHydrationGoal: (goal: number): void => {
    set({ hydrationGoal: goal });
  },

  setCalorieGoal: (goal: number): void => {
    set({ calorieGoal: goal });
  },

  addMedicalRecord: (record: Omit<MedicalRecord, 'id'>): void => {
    set((state) => {
      const newRecord: MedicalRecord = {
        ...record,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      };
      return {
        medicalRecords: [newRecord, ...state.medicalRecords],
      };
    });
  },

  deleteMedicalRecord: (id: string): void => {
    set((state) => ({
      medicalRecords: state.medicalRecords.filter((r) => r.id !== id),
    }));
  },

  clearMedicalRecords: (): void => {
    set({ medicalRecords: [] });
  },

  setHydrationNotificationsEnabled: (enabled: boolean): void => {
    set({ hydrationNotificationsEnabled: enabled });
    if (enabled) {
      const interval = useSafeScaleStore.getState().hydrationIntervalHours;
      NotificationService.scheduleHydrationReminder(interval);
    } else {
      NotificationService.cancelHydrationReminder();
    }
  },

  setHydrationIntervalHours: (hours: number): void => {
    set({ hydrationIntervalHours: hours });
    if (useSafeScaleStore.getState().hydrationNotificationsEnabled) {
      NotificationService.scheduleHydrationReminder(hours);
    }
  },

  addEmergencyContact: (contact: Omit<EmergencyContact, 'id'>): void => {
    set((state) => {
      const newContact: EmergencyContact = {
        ...contact,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      };
      return {
        emergencyContacts: [...state.emergencyContacts, newContact],
      };
    });
  },

  removeEmergencyContact: (id: string): void => {
    set((state) => ({
      emergencyContacts: state.emergencyContacts.filter((c) => c.id !== id),
    }));
  },

  addSymptomLog: (log: Omit<SymptomLog, 'id' | 'timestamp' | 'date'>): void => {
    set((state) => {
      const now = new Date();
      const dateStr = localDate(now);
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      const newLog: SymptomLog = {
        ...log,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        date: dateStr,
        timestamp: timeStr,
      };
      return {
        symptomLogs: [newLog, ...state.symptomLogs],
      };
    });
  },

  deleteSymptomLog: (id: string): void => {
    set((state) => ({
      symptomLogs: state.symptomLogs.filter((l) => l.id !== id),
    }));
  },

  refillMedication: (id: string, amount: number): void => {
    set((state) => ({
      medicationSchedule: state.medicationSchedule.map((med) => {
        if (med.id === id) {
          const currentStock = med.stock !== undefined ? med.stock : 0;
          return { ...med, stock: currentStock + amount };
        }
        return med;
      }),
    }));
  },

  updateProfile: (profileUpdate: Partial<UserProfile>): void => {
    set((state) => {
      const updatedProfile = { ...state.profile, ...profileUpdate };
      let updatedMilestones = state.vaccineMilestones;
      if (profileUpdate.dob && profileUpdate.dob !== state.profile.dob) {
        updatedMilestones = generateMilestones(profileUpdate.dob);
      }
      return {
        profile: updatedProfile,
        vaccineMilestones: updatedMilestones,
      };
    });
  },

  addScannedDocument: (record: Omit<MedicalRecord, 'id'>): void => {
    set((state) => {
      const newRecord: MedicalRecord = {
        ...record,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      };
      return {
        medicalRecords: [newRecord, ...state.medicalRecords],
      };
    });
  },

  completeVaccineMilestone: (id: string, dateAdministered?: string, provider?: string): void => {
    set((state) => {
      const adminDate = dateAdministered || new Date().toLocaleDateString();
      const facility = provider || 'Public Health Center';
      
      const milestone = state.vaccineMilestones.find(m => m.id === id);
      if (!milestone) return {};

      NotificationService.cancelVaccineReminder(id);

      const newRecord: MedicalRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: 'Immunization',
        title: milestone.name,
        value: `Administered (Verified: ${milestone.recommendedAge} target)`,
        date: adminDate,
        provider: facility,
        status: 'Completed',
        fhirData: JSON.stringify({
          resourceType: 'Immunization',
          status: 'completed',
          vaccineCode: { text: milestone.name },
          occurrenceDateTime: adminDate,
          performer: [{ actor: { display: facility } }]
        }, null, 2),
      };

      return {
        vaccineMilestones: state.vaccineMilestones.map(m => 
          m.id === id ? { ...m, status: 'Completed' as const } : m
        ),
        medicalRecords: [newRecord, ...state.medicalRecords],
      };
    });
  },

  initializeVaccineMilestones: (): void => {
    set((state) => {
      const milestones = generateMilestones(state.profile.dob);
      milestones.forEach((m) => {
        if (m.status === 'Pending' && m.dueDate) {
          const due = new Date(m.dueDate);
          if (due > new Date()) {
            NotificationService.scheduleVaccineReminder(m.id, m.name, m.dueDate);
          }
        }
      });
      return { vaccineMilestones: milestones };
    });
  },

  addMoodLog: (entry: Omit<MoodEntry, 'id' | 'timestamp'>): void => {
    set((state) => {
      const newEntry: MoodEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: localDate(),
      };
      return { moodLogs: [newEntry, ...state.moodLogs] };
    });
  },

  addVitalLog: (entry: Omit<VitalLogEntry, 'id' | 'timestamp'>): void => {
    const error = validateVitalReadings(entry);
    if (error) throw new Error(error);
    set((state) => {
      const newEntry: VitalLogEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: localDate(),
      };
      return { vitalsLogs: [newEntry, ...state.vitalsLogs] };
    });
  },

  clearMoodLogs: (): void => {
    set({ moodLogs: [] });
  },

  clearVitalsLogs: (): void => {
    set({ vitalsLogs: [] });
  },

  completeOnboarding: (profile: UserProfile, allergies: string[], aiPref?: AIIntelligenceProvider): void => {
    set((state) => ({
      hasCompletedOnboarding: true,
      profile,
      userAllergies: allergies,
      vaccineMilestones: generateMilestones(profile.dob),
      ...(aiPref ? { aiPreference: aiPref } : {}),
    }));
  },

  resetOnboarding: (): void => {
    set({ hasCompletedOnboarding: false });
  },

  importPatientFHIRData: (
    patientProfile: Partial<UserProfile>,
    records: Omit<MedicalRecord, 'id'>[],
    medications: Omit<MedicationItem, 'id' | 'status'>[],
    vitals: Omit<VitalLogEntry, 'id' | 'timestamp'>[],
    completedVaccines: string[]
  ): void => {
    set((state) => {
      const updatedProfile = {
        ...state.profile,
        ...patientProfile,
      };

      const baseMilestones = generateMilestones(updatedProfile.dob);
      const lowercaseCompleted = completedVaccines.map((v) => v.toLowerCase().trim());
      const updatedMilestones = baseMilestones.map((milestone) => {
        const targetLower = milestone.targetDisease.toLowerCase();
        const nameLower = milestone.name.toLowerCase();
        const isMatch = lowercaseCompleted.some(
          (cv) => cv.includes(targetLower) || targetLower.includes(cv) || cv.includes(nameLower) || nameLower.includes(cv)
        );
        return isMatch ? { ...milestone, status: 'Completed' as const } : milestone;
      });

      const importedRecords: MedicalRecord[] = records.map((r, index) => ({
        ...r,
        id: `fhir_rec_${Date.now()}_${index}`,
      }));

      const importedMeds: MedicationItem[] = medications.map((m, index) => ({
        ...m,
        id: `fhir_med_${Date.now()}_${index}`,
        status: 'Pending',
      }));

      const todayStr = localDate();
      const importedVitals: VitalLogEntry[] = vitals.map((v, index) => ({
        ...v,
        id: `fhir_vit_${Date.now()}_${index}`,
        timestamp: todayStr,
      }));

      // Cancel all existing scheduled reminders first
      state.medicationSchedule.forEach((med) => {
        NotificationService.cancelMedicationReminder(med.id);
      });

      // Schedule reminders for new imported meds
      importedMeds.forEach((med) => {
        if (!state.isTestMode) void NotificationService.scheduleMedicationReminder(
          med.id,
          med.name,
          med.dosage,
          med.time
        );
      });

      return {
        profile: updatedProfile,
        vaccineMilestones: updatedMilestones,
        medicalRecords: importedRecords,
        medicationSchedule: importedMeds,
        vitalsLogs: [...importedVitals, ...state.vitalsLogs].slice(0, 50),
        lastSyncedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      };
    });
  },

  startWorkout: (type: 'Run' | 'Walk' | 'Cycle') => set({
    isTrackingActive: true,
    trackingType: type,
    trackingStartTime: new Date().toISOString(),
    trackingPath: [],
    trackingSteps: 0,
    trackingDistance: 0,
    trackingCalories: 0,
  }),

  updateWorkoutProgress: (coords: any, steps: number, distance: number, calories: number) => set((state) => ({
    trackingPath: [...state.trackingPath, coords],
    trackingSteps: state.trackingSteps + steps,
    trackingDistance: state.trackingDistance + distance,
    trackingCalories: state.trackingCalories + calories,
  })),

  stopWorkout: () => set((state) => {
    if (!state.isTrackingActive || !state.trackingStartTime || !state.trackingType) return {};
    
    const endTime = new Date().toISOString();
    const newWorkout = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: state.trackingType,
      startTime: state.trackingStartTime,
      endTime,
      steps: Math.round(state.trackingSteps),
      calories: Math.round(state.trackingCalories),
      distance: Math.round(state.trackingDistance),
      path: state.trackingPath,
    };

    return {
      appWorkouts: [...state.appWorkouts, newWorkout],
      isTrackingActive: false,
      trackingType: null,
      trackingStartTime: null,
      trackingPath: [],
      trackingSteps: 0,
      trackingDistance: 0,
      trackingCalories: 0,
    };
  }),

  // ----- Complete Workout Hub Actions -----
  addWorkout: (workout: WorkoutSession) => {
    const saved: WorkoutSession = {...workout,healthSyncVersion:1,healthSyncStatus:'pending'};
    set(state => ({workouts: [saved, ...state.workouts]}));
    syncSavedWorkout(saved);
    useSafeScaleStore.getState().recalculateRecoveryScore();
  },

  startLiveWorkout: (type: WorkoutType, name?: string) => {
    if (useSafeScaleStore.getState().activeWorkout) return;
    const session: WorkoutSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      name: name || `${type} Session`,
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      caloriesBurned: 0,
      distanceMeters: 0,
      source: 'app',
      routeCoordinates: [],
      strengthSets: [],
    };
    set({
      activeWorkout: session,
      isTrackingActive: true,
      trackingType: type === 'Running' ? 'Run' : type === 'Walking' ? 'Walk' : type === 'Cycling' ? 'Cycle' : null,
      trackingStartTime: session.startedAt,
      trackingPath: [],
      trackingSteps: 0,
      trackingDistance: 0,
      trackingCalories: 0,
    });
  },

  updateLiveWorkout: (update: Partial<WorkoutSession>) => set((state) => {
    if (!state.activeWorkout) return {};
    return {
      activeWorkout: {
        ...state.activeWorkout,
        ...update,
      },
    };
  }),

  finishLiveWorkout: () => {
    const state = useSafeScaleStore.getState();
    const active = state.activeWorkout;
    if (!active) return null;

    const endedAt = new Date().toISOString();
    const durationSeconds = workoutElapsedSeconds(active.startedAt, Date.parse(endedAt));
    
    const caloriesBurned = estimateCaloriesBurned(active.type, durationSeconds, state.profile.weight || 70);

    const finishedWorkout: WorkoutSession = {
      ...active,
      endedAt,
      durationSeconds,
      caloriesBurned,
      healthSyncStatus: 'pending',
      healthSyncVersion: 1,
    };

    set((s) => ({
      workouts: [finishedWorkout, ...s.workouts],
      activeWorkout: null,
      isTrackingActive: false,
      trackingType: null,
      trackingStartTime: null,
      trackingPath: [],
      trackingSteps: 0,
      trackingDistance: 0,
      trackingCalories: 0,
    }));

    syncSavedWorkout(finishedWorkout);
    useSafeScaleStore.getState().recalculateRecoveryScore();

    return finishedWorkout;
  },

  cancelLiveWorkout: () => set({
    activeWorkout: null,
    isTrackingActive: false,
    trackingType: null,
    trackingStartTime: null,
    trackingPath: [],
    trackingSteps: 0,
    trackingDistance: 0,
    trackingCalories: 0,
  }),

  deleteWorkout: (id: string) => set((state) => ({
    workouts: state.workouts.filter((w) => w.id !== id),
    appWorkouts: state.appWorkouts.filter((w) => w.id !== id),
  })),

  setActivityRings: (rings: Partial<ActivityRingsData>) => set((state) => ({
    activityRings: {
      ...state.activityRings,
      ...rings,
    },
  })),

  recalculateRecoveryScore: () => {
    const state = useSafeScaleStore.getState();
    const bio = state.biometricCore;
    const baseRHR = bio.historicalRHR && bio.historicalRHR.length > 0
      ? Math.round(bio.historicalRHR.reduce((a, b) => a + b, 0) / bio.historicalRHR.length)
      : 0;

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = state.weeklyHistory.find(day => day.date === localDate(yesterdayDate));
    const yesterdayStrain = yesterday?.activeCalories;

    const recovery = computeRecoveryScore({
      sleepMinutes: bio.sleepMinutes || 0,
      currentRHR: bio.restingHeartRate || 0,
      baselineRHR: baseRHR,
      yesterdayStrainCalories: yesterdayStrain,
    });

    set({ recoveryScore: recovery });
  },

  // ----- Sleep Architecture Actions -----
  updateSleepStages: (stages: Partial<SleepStageBreakdown>) => {
    set((state) => {
      const nextStages = { ...state.sleepStages, ...stages };
      const nextSleepMins = nextStages.totalSleepMinutes || state.biometricCore.sleepMinutes || 0;
      return {
        sleepStages: nextStages,
        biometricCore: {
          ...state.biometricCore,
          sleepMinutes: nextSleepMins,
        },
      };
    });
    useSafeScaleStore.getState().recalculateSleepDebt();
    useSafeScaleStore.getState().recalculateRecoveryScore();
  },

  recalculateSleepDebt: () => {
    const state = useSafeScaleStore.getState();

    const todaySleep = state.sleepStages.totalSleepMinutes || state.biometricCore.sleepMinutes || 0;
    const allDays = [...state.weeklyHistory.filter(h => h.date !== localDate()).map(h => h.sleepMinutes), todaySleep].slice(-7);
    const debt = calculateSleepDebt(allDays, 480);
    set({ sleepDebt: debt });
  },

  // ----- Intermittent Fasting Actions -----
  startFast: (protocol?: FastingProtocol, customHours?: number) => {
    set((state) => {
      const prot = protocol || state.fastingSession.protocol || '16:8';
      const targetH = customHours || getProtocolTargetHours(prot);
      return {
        fastingSession: {
          ...state.fastingSession,
          isFasting: true,
          startedAt: new Date().toISOString(),
          protocol: prot,
          targetHours: targetH,
        },
      };
    });
  },

  endFast: () => {
    const state = useSafeScaleStore.getState();
    const sess = state.fastingSession;
    if (!sess.isFasting || !sess.startedAt) return null;

    const endedAt = new Date().toISOString();
    const durationSeconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(sess.startedAt)) / 1000));
    const completed = durationSeconds >= sess.targetHours * 3600;

    const entry: FastingHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      startedAt: sess.startedAt,
      endedAt,
      targetHours: sess.targetHours,
      durationSeconds,
      protocol: sess.protocol,
      completed,
    };

    set((s) => ({
      fastingSession: {
        ...s.fastingSession,
        isFasting: false,
        startedAt: null,
        history: [entry, ...s.fastingSession.history].slice(0, 30),
      },
    }));

    return entry;
  },

  setFastingProtocol: (protocol: FastingProtocol, customHours?: number) => {
    const targetHours = customHours || getProtocolTargetHours(protocol);
    set((state) => ({
      fastingSession: {
        ...state.fastingSession,
        protocol,
        targetHours,
      },
    }));
  },

  // ----- Cardiovascular & HRV Diagnostics -----
  updateHRVMetrics: (metrics: Partial<HRVMetrics>) => set((state) => ({
    hrvMetrics: {
      ...state.hrvMetrics,
      ...metrics,
    },
  })),

  setDeviceConnected: (device, connected) => set((state) => ({
    connectedDevices: {
      ...state.connectedDevices,
      [device]: connected,
    },
  })),
    }),
    {
      name: 'safescale-storage',
      storage: createJSONStorage(() => SecureHealthStorage),
      partialize: (state) => {
        // Demo edits never replace the real profile on disk, including after a restart.
        if (state.isTestMode && demoSnapshot) state = demoSnapshot;
        return ({
        userAllergies: state.userAllergies,
        medicationSchedule: state.medicationSchedule,
        medicationDay: state.medicationDay,
        doseEvents: state.doseEvents,
        biometricCore: state.biometricCore,
        isLocalAIOptedIn: state.isLocalAIOptedIn,
        aiPreference: state.aiPreference,
        hasHealthPermission: state.hasHealthPermission,
        weeklyHistory: state.weeklyHistory,
        lastSyncedAt: state.lastSyncedAt,
        crowdsourcedReports: state.crowdsourcedReports,
        loggedItems: state.loggedItems,
        hydrationGoal: state.hydrationGoal,
        calorieGoal: state.calorieGoal,
        medicalRecords: state.medicalRecords,
        hydrationNotificationsEnabled: state.hydrationNotificationsEnabled,
        hydrationIntervalHours: state.hydrationIntervalHours,
        emergencyContacts: state.emergencyContacts,
        symptomLogs: state.symptomLogs,
        profile: state.profile,
        vaccineMilestones: state.vaccineMilestones,
        moodLogs: state.moodLogs,
        vitalsLogs: state.vitalsLogs,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        activeWorkout: state.activeWorkout,
        isTrackingActive: state.isTrackingActive,
        trackingStartTime: state.trackingStartTime,
        trackingType: state.trackingType,
        appWorkouts: state.appWorkouts,
        workouts: state.workouts,
        activityRings: state.activityRings,
        sleepStages: state.sleepStages,
        sleepDebt: state.sleepDebt,
        fastingSession: state.fastingSession,
        hrvMetrics: state.hrvMetrics,
        lastSuccessfulSync: state.lastSuccessfulSync,
        connectedDevices: state.connectedDevices,
      });
      },
    }
  )
);

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

export const selectMoodLogs = (
  state: SafeScaleState,
): MoodEntry[] => state.moodLogs;

export const selectVitalsLogs = (
  state: SafeScaleState,
): VitalLogEntry[] => state.vitalsLogs;

/** Imported rings remain authoritative; a local estimate never increments them. */
const pendingWorkoutSaves = new Set<string>();
function syncSavedWorkout(workout: WorkoutSession): void {
  if (pendingWorkoutSaves.has(workout.id)) return;
  pendingWorkoutSaves.add(workout.id);
  const demo = useSafeScaleStore.getState().isTestMode;
  const revision = useSafeScaleStore.getState().dataRevision;
  const save = demo ? Promise.resolve(false) : Promise.resolve().then(() => HealthDataService.saveWorkoutToHealthKit(workout));
  void save.catch(() => false).then(saved => {
    // Ignore a completion from a different profile mode or a deleted record.
    if (useSafeScaleStore.getState().isTestMode !== demo || useSafeScaleStore.getState().dataRevision !== revision) return;
    useSafeScaleStore.setState(state => ({workouts: state.workouts.map(item => item.id === workout.id
      ? {...item, healthSyncStatus: saved ? 'saved' as const : 'not-saved' as const} : item)}));
  }).finally(() => pendingWorkoutSaves.delete(workout.id));
}

/** User-confirmed local deletion; external HealthKit/Google copies are untouched. */
export async function deleteLocalHealthData(): Promise<void> {
  const state = useSafeScaleStore.getState();
  if (state.isTestMode || state.isDeletingData) throw new Error('Exit sample mode before deleting personal data.');
  const revision = state.dataRevision + 1;
  useSafeScaleStore.setState({isDeletingData:true, dataRevision:revision});
  try {
    await NotificationService.cancelAllReminders();
    await SecureHealthStorage.clearSavedData();
    demoSnapshot = null;
    useSafeScaleStore.setState({...useSafeScaleStore.getInitialState(), dataRevision:revision}, true);
    await SecureHealthStorage.retryWrite();
  } catch (error) {
    useSafeScaleStore.setState({isDeletingData:false});
    throw error;
  }
}

export function retryWorkoutSync(id: string): void {
  const state = useSafeScaleStore.getState();
  const workout = state.workouts.find(item => item.id === id);
  if (!workout || workout.healthSyncVersion !== 1 || workout.healthSyncStatus === 'saved' || state.isTestMode || state.isDeletingData) return;
  useSafeScaleStore.setState({workouts:state.workouts.map(item => item.id === id ? {...item,healthSyncStatus:'pending'} : item)});
  syncSavedWorkout(workout);
}
