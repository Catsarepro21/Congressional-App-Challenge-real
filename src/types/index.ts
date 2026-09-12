/**
 * @file src/types/index.ts
 * @description Central type registry for the SafeScale Health application.
 *
 * All domain interfaces and union types are defined here and exported for
 * consumption by services, store, and UI components. Zero usage of `any`.
 */

// ---------------------------------------------------------------------------
// AI Intelligence Provider Domain
// ---------------------------------------------------------------------------

/**
 * Specifies which AI / intelligence backend the app routes requests through.
 *
 * - 'on-device':  Apple Foundation Models (iOS 18.1+, A17 Pro / M-series) or
 *                 Android AICore / Gemini Nano (Android 14+, Pixel 8+ / Galaxy S24+).
 *                 100 % offline, zero data leaves the device.
 * - 'cloud':      Cloud API (currently Gemini 2.5 Flash). Requires network.
 * - 'opt-out':    Deterministic heuristic rules only (AllergenEngine, static dict).
 *                 No neural model of any kind is invoked.
 */
export type AIIntelligenceProvider = 'on-device' | 'cloud' | 'opt-out';

/**
 * Runtime hardware capability report returned by the native bridge.
 */
export interface AIDeviceCapabilities {
  /** Whether the current device supports on-device foundation models */
  readonly isOnDeviceSupported: boolean;
  /** Human-readable reason when unsupported (e.g. "Requires A17 Pro or newer") */
  readonly unsupportedReason?: string;
  /** The specific on-device runtime available */
  readonly runtime?: 'apple-foundation' | 'android-aicore' | 'mediapipe-genai';
  /** Device chip identifier for diagnostics */
  readonly chipId?: string;
}

// ---------------------------------------------------------------------------
// Medication Domain
// ---------------------------------------------------------------------------

/**
 * Represents a single medication entry in the user's daily schedule.
 * The `icon` field maps to a MaterialCommunityIcons identifier string.
 */
export interface MedicationItem {
  /** Unique stable identifier for the medication entry. */
  readonly id: string;
  /** Display name of the medication (e.g. "Lisinopril"). */
  name: string;
  /** Human-readable dosage string (e.g. "10mg", "2 tablets"). */
  dosage: string;
  /**
   * Scheduled administration time in 24-hour HH:MM format.
   * Example: "08:00", "21:30"
   */
  time: string;
  /** Current lifecycle state of the medication for today's schedule. */
  status: 'Completed' | 'Active' | 'Pending';
  /** MaterialCommunityIcons icon name (e.g. "pill", "pill-multiple"). */
  icon: string;
  /** Current stock of medication remaining. */
  stock?: number;
  stockDebited?: boolean;
  /** Threshold below which a low stock alert should trigger. */
  refillThreshold?: number;
  /** Toggle flag for low stock reminder notifications. */
  refillAlertsEnabled?: boolean;
  /** Inactive ingredients to cross-check for allergies. */
  inactiveIngredients?: string[];
}

// ---------------------------------------------------------------------------
// Biometric Domain
// ---------------------------------------------------------------------------

/**
 * Represents a snapshot of the user's normalized biometric data.
 * All numeric values are stored in SI-adjacent units documented inline.
 */
export interface BiometricSummary {
  /** Current or most recently polled heart rate in beats-per-minute. */
  heartRate: number;
  /** Resting heart rate in beats-per-minute, derived from the lowest
   *  observed reading in the current telemetry window. */
  restingHeartRate: number;
  /** Total sleep duration for the most recent sleep session in minutes. */
  sleepMinutes: number;
  /**
   * Sleep consistency score from 0 to 100.
   * 100 = perfectly consistent sleep timing across observed nights.
   * Sourced from platform health APIs or simulated via HealthDataService.
   */
  sleepConsistency: number;
  /** Daily step count sourced from pedometer data. */
  steps: number;
  /**
   * Active (exercise) calories burned in kcal.
   * Normalized from both Apple HealthKit (`HKQuantityTypeIdentifierActiveEnergyBurned`)
   * and Android Health Connect (`EnergyExpended`) via HealthDataService.
   */
  activeCalories: number;
  /**
   * Computed composite score from 1 to 100.
   * Calculated by HealthDataService.calculateHealthStabilityScore().
   * Returns 85 (neutral baseline) when historicalRHR.length < 3.
   */
  dailyStabilityScore: number;
  /**
   * Rolling window of daily resting heart rate readings, capped at 14 entries.
   * Used as the historical dataset for standard deviation calculations.
   * Must contain >= 3 entries for variance-based scoring to activate.
   */
  historicalRHR: number[];
}

