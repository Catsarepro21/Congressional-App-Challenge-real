import React from 'react';
import { View, Text } from 'react-native';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { Card, Heading, C, s } from './UI';

export default function SleepArchitectureCard() {
  const stages = useSafeScaleStore(state => state.sleepStages);
  const debt = useSafeScaleStore(state => state.sleepDebt);
  const history = useSafeScaleStore(state => state.weeklyHistory);
  const rows = [
    { label: 'Deep', minutes: stages.deepMinutes, color: '#3F51B5' },
    { label: 'REM', minutes: stages.remMinutes, color: '#8E24AA' },
    { label: 'Core', minutes: stages.coreMinutes, color: '#00897B' },
    { label: 'Unspecified', minutes: stages.unspecifiedMinutes || 0, color: '#607476' },
    { label: 'Awake', minutes: stages.awakeMinutes, color: '#B4650C' },
  ];
  const duration = (minutes: number) => `${Math.floor(Math.abs(minutes) / 60)}h ${Math.round(Math.abs(minutes) % 60)}m`;
  if (!(stages.totalSleepMinutes > 0)) return <Card><Heading title="Sleep" detail="No sleep stages recorded yet. Sync Apple Health after wearing your watch overnight." /></Card>;
  const coverage = new Set(history.filter(h => h.sleepMinutes > 0).map(h => h.date));
  if (stages.lastRecordedDate) coverage.add(stages.lastRecordedDate);
  return <Card>
    <Heading title="Your recorded sleep" detail={stages.lastRecordedDate ? `Recorded for ${stages.lastRecordedDate}` : 'Recording date unavailable'} />
    <Text style={{ fontSize: 30, fontWeight: '600', color: C.ink }}>{duration(stages.totalSleepMinutes)}</Text>
    <Text style={s.body}>Stage totals from wearable estimates. This bar shows proportions, not the order of sleep stages.</Text>
    <View accessible accessibilityLabel={rows.map(r => `${r.label} ${r.minutes} minutes`).join(', ')} style={{ flexDirection: 'row', height: 20, borderRadius: 10, overflow: 'hidden', backgroundColor: C.pale }}>
      {rows.filter(r => r.minutes > 0).map(r => <View key={r.label} style={{ flex: r.minutes, backgroundColor: r.color }} />)}
    </View>
    {rows.map(r => <View key={r.label} style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.body}>{r.label}</Text><Text style={s.label}>{duration(r.minutes)}</Text></View>)}
    <Text style={s.body}>Estimated sleep efficiency: {stages.efficiencyPercent}% · Recorded interval: {duration(stages.inBedMinutes || stages.totalSleepMinutes + stages.awakeMinutes)}</Text>
    <Heading title="Sleep target comparison" detail={`Compared with an 8-hour target across up to ${Math.min(7, coverage.size)} recorded days. Missing nights are excluded.`} />
    <Text style={s.body}>{duration(debt.debtMinutes)} {debt.debtMinutes < 0 ? 'below' : 'above'} target in the retained history. This is a duration comparison, not a measure of biological sleep debt.</Text>
    <Text style={s.body}>{debt.circadianBedtimeWindow.recommendation} This is a schedule suggestion, not a measurement of your circadian rhythm.</Text>
  </Card>;
}
