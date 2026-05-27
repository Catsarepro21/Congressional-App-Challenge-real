/**
 * @file src/types/index.ts
 * @description Central type registry for the SafeScale Health application.
 *
 * All domain interfaces and union types are defined here and exported for
 * consumption by services, store, and UI components. Zero usage of `any`.
 */

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
}