/**
 * Represents a single daily summary stored in the weekly history tracking system.
 */
export interface WeeklyHistoryEntry {
  /** Date formatted as YYYY-MM-DD */
  readonly date: string;
  steps: number;
  activeCalories: number;
  stabilityScore: number;
  sleepMinutes: number;
  heartRate: number;
  medicationAdherence: number; // Percentage from 0 to 100
}

// ---------------------------------------------------------------------------
// Scanner / Allergen Domain
// ---------------------------------------------------------------------------

/**
 * Result produced by AllergenEngine.analyzeIngredients().
 * This is a pure data object — no store references, no side effects.
 */
export interface AllergenMatchResult {
  /** Human-readable name or label of the scanned food item. */
  itemName: string;
  /** True if one or more detected ingredients matched a user allergen. */
  matchFound: boolean;
  /**
   * Subset of detectedIngredients that triggered an allergen match.
   * Empty array when matchFound === false.
   */
  flaggedIngredients: string[];
  /**
   * Positive macro-nutrient tags rendered as green pill badges
   * when the item is deemed safe (matchFound === false).
   * Example: ["Gluten Free", "High Protein", "Low Sodium"]
   */
  alternativeSafeMacros: string[];
}

/**
 * Metrics captured alongside an image payload during active scanning.
 * Populated by the camera controller and stored for diagnostic telemetry.
 */
export interface ScanPayloadMetrics {
  /** Resolution of the captured frame in pixels. */
  resolution: {
    width: number;
    height: number;
  };
  /** End-to-end OCR + engine processing time in milliseconds. */
  processingTimeMs: number;
  /**
   * Aggregate confidence score [0.0 – 1.0] returned by the OCR model
   * for the detected text payload.
   */
  confidenceScore: number;
}

/**
 * Represents structured analysis of a single ingredient researched on-device.
 */
export interface IngredientInsight {
  readonly name: string;
  readonly category: 'Safe' | 'Allergen' | 'Unknown';
  readonly riskLevel: 'Low' | 'Medium' | 'High';
  readonly description: string; // Dynamic local description of the ingredient
  readonly alternatives: string[]; // List of recommended safe substitutes
}

/**
 * Structured analysis result from the on-device AI model.
 */
export interface LocalAIAnalysisResult {
  readonly itemName: string;
  readonly insights: IngredientInsight[];
  readonly summary: string; // Explanatory summary from the local model
  readonly processingTimeMs: number;
}

/**
 * Represents a single crowdsourced allergen report posted to the local map.
 */
export interface CrowdsourcedReport {
  readonly id: string;
  readonly allergen: string;
  readonly severity: 'Low' | 'Medium' | 'High';
  readonly notes?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly x: number; // visual x-coord on map
  readonly y: number; // visual y-coord on map
  readonly timestamp: string;
}

/**
 * Tracks the full lifecycle state of the scanner camera view.
 * Managed via useSafeScaleStore.setScanState().
 */
export interface ScanState {
  /** Whether the camera viewfinder is currently mounted and active. */
  isCameraActive: boolean;
  /** True while OCR extraction and allergen analysis are in-flight. */
  isProcessing: boolean;
  /**
   * Metrics from the last captured payload frame.
   * Null before the first scan is initiated.
   */
  currentPayloadMetrics: ScanPayloadMetrics | null;
  /**
   * The result of the most recent allergen analysis run.
   * Null before the first scan completes.
   */
  lastMatchResult: AllergenMatchResult | null;
}

