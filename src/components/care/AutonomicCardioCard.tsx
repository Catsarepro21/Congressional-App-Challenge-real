import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { Card, Heading, Icon, C, s } from './UI';

export default function AutonomicCardioCard() {
  const hrvMetrics = useSafeScaleStore((state) => state.hrvMetrics);
  const biometricCore = useSafeScaleStore((state) => state.biometricCore);

  const sdnn = hrvMetrics.sdnnMs;
  if (!Number.isFinite(sdnn) || sdnn <= 0) return <Card><Heading title="Heart Rate Variability (HRV)" detail="Not recorded. Sync a supported health source to see your readings." /></Card>;
  const isSympathetic = sdnn < 38;
  const isParasympathetic = sdnn > 75;
  const isBalanced = !isSympathetic && !isParasympathetic;

  const toneColor = isSympathetic ? '#FA114F' : isParasympathetic ? '#00E7FF' : '#18685D';
  const gaugePercent = Math.min(100, Math.max(0, Math.round((sdnn / 120) * 100)));

  return (
    <Card>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>AUTONOMIC NERVOUS SYSTEM</Text>
          <Text style={s.heading}>Heart Rate Variability (HRV)</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: toneColor + '20' }]}>
          <Icon name="pulse" size={16} color={toneColor} />
          <Text style={[styles.statusBadgeText, { color: toneColor }]}>
            {isSympathetic ? 'Lower reading' : isParasympathetic ? 'Higher reading' : 'Recorded reading'}
          </Text>
        </View>
      </View>

      {/* Main Metric Row */}
      <View style={styles.metricRow}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={styles.metricNumber}>{sdnn}</Text>
            <Text style={styles.metricUnit}>ms (SDNN)</Text>
          </View>
          <Text style={styles.metricSub}>Apple Watch optical sensor interval analysis</Text>
        </View>

        <View style={styles.rhrComparison}>
          <Text style={styles.rhrLabel}>Resting Heart Rate</Text>
          <Text style={styles.rhrValue}>{biometricCore.restingHeartRate > 0 ? biometricCore.restingHeartRate : '—'} bpm</Text>
        </View>
      </View>

      {/* Range Bar Indicator */}
      <View style={styles.gaugeContainer}>
        <View style={styles.gaugeTrack}>
          <View style={[styles.gaugeSegment, { flex: 35, backgroundColor: '#FCE8E6' }]} />
          <View style={[styles.gaugeSegment, { flex: 45, backgroundColor: '#E5F0E9' }]} />
          <View style={[styles.gaugeSegment, { flex: 40, backgroundColor: '#E0F7FA' }]} />
        </View>
        <View style={[styles.gaugeMarker, { left: `${gaugePercent}%` }]}>
          <View style={[styles.gaugePin, { backgroundColor: toneColor }]} />
        </View>
        <View style={styles.gaugeLabels}>
          <Text style={styles.gaugeLabel}>Low (&lt;35 ms)</Text>
          <Text style={styles.gaugeLabel}>Normal (40–80 ms)</Text>
          <Text style={styles.gaugeLabel}>High (&gt;80 ms)</Text>
        </View>
      </View>

      {/* Clinical Insight & Autonomic Tone Card */}
      <View style={[styles.insightCard, { borderLeftColor: toneColor }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Icon name="shield-check-outline" size={16} color={toneColor} />
          <Text style={[styles.insightTitle, { color: toneColor }]}>
            {'HRV reading'}
          </Text>
        </View>
        <Text style={styles.insightText}>
          {'A single HRV reading does not establish stress, nervous-system balance, or readiness for training.'}
        </Text>
        <View style={styles.recoveryTag}>
          <Text style={styles.recoveryTagLabel}>STATUS:</Text>
          <Text style={[styles.recoveryTagValue, { color: toneColor }]}>
            {'Recorded HRV'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginVertical: 8,
  },
  metricNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: C.ink,
  },
  metricUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: C.muted,
  },
  metricSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  rhrComparison: {
    alignItems: 'flex-end',
  },
  rhrLabel: {
    fontSize: 11,
    color: C.muted,
  },
  rhrValue: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
    marginTop: 2,
  },
  gaugeContainer: {
    marginVertical: 12,
    position: 'relative',
  },
  gaugeTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  gaugeSegment: {
    height: '100%',
  },
  gaugeMarker: {
    position: 'absolute',
    top: -3,
    marginLeft: -8,
  },
  gaugePin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.white,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  gaugeLabel: {
    fontSize: 11,
    color: C.muted,
  },
  insightCard: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    gap: 6,
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  insightText: {
    fontSize: 12,
    color: C.ink,
    lineHeight: 18,
  },
  recoveryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  recoveryTagLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
  },
  recoveryTagValue: {
    fontSize: 11,
    fontWeight: '800',
  },
});
