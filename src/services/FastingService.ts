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

export const METABOLIC_STAGES: Record<FastingMetabolicStage, MetabolicStageDetails> = {
  Digestion: {
    stage: 'Digestion',
    label: 'Anabolic / Digestion',
    minHours: 0,
    maxHours: 4,
    color: '#3B8B9B',
    description: 'Insulin and blood glucose are elevated as your body breaks down nutrients from your last meal.',
    benefits: ['Nutrient absorption', 'Glycogen storage replenishment'],
  },
  'Glycogen Depletion': {
    stage: 'Glycogen Depletion',
    label: 'Glycogen Depletion',
    minHours: 4,
    maxHours: 12,
    color: '#875B24',
    description: 'Blood sugar stabilizes and insulin declines. The liver burns through stored glycogen reserves.',
    benefits: ['Blood sugar regulation', 'Insulin sensitivity improvement', 'Digestive rest'],
  },
  Ketosis: {
    stage: 'Ketosis',
    label: 'Ketosis & Fat Oxidation',
    minHours: 12,
    maxHours: 18,
    color: '#FA114F',
    description: 'Glycogen is depleted. The liver begins metabolizing fatty acids into ketones for cellular and brain fuel.',
    benefits: ['Active subcutaneous fat oxidation', 'Enhanced mental clarity', 'Appetite suppression'],
  },
  Autophagy: {
    stage: 'Autophagy',
    label: 'Autophagy & Cellular Renewal',
    minHours: 18,
    maxHours: 72,
    color: '#18685D',
    description: 'Cells activate deep self-cleaning, breaking down damaged proteins, senescent cells, and recycling organelles.',
    benefits: ['Mitochondrial biogenesis', 'Cellular detoxification', 'Longevity pathway activation'],
  },
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