/**
 * Represents a logged activity/workout from the built-in GPS tracker.
 */
export interface AppWorkout {
  readonly id: string;
  readonly type: 'Run' | 'Walk' | 'Cycle';
  readonly startTime: string; // ISO
  readonly endTime: string; // ISO
  readonly steps: number;
  readonly calories: number;
  readonly distance: number; // meters
  readonly path: Array<{ latitude: number; longitude: number; timestamp: number }>;
}

// ---------------------------------------------------------------------------
// Global Store Shape
// ---------------------------------------------------------------------------

/**
 * Complete type contract for the Zustand global store.
 * Combines all state slices with their corresponding action signatures.
 *
 * IMPORTANT: AllergenEngine is NOT imported here or inside the store.
 * The UI/controller layer calls AllergenEngine.analyzeIngredients() as a
 * pure function and passes its return value into triggerAllergenAlert(),
 * preventing any circular import dependency.
 */
export interface SafeScaleState {
  // ----- State Slices -------------------------------------------------------

  /**
   * User-configured list of allergen names.
   * Default: ['Peanut', 'Almond']
   * Case-insensitive during matching — stored in their display-casing form.
   */
  userAllergies: string[];

  /** Ordered list of medications in today's administration schedule. */
  medicationSchedule: MedicationItem[];
  medicationDay: string | null;
  ensureCurrentDay: () => void;

  /** Live biometric summary, updated by HealthDataService.syncTelemetry(). */
  biometricCore: BiometricSummary;

  /** Current camera and scan session state. */
  scanState: ScanState;

  /**
   * Elevated to true immediately when an allergen intersection is detected.
   * Drives the Coral-Red bottom sheet modal render condition.
   */
  hasTriggeredAllergen: boolean;

  /**
   * The specific ingredient strings that matched a user allergen.
   * Mirrors AllergenMatchResult.flaggedIngredients for direct UI consumption.
   */
  flaggedIngredients: string[];

  /** Whether the user has opted in to the local AI ingredient analysis. */
  isLocalAIOptedIn: boolean;

  /** The result of the most recent local AI analysis run. */
  localAIAnalysisResult: LocalAIAnalysisResult | null;

  /** Timestamp of the last successful health data synchronization. */
  lastSyncedAt: string | null;

  /** Whether a background auto-sync is currently in progress. */
  isAutoSyncing: boolean;

  /** Toggle background health auto-sync on app open / active state. */
  setAutoSyncEnabled: (enabled: boolean) => void;

  /** Silently sync the active health source if auto-sync is enabled and throttle interval has elapsed. */
  triggerAutoSync: () => void;

  /** Rolling history of daily biometric records for the past week (max 7 days). */
  weeklyHistory: WeeklyHistoryEntry[];

  // ----- Built-in GPS & Step Tracker Slices -----
  isTrackingActive: boolean;
  trackingType: 'Run' | 'Walk' | 'Cycle' | null;
  trackingStartTime: string | null;
  trackingPath: Array<{ latitude: number; longitude: number; timestamp: number }>;
  trackingSteps: number;
  trackingDistance: number; // in meters
  trackingCalories: number; // in kcal
  appWorkouts: AppWorkout[];
  lastSuccessfulSync: string | null; // Anchored timestamp for delta sync

  // ----- Direct Wearable APIs State -----
  connectedDevices: {
    fitbit: boolean;
    strava: boolean;
    polar: boolean;
    withings: boolean;
  };

  // ----- Actions ------------------------------------------------------------

  /** Replaces the entire userAllergies array atomically. */
  setUserAllergies: (allergies: string[]) => void;

