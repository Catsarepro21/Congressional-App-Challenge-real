/**
 * @file src/services/HealthContextAggregator.ts
 * @description Aggregates real-time health telemetry, nutrition, medications,
 * and clinical records for the on-device foundation model assistant.
 *
 * Runs 100% on-device. Feeds grounded context into the local LLM without
 * exporting or leaking any data off the phone.
 */

import { useSafeScaleStore } from '../store/useSafeScaleStore';
import { localDate } from '../utils/daily';
import { FastingService, getFastingStage } from './FastingService';
import { CardioDiagnosticsService, classifyBloodPressure, classifyHRV } from './CardioDiagnosticsService';

export interface HealthContextSnapshot {
  user: {
    name: string;
    age?: number;
    bloodType?: string;
    chronicConditions?: string[];
    allergies: string[];
  };
  vitals: {
    heartRate: number;
    restingHeartRate: number;
    hrvSdnn?: number;
    hrvTone?: string;
    bloodPressure?: {
      systolic: number;
      diastolic: number;
      category: string;
    };
    spO2?: number;
    bloodGlucose?: number;
    steps: number;
    activeCalories: number;
    recoveryScore?: number;
  };
  nutrition: {
    todayCalories: number;
    todayWaterMl: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number;
    sodiumMg: number;
    mealCount: number;
    meals: { name: string; calories: number; portion?: string }[];
  };
  medications: {
    total: number;
    taken: number;
    pending: { name: string; dosage: string; time: string }[];
    lowStockAlerts: string[];
  };
  sleep: {
    totalMinutes: number;
    formatted: string;
  };
  fasting: {
    isFasting: boolean;
    protocol?: string;
    elapsedHours?: number;
    metabolicStage?: string;
  };
  records: {
    conditionsCount: number;
    recentLabs: { test: string; value: string }[];
  };
}

function calculateAge(dob?: string): number | undefined {
  if (!dob) return undefined;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age >= 0 ? age : undefined;
}

