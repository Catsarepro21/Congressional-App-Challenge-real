import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Modal, ScrollView } from 'react-native';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import {
  METABOLIC_STAGES,
  getFastingStage,
  formatFastingDuration,
  getProtocolTargetHours,
} from '../../services/FastingService';
import type { FastingProtocol, FastingMetabolicStage } from '../../types';
import { Card, Heading, Button, Icon, C, s } from './UI';

const PROTOCOLS: FastingProtocol[] = ['14:10', '16:8', '18:6', '20:4', 'OMAD'];

export default function FastingTracker() {
  const fastingSession = useSafeScaleStore((state) => state.fastingSession);
  const startFast = useSafeScaleStore((state) => state.startFast);
  const endFast = useSafeScaleStore((state) => state.endFast);
  const setFastingProtocol = useSafeScaleStore((state) => state.setFastingProtocol);

  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [showScienceModal, setShowScienceModal] = useState<boolean>(false);

  // Interval timer for live countdown / countup
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isFasting = fastingSession.isFasting && !!fastingSession.startedAt;
  const startedAtMs = fastingSession.startedAt ? Date.parse(fastingSession.startedAt) : 0;
  const elapsedSeconds = isFasting && startedAtMs > 0 ? Math.max(0, Math.floor((currentTime - startedAtMs) / 1000)) : 0;
  const elapsedHours = elapsedSeconds / 3600;
  const targetSeconds = (fastingSession.targetHours || 16) * 3600;
  const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedSeconds / targetSeconds) * 100)));
  const isTargetAchieved = elapsedSeconds >= targetSeconds;
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);

  const currentStage: FastingMetabolicStage = useMemo(() => {
    return getFastingStage(elapsedHours);
  }, [elapsedHours]);

  const stageInfo = METABOLIC_STAGES[currentStage];

  const handleStartFast = (protocol?: FastingProtocol) => {
    const p = protocol || fastingSession.protocol || '16:8';
    startFast(p);
  };

  const handleEndFast = () => {
    Alert.alert(
      'End Fast',
      `Are you sure you want to end your fast?\nCurrent duration: ${formatFastingDuration(elapsedSeconds)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Fast',
          style: 'destructive',
          onPress: () => {
            const entry = endFast();
            if (entry) {
              const durStr = formatFastingDuration(entry.durationSeconds);
              Alert.alert(
                entry.completed ? 'Goal Reached!' : 'Fast Ended',
                `You fasted for ${durStr}. Logged to your fasting history.`,
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Card>
      {/* Header */}
      <View style={fastStyles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>OPTIONAL TIMER</Text>
          <Text style={s.heading}>Intermittent Fasting</Text>
        </View>
        <Pressable
          onPress={() => setShowScienceModal(true)}
          accessibilityRole="button"
          accessibilityLabel="About the fasting timer"
          style={fastStyles.infoBadge}
        >
          <Icon name="information-outline" size={18} color={C.green} />
          <Text style={fastStyles.infoBadgeText}>About</Text>
        </Pressable>
      </View>

      {/* Protocol Selector Chips */}
      <View style={fastStyles.protocolRow}>
        {PROTOCOLS.map((p) => {
          const isSelected = fastingSession.protocol === p;
          return (
            <Pressable
              key={p}
              onPress={() => setFastingProtocol(p)}
              style={[
                fastStyles.protocolChip,
                isSelected && fastStyles.protocolChipSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Select protocol ${p}`}
            >
              <Text
                style={[
                  fastStyles.protocolChipText,
                  isSelected && fastStyles.protocolChipTextSelected,
                ]}
              >
                {p}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Main Timer Display */}
      {isFasting ? (
        <View style={fastStyles.activeSection}>
          <View style={fastStyles.timerBox}>
            <View style={fastStyles.timerUpper}>
              <View style={[fastStyles.statusDot, { backgroundColor: isTargetAchieved ? '#18685D' : '#FA114F' }]} />
              <Text style={fastStyles.statusText}>
                {isTargetAchieved ? 'TARGET EXCEEDED' : 'FASTING IN PROGRESS'}
              </Text>
            </View>

            <Text style={fastStyles.timerMain}>{formatFastingDuration(elapsedSeconds)}</Text>

            <View style={fastStyles.timerDetails}>
              <Text style={fastStyles.timerSub}>
                Goal: {fastingSession.targetHours}h 00m ({fastingSession.protocol})
              </Text>
              <Text style={[fastStyles.timerSub, { color: isTargetAchieved ? '#18685D' : C.amber }]}>
                {isTargetAchieved
                  ? `+${formatFastingDuration(elapsedSeconds - targetSeconds)} since target`
                  : `Remaining: ${formatFastingDuration(remainingSeconds)}`}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={fastStyles.progressBarContainer}>
            <View style={fastStyles.progressBarTrack}>
              <View
                style={[
                  fastStyles.progressBarFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: stageInfo.color,
                  },
                ]}
              />
            </View>
            <View style={fastStyles.progressLabelRow}>
              <Text style={fastStyles.progressLabel}>{progressPercent}% of target</Text>
              <Text style={[fastStyles.progressLabel, { color: stageInfo.color, fontWeight: '700' }]}>
                {stageInfo.label}
              </Text>
            </View>
          </View>

          {/* Stage Progression Pipeline */}
          <View style={fastStyles.stagePipeline}>
            {(['Digestion', 'Glycogen Depletion', 'Ketosis', 'Autophagy'] as FastingMetabolicStage[]).map((stg) => {
              const info = METABOLIC_STAGES[stg];
              const isCurrent = currentStage === stg;
              const isPassed = elapsedHours >= info.minHours;

              return (
                <View key={stg} style={fastStyles.pipelineItem}>
                  <View
                    style={[
                      fastStyles.pipelineNode,
                      isPassed && { backgroundColor: info.color },
                      isCurrent && fastStyles.pipelineNodeActive,
                    ]}
                  >
                    {isPassed && <Icon name="check" size={12} color={C.white} />}
                  </View>
                  <Text
                    style={[
                      fastStyles.pipelineText,
                      isCurrent && { color: C.ink, fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {info.label}
                  </Text>
                  <Text style={fastStyles.pipelineHours}>{info.minHours}h+</Text>
                </View>
              );
            })}
          </View>

          {/* Active Stage Science Card */}
          <View style={[fastStyles.activeStageCard, { borderLeftColor: stageInfo.color }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Icon name="fire" size={16} color={stageInfo.color} />
              <Text style={[fastStyles.stageTitle, { color: stageInfo.color }]}>{stageInfo.label}</Text>
            </View>
            <Text style={fastStyles.stageDesc}>{stageInfo.description}</Text>
            <View style={fastStyles.benefitTags}>
              {stageInfo.benefits.map((b) => (
                <View key={b} style={fastStyles.benefitTag}>
                  <Text style={fastStyles.benefitTagText}>✓ {b}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Controls */}
          <Button
            label="End Fast"
            icon="stop-circle-outline"
            secondary
            onPress={handleEndFast}
          />
        </View>
      ) : (
        <View style={fastStyles.idleSection}>
          <View style={fastStyles.idleBanner}>
            <Icon name="timer-sand" size={32} color={C.green} />
            <Text style={fastStyles.idleTitle}>Fasting Window Closed</Text>
            <Text style={fastStyles.idleSubtitle}>
              Ready for your next fast? Select your protocol ({fastingSession.protocol || '16:8'},{' '}
              {getProtocolTargetHours(fastingSession.protocol || '16:8')}h) and start whenever you take your last bite.
            </Text>
          </View>

          <Button
            label={`Start ${fastingSession.protocol || '16:8'} Fast`}
            icon="play-circle-outline"
            onPress={() => handleStartFast(fastingSession.protocol)}
          />
        </View>
      )}

      {/* Fasting History */}
      {fastingSession.history && fastingSession.history.length > 0 && (
        <View style={fastStyles.historySection}>
          <Text style={fastStyles.historyHeader}>Recent Fasts</Text>
          <View style={{ gap: 8 }}>
            {fastingSession.history.slice(0, 3).map((entry) => {
              const durHours = (entry.durationSeconds / 3600).toFixed(1);
              const dateStr = new Date(entry.endedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });

              return (
                <View key={entry.id} style={fastStyles.historyRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={[
                        fastStyles.historyBadge,
                        { backgroundColor: entry.completed ? '#E5F0E9' : '#FCE8E6' },
                      ]}
                    >
                      <Icon
                        name={entry.completed ? 'check-bold' : 'clock-outline'}
                        size={14}
                        color={entry.completed ? '#18685D' : '#A33F39'}
                      />
                    </View>
                    <View>
                      <Text style={fastStyles.historyDate}>
                        {dateStr} • {entry.protocol} Protocol
                      </Text>
                      <Text style={fastStyles.historyDuration}>
                        {durHours} hrs fasted (Target {entry.targetHours}h)
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      fastStyles.historyStatus,
                      { color: entry.completed ? '#18685D' : '#A33F39' },
                    ]}
                  >
                    {entry.completed ? 'Goal Met' : 'Partial'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Science & Stage Information Modal */}
      <Modal
        visible={showScienceModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowScienceModal(false)}
      >
        <View style={fastStyles.modalContainer}>
          <View style={fastStyles.modalHeader}>
            <View>
              <Text style={s.eyebrow}>ELAPSED TIME</Text>
              <Text style={s.heading}>About the fasting timer</Text>
            </View>
            <Pressable
              onPress={() => setShowScienceModal(false)}
              style={fastStyles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close modal"
            >
              <Icon name="close" size={20} color={C.ink} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
            {Object.values(METABOLIC_STAGES).map((stage) => (
              <View
                key={stage.stage}
                style={[fastStyles.modalStageCard, { borderLeftColor: stage.color }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[fastStyles.stageTitle, { color: stage.color }]}>{stage.label}</Text>
                  <Text style={fastStyles.stageHours}>
                    {stage.minHours}h – {stage.maxHours}h
                  </Text>
                </View>
                <Text style={fastStyles.stageDesc}>{stage.description}</Text>
                <View style={fastStyles.benefitTags}>
                  {stage.benefits.map((b) => (
                    <View key={b} style={fastStyles.benefitTag}>
                      <Text style={fastStyles.benefitTagText}>✓ {b}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </Card>
  );
}

const fastStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.pale,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  infoBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.green,
  },
  protocolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 6,
  },
  protocolChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  protocolChipSelected: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  protocolChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  protocolChipTextSelected: {
    color: C.white,
  },
  activeSection: {
    gap: 14,
    marginTop: 6,
  },
  timerBox: {
    backgroundColor: '#0F1E20',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  timerUpper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#A0B2B0',
  },
  timerMain: {
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: C.white,
    letterSpacing: 0.5,
    marginVertical: 4,
  },
  timerDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#24393C',
  },
  timerSub: {
    fontSize: 12,
    color: '#A0B2B0',
    fontWeight: '500',
  },
  progressBarContainer: {
    gap: 6,
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: C.bg,
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.line,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 12,
    color: C.muted,
  },
  stagePipeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  pipelineItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  pipelineNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipelineNodeActive: {
    borderWidth: 2,
    borderColor: C.ink,
  },
  pipelineText: {
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
  },
  pipelineHours: {
    fontSize: 10,
    color: C.muted,
  },
  activeStageCard: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
  },
  stageTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  stageDesc: {
    fontSize: 13,
    color: C.ink,
    lineHeight: 18,
    marginVertical: 6,
  },
  benefitTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  benefitTag: {
    backgroundColor: C.white,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  benefitTagText: {
    fontSize: 11,
    color: C.ink,
  },
  idleSection: {
    gap: 14,
    paddingVertical: 6,
  },
  idleBanner: {
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    textAlign: 'center',
  },
  idleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
  },
  idleSubtitle: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  historySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 8,
  },
  historyHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.bg,
    padding: 10,
    borderRadius: 10,
  },
  historyBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDate: {
    fontSize: 12,
    fontWeight: '600',
    color: C.ink,
  },
  historyDuration: {
    fontSize: 11,
    color: C.muted,
  },
  historyStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: C.bg,
    padding: 20,
    paddingTop: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  modalStageCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    gap: 6,
  },
  stageHours: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
  },
});