  /**
   * Appends a new allergen to the list.
   * No-op if the allergen already exists (case-insensitive check).
   */
  addAllergy: (allergy: string) => void;

  /**
   * Removes an allergen from the list by name.
   * Case-insensitive match.
   */
  removeAllergy: (allergy: string) => void;

  /**
   * Updates the status field of a single MedicationItem by id.
   * All other medication fields are preserved.
   */
  setMedicationStatus: (id: string, status: MedicationItem['status']) => void;

  /**
   * Shallow-merges a partial BiometricSummary update into biometricCore.
   * Fields not included in the partial are unchanged.
   */
  updateBiometrics: (biometrics: Partial<BiometricSummary>) => void;

  /**
   * Shallow-merges a partial ScanState update into scanState.
   * Fields not included in the partial are unchanged.
   */
  setScanState: (update: Partial<ScanState>) => void;

  /**
   * Called by the UI controller after AllergenEngine detects a match.
   * Sets hasTriggeredAllergen, populates flaggedIngredients, stores
   * the full match result, and clears isProcessing.
   */
  triggerAllergenAlert: (
    flagged: string[],
    matchResult: AllergenMatchResult,
  ) => void;

  /**
   * Dismisses the allergen alert state without resetting the camera.
   * Used when the user swipes down the alert bottom sheet.
   */
  clearAllergenAlert: () => void;

  /**
   * Full scan session reset — clears all allergen and processing state
   * and reactivates the camera viewfinder for the next scan.
   */
  resetScan: () => void;

  /** Updates the opt-in preference for local AI. */
  setLocalAIOptedIn: (optedIn: boolean) => void;

  /** Stores the result of a local AI analysis run. */
  setLocalAIAnalysisResult: (result: LocalAIAnalysisResult | null) => void;

  /** Whether test/simulation mode is currently active. */
  isTestMode: boolean;

  /** Toggles the test mode on/off, clearing or seeding data. */
  toggleTestMode: () => void;

  /** Adds a new medication item to the schedule. */
  addMedication: (medication: Omit<MedicationItem, 'id' | 'status'>) => void;

  /** Removes a medication item from the schedule by id. */
  removeMedication: (id: string) => void;

  /** Health data authorization status. null = unrequested, false = denied, true = approved */
  hasHealthPermission: boolean | null;
  /** Sets the health tracker data sharing permission state. */
  setHealthPermission: (granted: boolean | null) => void;
  /** Active crowdsourced allergen reports visualised on the map. */
  crowdsourcedReports: CrowdsourcedReport[];
  /** Adds a new crowdsourced report dynamically. */
  addCrowdsourcedReport: (report: Omit<CrowdsourcedReport, 'id' | 'timestamp'>) => void;
  /** Purges all crowdsourced reports. */
  clearCrowdsourcedReports: () => void;

  /** Health logged meals and hydration items. */
  loggedItems: LoggedItem[];
  /** Logs a meal or water entry. */
  addLoggedItem: (item: Omit<LoggedItem, 'id' | 'timestamp'>) => void;
  /** Removes a log entry by id. */
  deleteLoggedItem: (id: string) => void;
  /** Clears all logged entries. */
  clearLoggedItems: () => void;

  /** Dynamic daily hydration goal (default 2000 ml) */
  hydrationGoal: number;
  /** Dynamic daily calorie intake goal (default 2000 kcal) */
  calorieGoal: number;
  /** Set daily hydration goal */
  setHydrationGoal: (goal: number) => void;
  /** Set daily calorie goal */
  setCalorieGoal: (goal: number) => void;

  /** Official Clinical Medical Records */
  medicalRecords: MedicalRecord[];
  /** Add a medical record (simulated import or direct upload) */
  addMedicalRecord: (record: Omit<MedicalRecord, 'id'>) => void;
  /** Delete a medical record */
  deleteMedicalRecord: (id: string) => void;
  /** Clear all medical records */
  clearMedicalRecords: () => void;

