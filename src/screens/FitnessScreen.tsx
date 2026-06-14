import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Rect, Line, Text as SvgText } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeScaleStore } from '../store/useSafeScaleStore';

const COLORS = {
  primary: '#227C54',
  primaryContainer: '#D5F1E2',
  secondary: '#3B8B9B',
  background: '#F3F5F7',
  surface: '#FFFFFF',
  alert: '#EB4C42',
  alertContainer: '#FFEBEA',
  textPrimary: '#1A2129',
  textSecondary: '#6B7A87',
  border: 'hsl(220, 20%, 90%)',
};

const formatDuration = (totalSeconds: number): string => {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const FitnessScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  
  // Zustand State
  const isTrackingActive = useSafeScaleStore((s) => s.isTrackingActive);
  const trackingType = useSafeScaleStore((s) => s.trackingType);
  const trackingPath = useSafeScaleStore((s) => s.trackingPath) || [];
  const trackingSteps = useSafeScaleStore((s) => s.trackingSteps);
  const trackingDistance = useSafeScaleStore((s) => s.trackingDistance);
  const trackingCalories = useSafeScaleStore((s) => s.trackingCalories);
  const appWorkouts = useSafeScaleStore((s) => s.appWorkouts) || [];
  const profile = useSafeScaleStore((s) => s.profile);
  const unitPreference = profile?.unitPreference || 'imperial';
  
  // Actions
  const startWorkout = useSafeScaleStore((s) => s.startWorkout);
  const stopWorkout = useSafeScaleStore((s) => s.stopWorkout);
  const deleteWorkout = useSafeScaleStore((s) => s.deleteWorkout);

  // Local UI States
  const [selectedType, setSelectedType] = useState<'Run' | 'Walk' | 'Cycle'>('Run');
  
  // Local duration counter
  const [durationSec, setDurationSec] = useState(0);
  const timerRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (isTrackingActive) {
      setDurationSec(0);
      timerRef.current = setInterval(() => {
        setDurationSec((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTrackingActive]);

  // Render static or dynamic GPS Route path
  const renderPathPreview = () => {
    if (trackingPath.length < 2) {
      return (
        <View style={styles.emptyPathBox}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={32} color={COLORS.textSecondary} />
          <Text style={styles.emptyPathText}>GPS signal active. Tracing path...</Text>
        </View>
      );
    }

    const width = Dimensions.get('window').width - 72;
    const height = 140;
    const padding = 15;

    // Calculate bounds of coordinates to scale to SVG dimensions
    const lats = trackingPath.map((p) => p.latitude);
    const lons = trackingPath.map((p) => p.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const latRange = Math.max(0.0001, maxLat - minLat);
    const lonRange = Math.max(0.0001, maxLon - minLon);

    const getX = (lon: number) => padding + ((lon - minLon) / lonRange) * (width - 2 * padding);
    const getY = (lat: number) => height - padding - ((lat - minLat) / latRange) * (height - 2 * padding);

    const points = trackingPath.map((p) => `${getX(p.longitude)},${getY(p.latitude)}`).join(' ');

    const startX = getX(trackingPath[0].longitude);
    const startY = getY(trackingPath[0].latitude);
    const endX = getX(trackingPath[trackingPath.length - 1].longitude);
    const endY = getY(trackingPath[trackingPath.length - 1].latitude);

    return (
      <View style={styles.pathPreviewContainer}>
        <Svg width={width} height={height}>
          <Rect width={width} height={height} rx={12} fill="#E8EDF0" />
          <Polyline fill="none" stroke={COLORS.primary} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" points={points} />
          {/* Start Point */}
          <Circle cx={startX} cy={startY} r={6} fill="#3B8B9B" stroke="#FFFFFF" strokeWidth={1.5} />
          {/* End Point */}
          <Circle cx={endX} cy={endY} r={6} fill={COLORS.alert} stroke="#FFFFFF" strokeWidth={1.5} />
        </Svg>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: 40,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textPrimary }}>
            Fitness & GPS Tracker
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Log and map your outdoor workouts in real-time.
          </Text>
        </View>

        {isTrackingActive ? (
          /* Live Tracking State */
          <View style={styles.card}>
            <View style={styles.liveBadge}>
              <View style={styles.pulseIndicator} />
              <Text style={styles.liveBadgeText}>
                Live Tracking: {trackingType}
              </Text>
            </View>

            {/* Path Preview Visualizer */}
            {renderPathPreview()}

            {/* Live Stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Duration</Text>
                <Text style={styles.statValue}>{formatDuration(durationSec)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Distance</Text>
                <Text style={styles.statValue}>
                  {unitPreference === 'imperial'
                    ? `${(trackingDistance * 0.000621371).toFixed(2)} mi`
                    : `${(trackingDistance / 1000).toFixed(2)} km`}
                </Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Steps</Text>
                <Text style={styles.statValue}>{trackingSteps}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Est. Calories</Text>
                <Text style={styles.statValue}>{Math.round(trackingCalories)} kcal</Text>
              </View>
            </View>

            {/* Stop Workout Button */}
            <Pressable
              onPress={() => {
                stopWorkout();
                Alert.alert('Workout Saved', 'Your workout has been added to your log and daily stability statistics.');
              }}
              style={({ pressed }) => [styles.stopBtn, pressed && styles.btnPressed]}
            >
              <MaterialCommunityIcons name="stop" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.stopBtnText}>End and Save Workout</Text>
            </Pressable>
          </View>
        ) : (
          /* Idle / Setup State */
          <View style={styles.card}>
            <Text style={styles.setupTitle}>Start New Activity</Text>
            <Text style={styles.setupSubtitle}>Choose your workout type below to initiate GPS tracing and step monitoring.</Text>

            {/* Selectors */}
            <View style={styles.typeSelectorRow}>
              {(['Run', 'Walk', 'Cycle'] as const).map((type) => {
                const isSelected = selectedType === type;
                let icon = 'run';
                if (type === 'Walk') icon = 'walk';
                if (type === 'Cycle') icon = 'bicycle';

                return (
                  <Pressable
                    key={type}
                    onPress={() => setSelectedType(type)}
                    style={[
                      styles.typeSelector,
                      isSelected && styles.typeSelectorSelected,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={icon as any}
                      size={24}
                      color={isSelected ? COLORS.primary : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.typeText,
                        isSelected && styles.typeTextSelected,
                      ]}
                    >
                      {type}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Start Button */}
            <Pressable
              onPress={() => startWorkout(selectedType)}
              style={({ pressed }) => [styles.startBtn, pressed && styles.btnPressed]}
            >
              <MaterialCommunityIcons name="play" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.startBtnText}>Start Live Tracking</Text>
            </Pressable>
          </View>
        )}

        {/* Workouts History Log */}
        <View style={{ marginTop: 24 }}>
          <Text style={styles.historyTitle}>Workout Log & History</Text>
          {appWorkouts.length === 0 ? (
            <View style={styles.emptyHistoryCard}>
              <MaterialCommunityIcons name="history" size={36} color={COLORS.textSecondary} />
              <Text style={styles.emptyHistoryText}>No workouts recorded yet.</Text>
            </View>
          ) : (
            appWorkouts.map((w) => {
              const durMs = new Date(w.endTime).getTime() - new Date(w.startTime).getTime();
              const durSec = Math.max(0, Math.round(durMs / 1000));
              let wIcon = 'run';
              if (w.type === 'Walk') wIcon = 'walk';
              if (w.type === 'Cycle') wIcon = 'bicycle';

              const dateStr = new Date(w.startTime).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <View key={w.id} style={styles.historyItem}>
                  <View style={styles.historyIconBox}>
                    <MaterialCommunityIcons name={wIcon as any} size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyHeader}>
                      {w.type} • {dateStr}
                    </Text>
                    <Text style={styles.historyDetails}>
                      {formatDuration(durSec)} · {unitPreference === 'imperial'
                        ? `${(w.distance * 0.000621371).toFixed(2)} mi`
                        : `${(w.distance / 1000).toFixed(2)} km`} · {Math.round(w.calories)} kcal · {w.steps} steps
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      Alert.alert('Delete Workout', 'Are you sure you want to remove this workout record?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(w.id) },
                      ]);
                    }}
                    style={{ padding: 6 }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.alert} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#1A2129',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  setupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  setupSubtitle: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 18,
    marginBottom: 20,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  typeSelector: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  typeSelectorSelected: {
    backgroundColor: COLORS.primaryContainer,
    borderColor: COLORS.primary,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  typeTextSelected: {
    color: COLORS.primary,
  },
  startBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  btnPressed: {
    opacity: 0.88,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  pulseIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  emptyPathBox: {
    height: 140,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  emptyPathText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  pathPreviewContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 6,
  },
  divider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  stopBtn: {
    backgroundColor: COLORS.alert,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  emptyHistoryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#1A2129',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1.5,
  },
  historyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  historyDetails: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
});

export default FitnessScreen;
