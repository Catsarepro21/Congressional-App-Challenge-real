/**
 * @file src/services/CardioDiagnosticsService.ts
 * @description Clinical analysis for Blood Pressure (AHA/ACC 2017 staging guidelines)
 * and Heart Rate Variability (HRV / SDNN ms autonomic nervous system balance).
 */

import type { AHA_BP_Category, BloodPressureDiagnostic, HRVMetrics } from '../types';

/**
 * Classifies a Blood Pressure reading based on 2017 AHA/ACC guidelines.
 */
export function classifyBloodPressure(
  systolic?: number,
  diastolic?: number,
): BloodPressureDiagnostic | null {
  if (!systolic || !diastolic || systolic <= 50 || diastolic <= 30) {
    return null;
  }

  // 1. Hypertensive Crisis: > 180 and/or > 120
  if (systolic > 180 || diastolic > 120) {
    return {
      category: 'Crisis',
      label: 'Hypertensive Crisis',
      color: '#A33F39',
      advice: 'Urgent medical attention recommended. Re-check in 5 minutes and contact your physician if sustained.',
    };
  }

  // 2. Stage 2 Hypertension: >= 140 or >= 90
  if (systolic >= 140 || diastolic >= 90) {
    return {
      category: 'Stage 2',
      label: 'Stage 2 Hypertension',
      color: '#D35400',
      advice: 'Blood pressure is significantly elevated. Review lifestyle factors and discuss management with your doctor.',
    };
  }

  // 3. Stage 1 Hypertension: 130-139 or 80-89
  if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
    return {
      category: 'Stage 1',
      label: 'Stage 1 Hypertension',
      color: '#875B24',
      advice: 'Mild elevation. Lifestyle adjustments (sodium reduction, hydration, regular aerobic exercise) are beneficial.',
    };
  }

  // 4. Elevated: 120-129 and < 80
  if (systolic >= 120 && systolic <= 129 && diastolic < 80) {
    return {
      category: 'Elevated',
      label: 'Elevated',
      color: '#B08800',
      advice: 'Slightly above normal. Monitor weekly and focus on stress management and cardiovascular conditioning.',
    };
  }

  // 5. Normal: < 120 and < 80
  return {
    category: 'Normal',
    label: 'Normal',
    color: '#18685D',
    advice: 'Optimal blood pressure. Cardiovascular system is operating within healthy parameters.',
  };
}

/**
 * Evaluates Heart Rate Variability (SDNN in ms) for autonomic nervous system balance.
 * Normal healthy adult daytime resting SDNN typically averages 40-70 ms.
 */
export function classifyHRV(sdnnMs: number, _age: number = 30): HRVMetrics {
  if (sdnnMs <= 0) {
    return {
      sdnnMs: 0,
      status: 'Balanced',
      autonomicTone: 'Calibrating Baseline',
      recoveryStatus: 'Calibrating',
      insight: 'No HRV telemetry recorded yet. Wear Apple Watch during rest to calibrate.',
      balanceDescription: 'No HRV telemetry recorded yet. Wear Apple Watch during rest to calibrate.',
    };
  }

  if (sdnnMs >= 65) {
    return {
      sdnnMs,
      status: 'High',
      autonomicTone: 'Parasympathetic Dominant (Deep Recovery)',
      recoveryStatus: 'Well Rested / High Parasympathetic',
      insight: 'Optimal parasympathetic (vagal) recovery. Your nervous system is resilient and primed for training.',
      balanceDescription: 'Optimal parasympathetic (vagal) recovery. Your nervous system is resilient and primed for training.',
    };
  }

  if (sdnnMs >= 35) {
    return {
      sdnnMs,
      status: 'Balanced',
      autonomicTone: 'Balanced Autonomic Tone',
      recoveryStatus: 'Optimal Recovery',
      insight: 'Balanced autonomic nervous system regulation. Healthy equilibrium between sympathetic exertion and rest.',
      balanceDescription: 'Balanced autonomic nervous system regulation. Healthy equilibrium between sympathetic exertion and rest.',
    };
  }

  return {
    sdnnMs,
    status: 'Low',
    autonomicTone: 'Sympathetic Dominant (Elevated Stress / Fatigue)',
    recoveryStatus: 'Fatigued / Low Reserve',
    insight: 'Sympathetic nervous system dominance detected. Indicates accumulated physical fatigue or physiological stress.',
    balanceDescription: 'Sympathetic nervous system dominance detected. Indicates accumulated physical fatigue or physiological stress.',
  };
}

export const CardioDiagnosticsService = {
  classifyBloodPressure,
  classifyHRV,
};