  // ----- Hydration Alerts and Emergency Plan State -----
  /** Toggle flag for daily recurring water reminders */
  hydrationNotificationsEnabled: boolean;
  /** Time interval in hours between hydration alerts */
  hydrationIntervalHours: number;
  /** Set hydration alert toggle status */
  setHydrationNotificationsEnabled: (enabled: boolean) => void;
  /** Set interval hours for hydration alerts */
  setHydrationIntervalHours: (hours: number) => void;

  /** Registered emergency contact list */
  emergencyContacts: EmergencyContact[];
  /** Add a contact for anaphylaxis/allergy reaction events */
  addEmergencyContact: (contact: Omit<EmergencyContact, 'id'>) => void;
  /** Remove emergency contact by id */
  removeEmergencyContact: (id: string) => void;

  /** Restock medication quantity */
  refillMedication: (id: string, amount: number) => void;

  // ----- Personal Profile State -----
  /** Personal profile data */
  profile: UserProfile;
  /** Update user profile properties */
  updateProfile: (profile: Partial<UserProfile>) => void;

  // ----- Vaccine Milestone State & Actions -----
  /** Scheduled immunization milestones */
  vaccineMilestones: VaccineMilestone[];
  /** Import a scanned document into the records vault */
  addScannedDocument: (record: Omit<MedicalRecord, 'id'>) => void;
  /** Complete an immunization milestone */
  completeVaccineMilestone: (id: string, dateAdministered?: string, provider?: string) => void;
  /** Regenerate vaccine milestones based on profile DOB */
  initializeVaccineMilestones: () => void;

  // ----- Mood & Vitals Log State & Actions -----
  /** Daily mood logs for correlation analytics */
  moodLogs: MoodEntry[];
  /** Clinical vitals logs (BP, glucose, temp, SpO2) */
  vitalsLogs: VitalLogEntry[];
  /** Add a mood log entry */
  addMoodLog: (entry: Omit<MoodEntry, 'id' | 'timestamp'>) => void;
  /** Add a clinical vital log entry */
  addVitalLog: (entry: Omit<VitalLogEntry, 'id' | 'timestamp'>) => void;
  /** Clear all mood logs */
  clearMoodLogs: () => void;
  /** Clear all vitals logs */
  clearVitalsLogs: () => void;

  // ----- Symptom Log State & Actions -----
  /** Daily symptom logs for flare-up correlation */
  symptomLogs: SymptomLog[];
  /** Add a symptom log entry */
  addSymptomLog: (log: Omit<SymptomLog, 'id' | 'timestamp' | 'date'>) => void;
  /** Delete a symptom log entry by id */
  deleteSymptomLog: (id: string) => void;

  // ----- AI & Foundation Models State & Actions -----
  /** Active AI / Intelligence provider preference */
  aiPreference: AIIntelligenceProvider;
  /** Update AI provider preference */
  setAIPreference: (pref: AIIntelligenceProvider) => void;

  // ----- Onboarding State & Actions -----
  /** Whether the user has completed the first-launch onboarding flow */
  hasCompletedOnboarding: boolean;
  /** Marks onboarding as complete and saves user-entered profile data */
  completeOnboarding: (profile: UserProfile, allergies: string[], aiPreference?: AIIntelligenceProvider) => void;
  /** Resets onboarding status back to incomplete */
  resetOnboarding: () => void;

  // ----- FHIR Portal Sync Action -----
  /** Imports a synced patient's FHIR profile, records, medications, and vitals */
  importPatientFHIRData: (
    patientProfile: Partial<UserProfile>,
    records: Omit<MedicalRecord, 'id'>[],
    medications: Omit<MedicationItem, 'id' | 'status'>[],
    vitals: Omit<VitalLogEntry, 'id' | 'timestamp'>[],
    completedVaccines: string[]
  ) => void;