export const HealthContextAggregator = {
  /**
   * Builds a structured snapshot of all user health telemetry and records.
   */
  getSnapshot: (): HealthContextSnapshot => {
    const state = useSafeScaleStore.getState();
    const today = localDate();

    // 1. Profile & Allergies
    const name = state.profile.name || 'Friend';
    const allergies = state.userAllergies || [];
    const conditions =
      state.profile.chronicConditions ||
      (state.medicalRecords
        ? state.medicalRecords.filter(r => r.type === 'Condition').map(r => r.title)
        : []);
    const age = state.profile.age !== undefined ? state.profile.age : calculateAge(state.profile.dob);

    // 2. Vitals & Cardio
    const vitals = state.biometricCore;
    const latestBPLog = state.vitalsLogs?.find(v => v.systolicBP && v.diastolicBP);
    const bpSys = vitals.bloodPressureSystolic ?? latestBPLog?.systolicBP;
    const bpDia = vitals.bloodPressureDiastolic ?? latestBPLog?.diastolicBP;
    let bpDiag = null;
    if (bpSys && bpDia) {
      bpDiag = (typeof CardioDiagnosticsService !== 'undefined' && CardioDiagnosticsService.classifyBloodPressure)
        ? CardioDiagnosticsService.classifyBloodPressure(bpSys, bpDia)
        : classifyBloodPressure(bpSys, bpDia);
    }
    const hrvVal = vitals.hrvSdnn ?? state.hrvMetrics?.sdnnMs;
    let hrvDiag: { tone?: string; autonomicTone?: string } | null = null;
    if (hrvVal) {
      hrvDiag = (typeof CardioDiagnosticsService !== 'undefined' && CardioDiagnosticsService.classifyHRV)
        ? CardioDiagnosticsService.classifyHRV(hrvVal)
        : classifyHRV(hrvVal);
    }

    // 3. Nutrition (Today's logged items)
    const todayItems = state.loggedItems.filter(item => !item.date || item.date === today);
    let todayCalories = 0;
    let todayWaterMl = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let fiber = 0;
    let sodium = 0;
    const meals: { name: string; calories: number; portion?: string }[] = [];

    for (const item of todayItems) {
      if (item.type === 'Water') {
        const ml = parseInt(item.value.replace(/[^0-9]/g, ''), 10) || 250;
        todayWaterMl += ml;
      } else if (item.type === 'Meal') {
        todayCalories += item.calories || 0;
        if (item.macros) {
          protein += item.macros.protein || 0;
          carbs += item.macros.carbs || 0;
          fat += item.macros.fat || 0;
          fiber += item.macros.fiber || 0;
          sodium += item.macros.sodium || 0;
        }
        meals.push({
          name: item.name,
          calories: item.calories || 0,
          portion: item.portion,
        });
      }
    }

    // 4. Medications
    const meds = state.medicationSchedule;
    const taken = meds.filter(m => m.status === 'Completed').length;
    const pending = meds
      .filter(m => m.status !== 'Completed')
      .map(m => ({ name: m.name, dosage: m.dosage, time: m.time }));
    const lowStock = meds
      .filter(m => m.stock !== undefined && m.refillThreshold !== undefined && m.stock <= m.refillThreshold)
      .map(m => m.name);

    // 5. Fasting
    const fastingSession = state.fastingSession;
    let fastingInfo: HealthContextSnapshot['fasting'] = { isFasting: false };
    const fastingStart = fastingSession?.startTime || fastingSession?.startedAt;
    if (fastingSession?.isFasting && fastingStart) {
      const elapsedMs = Math.max(0, Date.now() - new Date(fastingStart).getTime());
      const elapsedHours = Math.round((elapsedMs / (1000 * 60 * 60)) * 10) / 10;
      let stageName = 'Digestion';
      if (typeof FastingService !== 'undefined' && FastingService.getMetabolicStage) {
        const stageObj = FastingService.getMetabolicStage(elapsedHours);
        stageName = typeof stageObj === 'object' && stageObj && 'name' in stageObj ? (stageObj as any).name : String(stageObj);
      } else {
        stageName = getFastingStage(elapsedHours);
      }
      fastingInfo = {
        isFasting: true,
        protocol: fastingSession.protocol,
        elapsedHours,
        metabolicStage: stageName,
      };
    }

    // 6. Sleep
    const sleepMinutes = vitals.sleepMinutes || 0;
    const sleepHours = Math.floor(sleepMinutes / 60);
    const sleepRemMin = Math.round(sleepMinutes % 60);

    // 7. Clinical Records
    const labs = state.medicalRecords
      ? state.medicalRecords
          .filter(r => r.type === 'LabResult')
          .slice(0, 5)
          .map(r => ({ test: r.title, value: r.value }))
      : [];

    const latestGlucose = state.vitalsLogs?.find(v => v.bloodGlucose);
    const latestSpO2 = state.vitalsLogs?.find(v => v.spo2);
    const bloodGlucose = vitals.bloodGlucose ?? latestGlucose?.bloodGlucose;
    const spO2 = vitals.spO2 ?? latestSpO2?.spo2;
    const recoveryScore = vitals.recoveryScore ?? (vitals.dailyStabilityScore > 0 ? vitals.dailyStabilityScore : undefined);

    return {
      user: {
        name,
        age,
        bloodType: state.profile.bloodType,
        chronicConditions: conditions,
        allergies,
      },
      vitals: {
        heartRate: vitals.heartRate,
        restingHeartRate: vitals.restingHeartRate,
        hrvSdnn: hrvVal,
        hrvTone: hrvDiag?.tone || hrvDiag?.autonomicTone,
        bloodPressure: bpDiag && bpSys && bpDia
          ? {
              systolic: bpSys,
              diastolic: bpDia,
              category: bpDiag.label,
            }
          : undefined,
        spO2,
        bloodGlucose,
        steps: Math.round(vitals.steps),
        activeCalories: Math.round(vitals.activeCalories),
        recoveryScore,
      },
      nutrition: {
        todayCalories,
        todayWaterMl,
        proteinGrams: Math.round(protein * 10) / 10,
        carbsGrams: Math.round(carbs * 10) / 10,
        fatGrams: Math.round(fat * 10) / 10,
        fiberGrams: Math.round(fiber * 10) / 10,
        sodiumMg: Math.round(sodium),
        mealCount: meals.length,
        meals,
      },
      medications: {
        total: meds.length,
        taken,
        pending,
        lowStockAlerts: lowStock,
      },
      sleep: {
        totalMinutes: sleepMinutes,
        formatted: `${sleepHours}h ${sleepRemMin}m`,
      },
      fasting: fastingInfo,
      records: {
        conditionsCount: conditions.length,
        recentLabs: labs,
      },
    };
  },

  /**
   * Format the snapshot as readable prompt context for local foundation models.
   */
  getAsPromptContext: (): string => {
    const s = HealthContextAggregator.getSnapshot();
    const lines: string[] = [];

    lines.push(`PATIENT PROFILE: ${s.user.name}${s.user.age ? `, Age ${s.user.age}` : ''}`);
    if (s.user.allergies.length > 0) lines.push(`ALLERGIES: ${s.user.allergies.join(', ')}`);
    if (s.user.chronicConditions && s.user.chronicConditions.length > 0) {
      lines.push(`CONDITIONS: ${s.user.chronicConditions.join(', ')}`);
    }

    lines.push(`TODAY VITALS:`);
    lines.push(`- Heart Rate: ${s.vitals.heartRate > 0 ? `${s.vitals.heartRate} bpm` : 'Not recorded'}, Resting HR: ${s.vitals.restingHeartRate > 0 ? `${s.vitals.restingHeartRate} bpm` : 'Not recorded'}`);
    if (s.vitals.hrvSdnn) lines.push(`- HRV (SDNN): ${s.vitals.hrvSdnn} ms (${s.vitals.hrvTone || 'Autonomic balance'})`);
    if (s.vitals.bloodPressure) lines.push(`- Blood Pressure: ${s.vitals.bloodPressure.systolic}/${s.vitals.bloodPressure.diastolic} mmHg (${s.vitals.bloodPressure.category})`);
    lines.push(`- Activity: ${s.vitals.steps.toLocaleString()} steps, ${s.vitals.activeCalories} active kcal burned`);
    if (s.vitals.recoveryScore) lines.push(`- Recovery Score: ${s.vitals.recoveryScore}%`);

    lines.push(`TODAY NUTRITION:`);
    lines.push(`- Calories: ${s.nutrition.todayCalories} kcal across ${s.nutrition.mealCount} logged meals`);
    lines.push(`- Macros: ${s.nutrition.proteinGrams}g protein, ${s.nutrition.carbsGrams}g carbs, ${s.nutrition.fatGrams}g fat, ${s.nutrition.fiberGrams}g fiber, ${s.nutrition.sodiumMg}mg sodium`);
    if (s.nutrition.todayWaterMl > 0) lines.push(`- Hydration: ${s.nutrition.todayWaterMl} ml water`);
    if (s.nutrition.meals.length > 0) {
      lines.push(`- Meals: ${s.nutrition.meals.map(m => `${m.name} (${m.calories} kcal)`).join('; ')}`);
    }

    lines.push(`MEDICATIONS:`);
    lines.push(`- Status: ${s.medications.taken} of ${s.medications.total} doses taken today`);
    if (s.medications.pending.length > 0) {
      lines.push(`- Pending: ${s.medications.pending.map(p => `${p.name} ${p.dosage} at ${p.time}`).join(', ')}`);
    }

    lines.push(`SLEEP & FASTING:`);
    lines.push(`- Sleep: ${s.sleep.totalMinutes > 0 ? s.sleep.formatted : 'No sleep logged'}`);
    if (s.fasting.isFasting) {
      lines.push(`- Fasting: Active ${s.fasting.protocol} fast, ${s.fasting.elapsedHours}h elapsed (Stage: ${s.fasting.metabolicStage})`);
    }

    return lines.join('\n');
  },

  /**
   * Return a concise pill summary string for the UI header.
   */
  getQuickPillSummary: (): string[] => {
    const s = HealthContextAggregator.getSnapshot();
    const pills: string[] = [];

    pills.push(`🍎 ${s.nutrition.todayCalories} kcal`);
    if (s.sleep.totalMinutes > 0) pills.push(`🌙 ${s.sleep.formatted}`);
    if (s.vitals.steps > 0) pills.push(`👟 ${s.vitals.steps.toLocaleString()} steps`);
    if (s.medications.total > 0) pills.push(`💊 ${s.medications.taken}/${s.medications.total} Meds`);
    if (s.fasting.isFasting && s.fasting.metabolicStage) pills.push(`⏳ ${s.fasting.metabolicStage}`);
    if (s.vitals.recoveryScore) pills.push(`⚡ ${s.vitals.recoveryScore}% Recovery`);

    return pills;
  },
};
