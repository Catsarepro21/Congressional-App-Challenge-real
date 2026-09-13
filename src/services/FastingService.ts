/**
 * @file src/services/FastingService.ts
 * @description Domain logic for Intermittent Fasting protocols (16:8, 18:6, OMAD)
 * and metabolic stage progression (Digestion -> Glycogen Depletion -> Ketosis -> Autophagy).
 */

import type { FastingProtocol, FastingMetabolicStage } from '../types';

export interface MetabolicStageDetails {
  stage: FastingMetabolicStage;
  label: string;
  minHours: number;
  maxHours: number;
  color: string;
  description: string;
  benefits: string[];
}

// Legacy keys remain for saved-session compatibility; these are elapsed-time bands only.
export const METABOLIC_STAGES: Record<FastingMetabolicStage, MetabolicStageDetails> = {
  Digestion: { stage: 'Digestion', label: '0–4 hours', minHours: 0, maxHours: 4, color: '#3B8B9B', description: 'Time since the recorded start. Digestion and energy use vary with the meal and the person.', benefits: [] },
  'Glycogen Depletion': { stage: 'Glycogen Depletion', label: '4–12 hours', minHours: 4, maxHours: 12, color: '#875B24', description: 'Elapsed time does not establish your insulin level or remaining glycogen.', benefits: [] },
  Ketosis: { stage: 'Ketosis', label: '12–18 hours', minHours: 12, maxHours: 18, color: '#A33F39', description: 'This timer cannot determine whether you are in ketosis.', benefits: [] },
  Autophagy: { stage: 'Autophagy', label: '18+ hours', minHours: 18, maxHours: 72, color: '#18685D', description: 'This timer cannot measure autophagy or cellular renewal. Longer fasting is not a target to pursue for this label.', benefits: [] },
};

/**
 * Returns the target hours for a given fasting protocol.
 */
export function getProtocolTargetHours(protocol: FastingProtocol): number {
  switch (protocol) {
    case '14:10':
      return 14;
    case '16:8':
      return 16;
    case '18:6':
      return 18;
    case '20:4':
      return 20;
    case 'OMAD':
      return 24;
    case 'Custom':
    default:
      return 16;
  }
}

/**
 * Determines current metabolic stage based on elapsed fasting hours.
 */
export function getFastingStage(elapsedHours: number): FastingMetabolicStage {
  if (elapsedHours < 4) return 'Digestion';
  if (elapsedHours < 12) return 'Glycogen Depletion';
  if (elapsedHours < 18) return 'Ketosis';
  return 'Autophagy';
}

/**
 * Formats elapsed or remaining fasting seconds as "Xh Ym" or "HH:MM:SS".
 */
export function formatFastingDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
}

export const FastingService = {
  getProtocolTargetHours,
  getFastingStage,
  getMetabolicStage: (elapsedHours: number) => {
    const stage = getFastingStage(elapsedHours);
    return {
      name: stage,
      ...METABOLIC_STAGES[stage],
    };
  },
  formatFastingDuration,
};