  // ----- Workouts & Activity Hub State & Actions -----
  workouts: WorkoutSession[];
  activeWorkout: WorkoutSession | null;
  activityRings: ActivityRingsData;
  recoveryScore?: RecoveryReadinessScore;
  addWorkout: (workout: WorkoutSession) => void;
  startLiveWorkout: (type: WorkoutType, name?: string) => void;
  updateLiveWorkout: (update: Partial<WorkoutSession>) => void;
  finishLiveWorkout: () => WorkoutSession | null;
  cancelLiveWorkout: () => void;
  deleteWorkout: (id: string) => void;
  setActivityRings: (rings: Partial<ActivityRingsData>) => void;
  recalculateRecoveryScore: () => void;

  // ----- Direct Wearable APIs Actions -----
  setDeviceConnected: (device: 'fitbit' | 'strava' | 'polar' | 'withings', connected: boolean) => void;

  // ----- Legacy GPS Tracker Compatibility Actions -----
  startWorkout: (type: 'Run' | 'Walk' | 'Cycle') => void;
  updateWorkoutProgress: (coords: any, steps: number, distance: number, calories: number) => void;
  stopWorkout: () => void;
}

/**
 * Represents a logged health telemetry entry (meal nutrition or water hydration).
 */
export interface LoggedItem {
  readonly id: string;
  readonly type: 'Water' | 'Meal';
  readonly name: string;
  readonly value: string; // e.g. "500 ml", "650 kcal"
  readonly date?: string; // Local YYYY-MM-DD; absent for legacy entries
  readonly timestamp: string; // HH:MM
  readonly calories?: number;
  readonly macros?: {
    carbs: number;
    protein: number;
    fat: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
  };
  readonly portion?: string;
  readonly photoUri?: string;
  readonly allergenWarnings?: string[];
}

/**
 * Represents an official clinical medical record imported from a health provider (FHIR format).
 */
export interface MedicalRecord {
  readonly id: string;
  readonly type: 'Immunization' | 'LabResult' | 'Condition' | 'Prescription';
  readonly title: string;
  readonly value: string;
  readonly date: string;
  readonly provider: string;
  readonly status: string;
  readonly fhirData?: string; // Raw simulated FHIR JSON representation
  readonly documentImage?: string; // Mock scanned document image URI
}

/**
 * Represents a contact to be notified or called during allergy emergencies.
 */
export interface EmergencyContact {
  readonly id: string;
  name: string;
  phone: string;
}

/**
 * Represents the user's personal identity and physical baseline metrics.
 */
export type HealthSource = 'apple' | 'health-connect' | 'google-health' | 'google-fit';

/** Describes a wearable device detected via health sample metadata. */
export interface HealthWearableInfo {
  detected: boolean;
  name: string;         // e.g. "Apple Watch", "Pixel Watch", "Galaxy Watch"
  model?: string;
  source: HealthSource;
  lastSampleAt?: string;
}

export interface HealthConnection {
  accessToken?: string;
  refreshToken?: string;
  connectedAt: string;
  lastSyncedAt?: string;
  wearable?: HealthWearableInfo;
}
export interface UserProfile {
  healthConnections?: Partial<Record<HealthSource, HealthConnection>>;
  lastHealthSource?: HealthSource;
  name: string;
  dob: string;
  bloodType: string;
  height: number; // in cm
  weight: number; // in kg
  organDonor?: boolean;
  unitPreference?: 'metric' | 'imperial';
  useGeminiFoodVision?: boolean;
  autoSyncEnabled?: boolean;
  geminiApiKey?: string;
  useGeminiWeeklyReport?: boolean;
  useCloudAIDocuments?: boolean;
  /** Google OAuth 2.0 Client ID (iOS client type) for Google Fit REST API access */
  googleOAuthClientId?: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  /** Auto-detected suggested user name from device hostname (e.g. "Rehan's iPhone" -> "Rehan") */
  deviceNameSuggestedName?: string;
}

