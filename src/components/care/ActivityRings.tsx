import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import type { ActivityRingsData } from '../../types';
import { C, Icon } from './UI';

interface ActivityRingsProps {
  rings: ActivityRingsData;
  size?: number;
}

const RING_COLORS = {
  move: '#FA114F',       // Apple Move Red
  moveBg: 'rgba(250, 17, 79, 0.2)',
  exercise: '#A1FD00',   // Apple Exercise Green
  exerciseBg: 'rgba(161, 253, 0, 0.2)',
  stand: '#00E7FF',      // Apple Stand Cyan
  standBg: 'rgba(0, 231, 255, 0.2)',
};

export const ActivityRings: React.FC<ActivityRingsProps> = ({ rings, size = 160 }) => {
  const strokeWidth = size * 0.085;
  const center = size / 2;

  // Radii for the 3 concentric rings
  const rMove = center - strokeWidth;
  const rExercise = rMove - strokeWidth - 4;
  const rStand = rExercise - strokeWidth - 4;

  const circMove = 2 * Math.PI * rMove;
  const circExercise = 2 * Math.PI * rExercise;
  const circStand = 2 * Math.PI * rStand;

  const movePct = rings.moveTargetCalories > 0
    ? Math.min(2.0, (rings.moveCalories || 0) / rings.moveTargetCalories)
    : 0;
  const exercisePct = rings.exerciseTargetMinutes > 0
    ? Math.min(2.0, (rings.exerciseMinutes || 0) / rings.exerciseTargetMinutes)
    : 0;
  const standPct = rings.standTargetHours > 0
    ? Math.min(2.0, (rings.standHours || 0) / rings.standTargetHours)
    : 0;

  const offsetMove = circMove * (1 - Math.min(1, movePct));
  const offsetExercise = circExercise * (1 - Math.min(1, exercisePct));
  const offsetStand = circStand * (1 - Math.min(1, standPct));

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${center}, ${center}`}>
            {/* Move Track & Progress */}
            <Circle
              cx={center}
              cy={center}
              r={rMove}
              stroke={RING_COLORS.moveBg}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <Circle
              cx={center}
              cy={center}
              r={rMove}
              stroke={RING_COLORS.move}
              strokeWidth={strokeWidth}
              strokeDasharray={circMove}
              strokeDashoffset={offsetMove}
              strokeLinecap="round"
              fill="transparent"
            />

            {/* Exercise Track & Progress */}
            <Circle
              cx={center}
              cy={center}
              r={rExercise}
              stroke={RING_COLORS.exerciseBg}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <Circle
              cx={center}
              cy={center}
              r={rExercise}
              stroke={RING_COLORS.exercise}
              strokeWidth={strokeWidth}
              strokeDasharray={circExercise}
              strokeDashoffset={offsetExercise}
              strokeLinecap="round"
              fill="transparent"
            />

            {/* Stand Track & Progress */}
            <Circle
              cx={center}
              cy={center}
              r={rStand}
              stroke={RING_COLORS.standBg}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <Circle
              cx={center}
              cy={center}
              r={rStand}
              stroke={RING_COLORS.stand}
              strokeWidth={strokeWidth}
              strokeDasharray={circStand}
              strokeDashoffset={offsetStand}
              strokeLinecap="round"
              fill="transparent"
            />
          </G>
        </Svg>
      </View>

      {/* Legend & Details */}
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: RING_COLORS.move }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>MOVE</Text>
            <Text style={styles.metricValue}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{rings.moveCalories || 0}</Text>
              <Text style={{ color: C.muted }}> / {rings.moveTargetCalories || 600} kcal</Text>
            </Text>
          </View>
          <Text style={[styles.percentageText, { color: RING_COLORS.move }]}>
            {Math.round(movePct * 100)}%
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: RING_COLORS.exercise }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>EXERCISE</Text>
            <Text style={styles.metricValue}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{rings.exerciseMinutes || 0}</Text>
              <Text style={{ color: C.muted }}> / {rings.exerciseTargetMinutes || 30} min</Text>
            </Text>
          </View>
          <Text style={[styles.percentageText, { color: '#68A800' }]}>
            {Math.round(exercisePct * 100)}%
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: RING_COLORS.stand }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>STAND</Text>
            <Text style={styles.metricValue}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{rings.standHours || 0}</Text>
              <Text style={{ color: C.muted }}> / {rings.standTargetHours || 12} hrs</Text>
            </Text>
          </View>
          <Text style={[styles.percentageText, { color: '#00A4B8' }]}>
            {Math.round(standPct * 100)}%
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    flexWrap: 'wrap',
  },
  legend: {
    flex: 1,
    minWidth: 160,
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.muted,
  },
  metricValue: {
    fontSize: 14,
    color: C.ink,
    marginTop: 1,
  },
  percentageText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
