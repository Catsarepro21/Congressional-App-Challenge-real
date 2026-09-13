import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import { buildTimeline, type TimelineKind } from '../utils/timeline';
import { localDate, validDate } from '../utils/daily';
import { Button, Card, Page, C, s } from '../components/care/UI';

const filters: ('All' | TimelineKind)[] = ['All', 'Meal', 'Water', 'Medication', 'Symptom', 'Check-in', 'Vitals', 'Workout', 'Sleep'];
export default function TimelineScreen() {
  const data = useSafeScaleStore(useShallow(state => ({ loggedItems: state.loggedItems, symptomLogs: state.symptomLogs, moodLogs: state.moodLogs, vitalsLogs: state.vitalsLogs, doseEvents: state.doseEvents, workouts: state.workouts, weeklyHistory: state.weeklyHistory })));
  const demo = useSafeScaleStore(state => state.isTestMode);
  const events = useMemo(() => buildTimeline(data), [data]);
  const [date, setDate] = useState(localDate());
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const visible = events.filter(event => event.date === date && (filter === 'All' || event.kind === filter));
  const shift = (days: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); setDate(localDate(d)); };
  return <Page title="Your health timeline" subtitle="See your records together, one day at a time.">
    {demo ? <Text style={s.label}>SAMPLE MODE · Fictional records</Text> : null}
    <Card>
      <Text style={s.label}>DATE · YYYY-MM-DD</Text>
      <TextInput accessibilityLabel="Timeline date" value={date} onChangeText={setDate} style={s.input} placeholder="YYYY-MM-DD" />
      {!validDate(date) ? <Text style={s.error}>Enter a valid date, such as 2026-09-13.</Text> : null}
      <View style={s.wrap}><Button label="Previous day" secondary disabled={!validDate(date)} onPress={() => shift(-1)} /><Button label="Today" secondary onPress={() => setDate(localDate())} /><Button label="Next day" secondary disabled={!validDate(date) || date >= localDate()} onPress={() => shift(1)} /></View>
      <View style={s.wrap}>{filters.map(kind => <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: filter === kind }} onPress={() => setFilter(kind)} style={{ padding: 12, borderRadius: 18, backgroundColor: filter === kind ? C.green : C.pale }}><Text style={{ color: filter === kind ? C.white : C.green }}>{kind}</Text></Pressable>)}</View>
    </Card>
    <Text style={s.body}>{visible.length} records · Newest first. Records without a time appear last.</Text>
    {visible.map(event => <Card key={event.id}><Text style={s.eyebrow}>{event.time || 'TIME NOT RECORDED'} · {event.kind.toUpperCase()}</Text><Text style={s.heading}>{event.title}</Text><Text style={s.body}>{event.detail}</Text></Card>)}
    {!visible.length ? <Card><Text style={s.heading}>No matching records</Text><Text style={s.body}>Try another day or filter. Add a meal, check-in, symptom, or workout to build your timeline.</Text></Card> : null}
    <Text style={s.body}>Medication history begins with doses recorded in this version. Older meals without dates are not assigned to a day. Sleep summaries are limited to the history retained by the app.</Text>
  </Page>;
}