export interface FoodAnalysisResult {
  foodName: string;
  portionEstimate: string;
  calories: number;
  carbs: number;    // g
  protein: number;  // g
  fat: number;      // g
  fiber: number;    // g
  sugar: number;    // g
  sodium: number;   // mg
  confidence: 'high' | 'medium' | 'low';
  /** Detected ingredient names (returned by cloud AI for allergen cross-check). */
  ingredients?: string[];
}

export interface WeeklyReport {
  generatedAt: string;
  avgDailyCalories: number;
  avgSleepMinutes: number;
  totalSteps: number;
  avgRestingHR: number;
  avgBloodGlucose: number | null;
  avgSpO2: number | null;
  moodTrend: string;
  narrative: string;
}


/**
 * Represents a scheduled vaccination milestone tracked based on age and DOB.
 */
export interface VaccineMilestone {
  readonly id: string;
  readonly name: string;
  readonly recommendedAge: string;
  readonly targetDisease: string;
  status: 'Pending' | 'Completed';
  dueDate?: string;
  reminderScheduled?: boolean;
}

/**
 * Represents a logged daily mood entry for mental health correlation.
 */
export interface MoodEntry {
  readonly id: string;
  readonly timestamp: string; // YYYY-MM-DD
  rating: number; // 1 to 10
  stressLevel: 'Low' | 'Medium' | 'High';
  feelings: string[]; // e.g. ["Anxious", "Calm", "Energetic"]
  notes?: string;
}

/**
 * Represents a logged clinical vital signs entry.
 */
export interface VitalLogEntry {
  readonly id: string;
  readonly timestamp: string; // YYYY-MM-DD
  systolicBP?: number; // mmHg
  diastolicBP?: number; // mmHg
  bloodGlucose?: number; // mg/dL
  glucoseContext?: 'Fasting' | 'Post-Meal' | 'General';
  spo2?: number; // %
  temperature?: number; // °F
}

/**
 * Represents a logged symptom entry.
 */
export interface SymptomLog {
  readonly id: string;
  readonly date: string;
  readonly timestamp: string;
  type: string;
  severity: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKOUT & ACTIVITY DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

export type WorkoutType =
  | 'Running'
  | 'Walking'
  | 'Cycling'
  | 'Strength'
  | 'HIIT'
  | 'Yoga'
  | 'Other';

export interface StrengthSet {
  exercise: string;
  reps: number;
  weightKg: number;
  completed: boolean;
}

export interface WorkoutCoordinate {
  latitude: number;
  longitude: number;
  timestamp: number;
  altitude?: number;
  speed?: number;
}

export interface HeartRateZoneBreakdown {
  zone1RecoverySeconds: number; // <60% max HR
  zone2AerobicSeconds: number;  // 60-70% max HR
  zone3TempoSeconds: number;    // 70-80% max HR
  zone4ThresholdSeconds: number;// 80-90% max HR
  zone5PeakSeconds: number;     // >90% max HR
}

export interface WorkoutSession {
  readonly id: string;
  type: WorkoutType;
  name: string;
  startedAt: string; // ISO 8601
  endedAt?: string;  // ISO 8601
  durationSeconds: number;
  caloriesBurned: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  heartRateZones?: HeartRateZoneBreakdown;
  routeCoordinates?: WorkoutCoordinate[];
  strengthSets?: StrengthSet[];
  source: 'app' | 'apple-health' | 'google-fit';
  notes?: string;
}

export interface ActivityRingsData {
  moveCalories: number;
  moveTargetCalories: number;
  exerciseMinutes: number;
  exerciseTargetMinutes: number;
  standHours: number;
  standTargetHours: number;
  lastSyncedAt?: string;
}

export interface RecoveryReadinessScore {
  score: number; // 0 to 100
  status: 'Optimal' | 'Good' | 'Fair' | 'Rest Needed';
  sleepFactor: number; // 0 to 100
  rhrFactor: number;   // 0 to 100
  strainFactor: number;// 0 to 100
  recommendation: string;
}
