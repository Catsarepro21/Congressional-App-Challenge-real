import type { SafeScaleState, TodayCardId } from '../types';
import { localDate, validDate } from './daily';

export const TODAY_CARDS: { id: TodayCardId; title: string }[] = [
  { id: 'medications', title: 'Medication schedule' }, { id: 'readings', title: 'Health readings' },
  { id: 'sleep', title: 'Sleep' }, { id: 'activity', title: 'Activity' },
  { id: 'journal', title: 'Journal & symptoms' }, { id: 'fasting', title: 'Fasting timer' },
];
export const DEFAULT_TODAY_CARDS: TodayCardId[] = ['medications', 'readings', 'journal', 'activity', 'sleep'];
export function normalizeTodayCards(value?: TodayCardId[]): TodayCardId[] {
  return Array.isArray(value) ? [...new Set(value.filter(id => TODAY_CARDS.some(c => c.id === id)))] : [...DEFAULT_TODAY_CARDS];
}
export type TimelineKind = 'Meal' | 'Water' | 'Medication' | 'Symptom' | 'Check-in' | 'Vitals' | 'Workout' | 'Sleep';
export interface TimelineEvent { id: string; date: string; time?: string; kind: TimelineKind; title: string; detail: string; }
type TimelineState = Pick<SafeScaleState, 'loggedItems' | 'symptomLogs' | 'moodLogs' | 'vitalsLogs' | 'doseEvents' | 'workouts' | 'weeklyHistory'>;

// Date-only legacy records stay date-only; never manufacture a recording time.
function stamp(value: string): { date: string; time?: string } {
  if (validDate(value)) return { date: value };
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return { date: '' };
  return { date: localDate(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}
export function buildTimeline(state: TimelineState): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const add = (event: TimelineEvent) => { if (validDate(event.date)) events.push(event); };
  const clock = (time: string) => {
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return time;
    const match = time.trim().match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 12) return undefined;
    const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    return `${String(hour).padStart(2, '0')}:${match[2]}`;
  };
  state.loggedItems.forEach(x => add({ id: `meal:${x.id}`, date: x.date || '', time: clock(x.timestamp), kind: x.type, title: x.name, detail: [x.value, x.portion].filter(Boolean).join(' · ') }));
  state.symptomLogs.forEach(x => add({ id: `symptom:${x.id}`, date: x.date, time: clock(x.timestamp), kind: 'Symptom', title: x.type, detail: `Recorded severity ${x.severity}/10` }));
  state.moodLogs.forEach(x => add({ id: `mood:${x.id}`, ...stamp(x.timestamp), kind: 'Check-in', title: `Mood ${x.rating}/10 · ${x.stressLevel} stress`, detail: [x.feelings.join(', '), x.notes].filter(Boolean).join(' · ') }));
  state.vitalsLogs.forEach(x => add({ id: `vitals:${x.id}`, ...stamp(x.timestamp), kind: 'Vitals', title: 'Recorded vitals', detail: [x.systolicBP && x.diastolicBP ? `BP ${x.systolicBP}/${x.diastolicBP} mmHg` : '', x.bloodGlucose ? `Glucose ${x.bloodGlucose} mg/dL (${x.glucoseContext || 'context unspecified'})` : '', x.spo2 ? `SpO₂ ${x.spo2}%` : '', x.temperature ? `${x.temperature} °F` : ''].filter(Boolean).join(' · ') }));
  (state.doseEvents || []).forEach(x => add({ id: `dose:${x.id}`, ...stamp(x.recordedAt), date: x.date, kind: 'Medication', title: `${x.name} · marked taken`, detail: `${x.dosage} · Time shown is when recorded` }));
  state.workouts.forEach(x => add({ id: `workout:${x.id}`, ...stamp(x.startedAt), kind: 'Workout', title: x.name || x.type, detail: `${Math.round(x.durationSeconds / 60)} min · ${x.caloriesBurned} kcal (${x.source === 'app' ? 'estimated, Healthfolio' : x.source})` }));
  state.weeklyHistory.filter(x => x.sleepMinutes > 0).forEach(x => add({ id: `sleep:${x.date}`, date: x.date, kind: 'Sleep', title: `${Math.floor(x.sleepMinutes / 60)}h ${Math.round(x.sleepMinutes % 60)}m sleep`, detail: 'Daily saved summary · Bedtime not recorded' }));
  return events.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || a.id.localeCompare(b.id));
}
