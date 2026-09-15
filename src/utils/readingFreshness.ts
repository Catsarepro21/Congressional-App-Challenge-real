import type {ReadingMetadata} from '../types';

/** Missing sample time cannot establish that a reading is current. */
export function isFreshReading(reading: ReadingMetadata | undefined, maxAgeMs: number, now = Date.now()): boolean {
  const sampled = Date.parse(reading?.sampledAt || '');
  return Number.isFinite(sampled) && sampled <= now && now - sampled <= maxAgeMs;
}

export function readingCaption(reading?: ReadingMetadata): string {
  if (!reading) return 'Source and sample time not recorded';
  const sample = reading.sampledAt && Number.isFinite(Date.parse(reading.sampledAt))
    ? `Sample: ${new Date(reading.sampledAt).toLocaleString()}`
    : reading.periodDate ? `Daily total: ${reading.periodDate}` : 'Sample time not provided';
  return `${reading.source} · ${sample}`;
}
