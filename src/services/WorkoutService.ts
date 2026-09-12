/**
 * @file src/services/WorkoutService.ts
 * @description Domain intelligence for live workout tracking, heart rate zones, MET calorie estimation, and Recovery Readiness scoring.
 */

import type {
  WorkoutType,
  HeartRateZoneBreakdown,
  RecoveryReadinessScore,
} from '../types';

/**
 * Standard Metabolic Equivalent of Task (MET) multipliers.
 */
export const WORKOUT_METS: Record<WorkoutType, number> = {
  Running: 9.8,
  Walking: 3.5,
  Cycling: 7.5,
  Strength: 5.0,
  HIIT: 8.5,
  Yoga: 3.0,
  Other: 4.5,
};

/**
 * Computes maximum heart rate using the standard formula.
 */
export function calculateMaxHeartRate(age?: number): number {
  if (typeof age === 'number' && age >= 10 && age <= 110) {
    return 220 - age;
  }
  return 190; // Standard default
}

/**
 * Returns the HR zone index (1 to 5) for a given BPM.
 */
export function getHeartRateZone(bpm: number, maxHR: number): 1 | 2 | 3 | 4 | 5 {
  if (bpm <= 0 || maxHR <= 0) return 1;
  const pct = (bpm / maxHR) * 100;
  if (pct >= 90) return 5;
  if (pct >= 80) return 4;
  if (pct >= 70) return 3;
  if (pct >= 60) return 2;
  return 1;
}

/**
 * Computes the duration spent in each heart rate zone from a stream of BPM readings.
 */
export function calculateZoneBreakdown(
  bpmSamples: number[],
  maxHR: number,
  durationSeconds: number,
): HeartRateZoneBreakdown {
  if (!bpmSamples || bpmSamples.length === 0 || durationSeconds <= 0) {
    return {
      zone1RecoverySeconds: durationSeconds,
      zone2AerobicSeconds: 0,
      zone3TempoSeconds: 0,
      zone4ThresholdSeconds: 0,
      zone5PeakSeconds: 0,
    };
  }

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const bpm of bpmSamples) {
    const zone = getHeartRateZone(bpm, maxHR);
    counts[zone]++;
  }

  const totalSamples = bpmSamples.length;
  const secondsPerSample = durationSeconds / totalSamples;

  return {
    zone1RecoverySeconds: Math.round(counts[1] * secondsPerSample),
    zone2AerobicSeconds: Math.round(counts[2] * secondsPerSample),
    zone3TempoSeconds: Math.round(counts[3] * secondsPerSample),
    zone4ThresholdSeconds: Math.round(counts[4] * secondsPerSample),
    zone5PeakSeconds: Math.round(counts[5] * secondsPerSample),
  };
}

/**
 * Estimates active calories burned using MET formula.
 * Formula: Calories = (MET * 3.5 * weightKg / 200) * durationMinutes
 */
export function estimateCaloriesBurned(
  type: WorkoutType,
  durationSeconds: number,
  weightKg: number = 70,
): number {
  if (durationSeconds <= 0) return 0;
  const met = WORKOUT_METS[type] ?? 4.5;
  const weight = Math.max(30, Math.min(250, weightKg));
  const durationMinutes = durationSeconds / 60;
  const calories = ((met * 3.5 * weight) / 200) * durationMinutes;
  return Math.round(calories);
}

/**
 * Formats pace in MM:SS per km and mile.
 */
