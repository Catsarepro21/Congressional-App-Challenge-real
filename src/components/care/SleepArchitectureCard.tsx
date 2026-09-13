import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { SLEEP_STAGE_BENCHMARKS } from '../../services/SleepAnalysisService';
import { Card, Heading, Icon, C, s } from './UI';

export default function SleepArchitectureCard() {
  const sleepStages = useSafeScaleStore((state) => state.sleepStages);
  const sleepDebt = useSafeScaleStore((state) => state.sleepDebt);

  const totalMin = Math.max(1, sleepStages.totalSleepMinutes || 1);
  const deepMin = sleepStages.deepMinutes || 0;
  const remMin = sleepStages.remMinutes || 0;
  const coreMin = sleepStages.coreMinutes || 0;
  const awakeMin = sleepStages.awakeMinutes || 0;

  const deepPct = Math.round((deepMin / totalMin) * 100);
  const remPct = Math.round((remMin / totalMin) * 100);
  const corePct = Math.round((coreMin / totalMin) * 100);
  const awakePct = Math.round((awakeMin / (totalMin + awakeMin)) * 100);

  const formatHoursMins = (minutes: number) => {
    const h = Math.floor(Math.abs(minutes) / 60);
    const m = Math.abs(minutes) % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  const getStageStatus = (stage: 'deep' | 'rem' | 'core' | 'awake', pct: number) => {
    switch (stage) {
      case 'deep':
        if (pct < SLEEP_STAGE_BENCHMARKS.deep.minPct) return { label: 'Low', color: C.amber };
        if (pct > SLEEP_STAGE_BENCHMARKS.deep.maxPct) return { label: 'High', color: C.green };
        return { label: 'Optimal', color: C.green };
      case 'rem':
        if (pct < SLEEP_STAGE_BENCHMARKS.rem.minPct) return { label: 'Low', color: C.amber };
        if (pct > SLEEP_STAGE_BENCHMARKS.rem.maxPct) return { label: 'High', color: C.green };
        return { label: 'Optimal', color: C.green };
      case 'core':
        if (pct < SLEEP_STAGE_BENCHMARKS.core.minPct) return { label: 'Low', color: C.amber };
        if (pct > SLEEP_STAGE_BENCHMARKS.core.maxPct) return { label: 'High', color: C.amber };
        return { label: 'Balanced', color: C.green };
      case 'awake':
        if (pct > SLEEP_STAGE_BENCHMARKS.awake.maxPct) return { label: 'Elevated', color: C.red };
        return { label: 'Normal', color: C.green };
    }
  };

  const debtHours = (sleepDebt.debtMinutes / 60).toFixed(1);
  const hasDebt = sleepDebt.debtMinutes < 0;

  return (
    <Card>
      {/* Card Header */}
      <View style={sleepStyles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>SLEEP ARCHITECTURE & CIRCADIAN</Text>
          <Text style={s.heading}>Sleep Stages & Hypnogram</Text>
        </View>
        <View style={sleepStyles.efficiencyBadge}>
          <Icon name="sleep" size={16} color={C.green} />
          <Text style={sleepStyles.efficiencyText}>{sleepStages.efficiencyPercent}% Efficiency</Text>
        </View>
      </View>

      {/* Main Sleep Duration Display */}
      <View style={sleepStyles.durationRow}>
        <View>
          <Text style={sleepStyles.durationBig}>{formatHoursMins(sleepStages.totalSleepMinutes)}</Text>
          <Text style={sleepStyles.durationSub}>Total Restorative Sleep</Text>
        </View>
        <View style={sleepStyles.bedtimeStat}>
          <Text style={sleepStyles.bedtimeLabel}>In Bed Duration</Text>
          <Text style={sleepStyles.bedtimeVal}>
            {formatHoursMins(sleepStages.totalSleepMinutes + sleepStages.awakeMinutes)}
          </Text>
        </View>
      </View>

      {/* Stacked Hypnogram Bar */}
      <View style={sleepStyles.hypnogramContainer}>
        <View style={sleepStyles.hypnogramTrack}>
          {deepPct > 0 && (
            <View style={[sleepStyles.hypnoSegment, { flex: deepPct, backgroundColor: '#3F51B5' }]} />
          )}
          {remPct > 0 && (
            <View style={[sleepStyles.hypnoSegment, { flex: remPct, backgroundColor: '#8E24AA' }]} />
          )}
          {corePct > 0 && (
            <View style={[sleepStyles.hypnoSegment, { flex: corePct, backgroundColor: '#00897B' }]} />
          )}
          {awakePct > 0 && (
            <View style={[sleepStyles.hypnoSegment, { flex: Math.max(awakePct, 3), backgroundColor: '#FB8C00' }]} />
          )}
        </View>

        {/* Legend */}
        <View style={sleepStyles.legendRow}>
          <View style={sleepStyles.legendItem}>
            <View style={[sleepStyles.legendDot, { backgroundColor: '#3F51B5' }]} />
            <Text style={sleepStyles.legendText}>Deep {deepPct}%</Text>
          </View>
          <View style={sleepStyles.legendItem}>
            <View style={[sleepStyles.legendDot, { backgroundColor: '#8E24AA' }]} />
            <Text style={sleepStyles.legendText}>REM {remPct}%</Text>
          </View>
          <View style={sleepStyles.legendItem}>
            <View style={[sleepStyles.legendDot, { backgroundColor: '#00897B' }]} />
            <Text style={sleepStyles.legendText}>Core {corePct}%</Text>
          </View>
          <View style={sleepStyles.legendItem}>
            <View style={[sleepStyles.legendDot, { backgroundColor: '#FB8C00' }]} />
            <Text style={sleepStyles.legendText}>Awake {awakePct}%</Text>
          </View>
        </View>
      </View>

      {/* Stage Breakdown Grid */}
      <View style={sleepStyles.stageGrid}>
        {/* Deep Sleep */}
        <View style={sleepStyles.stageTile}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[sleepStyles.stageName, { color: '#3F51B5' }]}>Deep Sleep</Text>
            <View style={[sleepStyles.statusPill, { backgroundColor: getStageStatus('deep', deepPct).color + '20' }]}>
              <Text style={[sleepStyles.statusPillText, { color: getStageStatus('deep', deepPct).color }]}>
                {getStageStatus('deep', deepPct).label}
              </Text>
            </View>
          </View>
          <Text style={sleepStyles.stageDuration}>{formatHoursMins(deepMin)}</Text>
          <Text style={sleepStyles.stageTarget}>Target: 15–25% • Physical recovery & growth hormone</Text>
        </View>

        {/* REM Sleep */}
        <View style={sleepStyles.stageTile}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[sleepStyles.stageName, { color: '#8E24AA' }]}>REM Sleep</Text>
            <View style={[sleepStyles.statusPill, { backgroundColor: getStageStatus('rem', remPct).color + '20' }]}>
              <Text style={[sleepStyles.statusPillText, { color: getStageStatus('rem', remPct).color }]}>
                {getStageStatus('rem', remPct).label}
              </Text>
            </View>
          </View>
          <Text style={sleepStyles.stageDuration}>{formatHoursMins(remMin)}</Text>
          <Text style={sleepStyles.stageTarget}>Target: 20–25% • Memory consolidation & mood</Text>
        </View>

        {/* Core / Light Sleep */}
        <View style={sleepStyles.stageTile}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[sleepStyles.stageName, { color: '#00897B' }]}>Core (Light)</Text>
            <View style={[sleepStyles.statusPill, { backgroundColor: getStageStatus('core', corePct).color + '20' }]}>
              <Text style={[sleepStyles.statusPillText, { color: getStageStatus('core', corePct).color }]}>
                {getStageStatus('core', corePct).label}
              </Text>
            </View>
          </View>
          <Text style={sleepStyles.stageDuration}>{formatHoursMins(coreMin)}</Text>
          <Text style={sleepStyles.stageTarget}>Target: 45–55% • Neurological maintenance</Text>
        </View>

        {/* Awake / WASO */}
        <View style={sleepStyles.stageTile}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[sleepStyles.stageName, { color: '#FB8C00' }]}>Awake Time</Text>
            <View style={[sleepStyles.statusPill, { backgroundColor: getStageStatus('awake', awakePct).color + '20' }]}>
              <Text style={[sleepStyles.statusPillText, { color: getStageStatus('awake', awakePct).color }]}>
                {getStageStatus('awake', awakePct).label}
              </Text>
            </View>
          </View>
          <Text style={sleepStyles.stageDuration}>{formatHoursMins(awakeMin)}</Text>
          <Text style={sleepStyles.stageTarget}>Target: &lt;10% • Brief arousals between sleep cycles</Text>
        </View>
      </View>

      {/* Sleep Debt & Circadian Rhythm Insights */}
      <View style={sleepStyles.debtCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon
            name={hasDebt ? 'alert-circle-outline' : 'check-circle-outline'}
            size={20}
            color={hasDebt ? C.amber : C.green}
          />
          <Text style={sleepStyles.debtTitle}>Weekly Sleep Debt Analysis</Text>
        </View>

        <View style={sleepStyles.debtNumbersRow}>
          <View>
            <Text style={sleepStyles.debtLabel}>Cumulative Debt</Text>
            <Text style={[sleepStyles.debtVal, { color: hasDebt ? C.amber : C.green }]}>
              {hasDebt ? `${debtHours}h` : `+${Math.abs(Number(debtHours))}h banked`}
            </Text>
          </View>
          <View>
            <Text style={sleepStyles.debtLabel}>7-Day Average</Text>
            <Text style={sleepStyles.debtVal}>{formatHoursMins(sleepDebt.weeklyAverageMinutes)} / night</Text>
          </View>
          <View>
            <Text style={sleepStyles.debtLabel}>Nightly Target</Text>
            <Text style={sleepStyles.debtVal}>{formatHoursMins(sleepDebt.targetMinutes)}</Text>
          </View>
        </View>

        {/* Circadian Bedtime Recommendation */}
        {sleepDebt.circadianBedtimeWindow && (
          <View style={sleepStyles.circadianBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="weather-night" size={16} color={C.green} />
              <Text style={sleepStyles.circadianTitle}>Circadian Wind-Down Window</Text>
            </View>
            <Text style={sleepStyles.circadianTime}>
              {sleepDebt.circadianBedtimeWindow.start} – {sleepDebt.circadianBedtimeWindow.end}
            </Text>
            <Text style={sleepStyles.circadianDesc}>
              {sleepDebt.circadianBedtimeWindow.recommendation} Dim blue light sources 45 minutes prior to peak melatonin production.
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

const sleepStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  efficiencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.pale,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  efficiencyText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.green,
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  durationBig: {
    fontSize: 28,
    fontWeight: '800',
    color: C.ink,
  },
  durationSub: {
    fontSize: 12,
    color: C.muted,
  },
  bedtimeStat: {
    alignItems: 'flex-end',
  },
  bedtimeLabel: {
    fontSize: 11,
    color: C.muted,
  },
  bedtimeVal: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  hypnogramContainer: {
    gap: 8,
    marginBottom: 14,
  },
  hypnogramTrack: {
    flexDirection: 'row',
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: C.line,
  },
  hypnoSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: C.ink,
    fontWeight: '500',
  },
  stageGrid: {
    gap: 8,
    marginBottom: 14,
  },
  stageTile: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  stageName: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stageDuration: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
  },
  stageTarget: {
    fontSize: 11,
    color: C.muted,
  },
  debtCard: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  debtTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  debtNumbersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  debtLabel: {
    fontSize: 11,
    color: C.muted,
  },
  debtVal: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    marginTop: 2,
  },
  circadianBox: {
    backgroundColor: C.white,
    borderRadius: 10,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: C.line,
  },
  circadianTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.green,
  },
  circadianTime: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
  },
  circadianDesc: {
    fontSize: 11,
    color: C.muted,
    lineHeight: 16,
  },
});