export function calculatePace(distanceMeters: number, durationSeconds: number): {
  minPerKm: string;
  minPerMi: string;
} {
  if (distanceMeters <= 50 || durationSeconds <= 0) {
    return { minPerKm: '--:--', minPerMi: '--:--' };
  }

  const km = distanceMeters / 1000;
  const miles = distanceMeters / 1609.34;

  const secPerKm = durationSeconds / km;
  const secPerMi = durationSeconds / miles;

  const fmt = (sec: number) => {
    if (!Number.isFinite(sec) || sec > 3600) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return {
    minPerKm: fmt(secPerKm),
    minPerMi: fmt(secPerMi),
  };
}

/**
 * Computes a scientific Recovery Readiness Score (0-100%).
 * Evaluates:
 *   1. Sleep duration vs 8-hour target (45% weight)
 *   2. Resting Heart Rate deviation vs baseline (35% weight)
 *   3. Previous-day active workout strain (20% weight)
 */
export function computeRecoveryScore({
  sleepMinutes = 0,
  currentRHR = 0,
  baselineRHR = 0,
  yesterdayStrainCalories = 0,
}: {
  sleepMinutes?: number;
  currentRHR?: number;
  baselineRHR?: number;
  yesterdayStrainCalories?: number;
}): RecoveryReadinessScore {
  // 1. Sleep Factor (target 480 min = 8 hours)
  let sleepFactor = 70;
  if (sleepMinutes > 0) {
    if (sleepMinutes >= 450 && sleepMinutes <= 540) {
      sleepFactor = 100; // Optimal 7.5 - 9h
    } else if (sleepMinutes >= 390 && sleepMinutes < 450) {
      sleepFactor = 85;  // 6.5 - 7.5h
    } else if (sleepMinutes >= 330 && sleepMinutes < 390) {
      sleepFactor = 70;  // 5.5 - 6.5h
    } else if (sleepMinutes >= 270 && sleepMinutes < 330) {
      sleepFactor = 50;  // 4.5 - 5.5h
    } else if (sleepMinutes > 540) {
      sleepFactor = 80;  // Overslept
    } else {
      sleepFactor = 35;  // Severe sleep deficit
    }
  }

  // 2. Resting Heart Rate Factor (lower RHR vs baseline = higher parasympathetic recovery)
  let rhrFactor = 80;
  if (currentRHR > 0 && baselineRHR > 0) {
    const diff = currentRHR - baselineRHR;
    if (diff <= -3) {
      rhrFactor = 100; // Excellent autonomic recovery
    } else if (diff <= 0) {
      rhrFactor = 90;
    } else if (diff <= 3) {
      rhrFactor = 75;  // Slight physiological stress
    } else if (diff <= 7) {
      rhrFactor = 55;  // Noticeable stress / fatigue
    } else {
      rhrFactor = 30;  // High cardiovascular strain / potential illness
    }
  }

  // 3. Strain Factor (intense workout yesterday = temporary recovery deficit)
  let strainFactor = 90;
  if (yesterdayStrainCalories > 0) {
    if (yesterdayStrainCalories < 300) {
      strainFactor = 100; // Light day
    } else if (yesterdayStrainCalories < 600) {
      strainFactor = 85;  // Moderate volume
    } else if (yesterdayStrainCalories < 900) {
      strainFactor = 70;  // Heavy volume
    } else {
      strainFactor = 50;  // Exhaustive strain
    }
  }

  const rawScore = Math.round(
    sleepFactor * 0.45 + rhrFactor * 0.35 + strainFactor * 0.20,
  );
  const score = Math.max(10, Math.min(100, rawScore));

  let status: RecoveryReadinessScore['status'] = 'Good';
  let recommendation = 'Body is well-recovered. Normal training volume recommended.';

  if (score >= 85) {
    status = 'Optimal';
    recommendation = 'Optimal physiological readiness. Great day for progressive overload or high intensity.';
  } else if (score >= 70) {
    status = 'Good';
    recommendation = 'Solid recovery state. Aerobic base training or standard routine is well tolerated.';
  } else if (score >= 50) {
    status = 'Fair';
    recommendation = 'Elevated fatigue detected. Consider lighter tempo, mobility work, or zone 2 cardio.';
  } else {
    status = 'Rest Needed';
    recommendation = 'High systemic strain. Prioritize restorative sleep, hydration, and active rest today.';
  }

  return {
    score,
    status,
    sleepFactor,
    rhrFactor,
    strainFactor,
    recommendation,
  };
}
