import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import { ActivityRings } from '../components/care/ActivityRings';
import SleepArchitectureCard from '../components/care/SleepArchitectureCard';
import AutonomicCardioCard from '../components/care/AutonomicCardioCard';
import { Button, Card, Heading, Icon, Page, Sheet, C, s, Chips, type IconName } from '../components/care/UI';
import {
  estimateCaloriesBurned,
  calculatePace,
  calculateMaxHeartRate,
  getHeartRateZone,
} from '../services/WorkoutService';
import type { WorkoutType, StrengthSet, WorkoutSession } from '../types';

const WORKOUT_TYPES: { type: WorkoutType; icon: IconName; label: string }[] = [
  { type: 'Running', icon: 'run', label: 'Run' },
  { type: 'Walking', icon: 'walk', label: 'Walk' },
  { type: 'Cycling', icon: 'bike', label: 'Cycle' },
  { type: 'Strength', icon: 'dumbbell', label: 'Strength' },
  { type: 'HIIT', icon: 'fire', label: 'HIIT' },
  { type: 'Yoga', icon: 'yoga', label: 'Yoga' },
  { type: 'Other', icon: 'heart-pulse', label: 'Other' },
];

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function ActivityScreen() {
  const workouts = useSafeScaleStore((state) => state.workouts) || [];
  const activeWorkout = useSafeScaleStore((state) => state.activeWorkout);
  const activityRings = useSafeScaleStore((state) => state.activityRings);
  const recoveryScore = useSafeScaleStore((state) => state.recoveryScore);
  const profile = useSafeScaleStore((state) => state.profile);
  const biometricCore = useSafeScaleStore((state) => state.biometricCore);
  const demo = useSafeScaleStore((state) => state.isTestMode);

  const startLiveWorkout = useSafeScaleStore((state) => state.startLiveWorkout);
  const updateLiveWorkout = useSafeScaleStore((state) => state.updateLiveWorkout);
  const finishLiveWorkout = useSafeScaleStore((state) => state.finishLiveWorkout);
  const cancelLiveWorkout = useSafeScaleStore((state) => state.cancelLiveWorkout);
  const deleteWorkout = useSafeScaleStore((state) => state.deleteWorkout);
  const recalculateRecovery = useSafeScaleStore((state) => state.recalculateRecoveryScore);
  const addWorkout = useSafeScaleStore((state) => state.addWorkout);

  // Modals
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<WorkoutType>('Running');
  const [workoutCustomName, setWorkoutCustomName] = useState('');

  // Quick manual log form
  const [logType, setLogType] = useState<WorkoutType>('Running');
  const [logDurationMin, setLogDurationMin] = useState('30');
  const [logCalories, setLogCalories] = useState('250');
  const [logDistanceKm, setLogDistanceKm] = useState('3.5');

  // Strength set logger in active workout
  const [newExerciseName, setNewExerciseName] = useState('Bench Press');
  const [newReps, setNewReps] = useState('10');
  const [newWeightKg, setNewWeightKg] = useState('60');

  // Timer interval for active workout
  const timerRef = useRef<any>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!recoveryScore?.hasEnoughData) {
      recalculateRecovery();
    }
  }, []);

  useEffect(() => {
    if (activeWorkout) {
      const initialSec = activeWorkout.durationSeconds || Math.max(0, Math.round((Date.now() - Date.parse(activeWorkout.startedAt)) / 1000));
      setElapsedSeconds(initialSec);

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          // Periodically sync live stats into activeWorkout
          const userWeight = profile.weight || 70;
          const liveCalories = estimateCaloriesBurned(activeWorkout.type, next, userWeight);
          updateLiveWorkout({
            durationSeconds: next,
            caloriesBurned: liveCalories,
          });
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedSeconds(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeWorkout?.id]);

  const handleStartWorkout = () => {
    const defaultName = `${selectedType} Session`;
    startLiveWorkout(selectedType, workoutCustomName.trim() || defaultName);
    setStartModalOpen(false);
    setWorkoutCustomName('');
  };

  const handleFinishWorkout = () => {
    Alert.alert(
      'Finish Workout',
      'Are you sure you want to finish this workout? It will be saved and synced to Apple Health.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish & Save',
          onPress: () => {
            const saved = finishLiveWorkout();
            if (saved) {
              Alert.alert('Workout Recorded', `Great job! You burned ~${saved.caloriesBurned} kcal in ${formatTime(saved.durationSeconds)}.`);
            }
          },
        },
      ]
    );
  };

  const handleCancelWorkout = () => {
    Alert.alert(
      'Discard Workout?',
      'Are you sure you want to stop and discard the active workout?',
      [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => cancelLiveWorkout() },
      ]
    );
  };

  const handleAddStrengthSet = () => {
    if (!activeWorkout) return;
    const reps = parseInt(newReps, 10) || 10;
    const weight = parseFloat(newWeightKg) || 0;
    const setItem: StrengthSet = {
      exercise: newExerciseName.trim() || 'Exercise',
      reps,
      weightKg: weight,
      completed: true,
    };
    const currentSets = activeWorkout.strengthSets || [];
    updateLiveWorkout({
      strengthSets: [...currentSets, setItem],
    });
  };

  const handleManualLog = () => {
    const durationMin = parseInt(logDurationMin, 10) || 30;
    const durationSeconds = durationMin * 60;
    const weight = profile.weight || 70;
    const estimatedCals = estimateCaloriesBurned(logType, durationSeconds, weight);
    const calories = parseInt(logCalories, 10) || estimatedCals;
    const distKm = parseFloat(logDistanceKm) || 0;

    const newSession: WorkoutSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: logType,
      name: `${logType} Session`,
      startedAt: new Date(Date.now() - durationSeconds * 1000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds,
      caloriesBurned: calories,
      distanceMeters: distKm > 0 ? distKm * 1000 : undefined,
      source: 'app',
    };

    addWorkout(newSession);
    setLogModalOpen(false);
    Alert.alert('Workout Logged', `Logged ${logType} for ${durationMin} min (${calories} kcal).`);
  };

  // Recovery status styling
  const recoveryColor =
    recoveryScore?.status === 'Optimal'
      ? '#18685D'
      : recoveryScore?.status === 'Good'
      ? '#2A8C82'
      : recoveryScore?.status === 'Fair'
      ? C.amber
      : C.red;

  const maxHR = calculateMaxHeartRate(profile.dob ? (new Date().getFullYear() - new Date(profile.dob).getFullYear()) : 30);
  const currentBpm = biometricCore.heartRate || 120;
  const currentZone = getHeartRateZone(currentBpm, maxHR);

  return (
    <Page
      title="Fitness & Activity"
      subtitle="Apple Watch & Health Sync · Workout Recording · Readiness"
      action={
        <Button
          label="Start Workout"
          icon="plus"
          onPress={() => setStartModalOpen(true)}
        />
      }
    >
      {demo && (
        <Text style={[s.label, { color: C.amber }]}>
          SAMPLE MODE · Displaying simulated fitness & activity telemetry
        </Text>
      )}

      {/* ACTIVE LIVE WORKOUT BANNER */}
      {activeWorkout && (
        <View style={styles.activeWorkoutCard}>
          <View style={s.row}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE SESSION</Text>
            </View>
            <Text style={styles.activeWorkoutTitle}>{activeWorkout.name}</Text>
          </View>

          {/* Big Digital Timer */}
          <Text style={styles.timerDisplay}>{formatTime(elapsedSeconds)}</Text>

          {/* Real-time stats grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>CALORIES</Text>
              <Text style={styles.statValue}>
                {activeWorkout.caloriesBurned || estimateCaloriesBurned(activeWorkout.type, elapsedSeconds, profile.weight || 70)}
                <Text style={styles.statUnit}> kcal</Text>
              </Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statLabel}>HEART RATE</Text>
              <Text style={styles.statValue}>
                {biometricCore.heartRate || '--'}
                <Text style={styles.statUnit}> bpm</Text>
              </Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statLabel}>INTENSITY</Text>
              <Text style={[styles.statValue, { color: '#00E7FF' }]}>
                Zone {currentZone}
              </Text>
            </View>
          </View>

          {/* Strength Set Tracker if Strength workout */}
          {activeWorkout.type === 'Strength' && (
            <View style={styles.strengthLogger}>
              <Text style={styles.subSectionTitle}>Set Logger</Text>
              {activeWorkout.strengthSets && activeWorkout.strengthSets.length > 0 ? (
                activeWorkout.strengthSets.map((set, idx) => (
                  <View key={idx} style={styles.strengthSetRow}>
                    <Text style={styles.setNumber}>Set {idx + 1}</Text>
                    <Text style={styles.setText}>{set.exercise}</Text>
                    <Text style={styles.setDetail}>{set.reps} reps @ {set.weightKg} kg</Text>
                    <Icon name="check-circle" color="#A1FD00" size={18} />
                  </View>
                ))
              ) : (
                <Text style={{ color: '#A4D6BD', fontSize: 13 }}>No sets recorded yet.</Text>
              )}

              <View style={[s.row, { marginTop: 8 }]}>
                <TextInput
                  style={[styles.miniInput, { flex: 2 }]}
                  placeholder="Exercise"
                  placeholderTextColor="#7BA894"
                  value={newExerciseName}
                  onChangeText={setNewExerciseName}
                />
                <TextInput
                  style={[styles.miniInput, { flex: 1 }]}
                  placeholder="Reps"
                  keyboardType="numeric"
                  placeholderTextColor="#7BA894"
                  value={newReps}
                  onChangeText={setNewReps}
                />
                <TextInput
                  style={[styles.miniInput, { flex: 1 }]}
                  placeholder="Kg"
                  keyboardType="numeric"
                  placeholderTextColor="#7BA894"
                  value={newWeightKg}
                  onChangeText={setNewWeightKg}
                />
                <Button label="+ Add" secondary onPress={handleAddStrengthSet} />
              </View>
            </View>
          )}

          {/* Finish & Cancel Actions */}
          <View style={[s.row, { justifyContent: 'flex-end', marginTop: 16 }]}>
            <Button label="Discard" secondary onPress={handleCancelWorkout} />
            <Button label="Finish Workout" icon="check" onPress={handleFinishWorkout} />
          </View>
        </View>
      )}

      {/* APPLE WATCH ACTIVITY RINGS CARD */}
      <Card>
        <View style={s.row}>
          <Icon name="circle-slice-8" size={24} color="#FA114F" />
          <Heading
            title="Activity Rings"
            detail={
              activityRings.lastSyncedAt
                ? `Updated ${new Date(activityRings.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} via Apple Health`
                : 'Synced with Apple Watch & Health'
            }
          />
        </View>
        <ActivityRings rings={activityRings} size={170} />
      </Card>

      {/* RECOVERY READINESS SCORE CARD */}
      <Card>
        <View style={s.row}>
          <Icon name="lightning-bolt-circle" size={24} color={recoveryColor} />
          <Heading
            title="Recovery Readiness"
            detail="Experimental estimate from recorded sleep, resting heart rate, and activity; not a diagnosis"
          />
        </View>

        <View style={styles.readinessContainer}>
          <View style={[styles.readinessScoreBadge, { borderColor: recoveryColor }]}>
            <Text style={[styles.readinessScoreNumber, { color: recoveryColor }]}>
              {recoveryScore?.hasEnoughData ? recoveryScore.score : '—'}
            </Text>
            <Text style={styles.readinessScoreMax}>/ 100</Text>
          </View>

          <View style={{ flex: 1, gap: 4 }}>
            <View style={s.row}>
              <Text style={[styles.readinessStatusBadge, { backgroundColor: recoveryColor }]}>
                {recoveryScore?.hasEnoughData ? recoveryScore.status : 'Not enough data'}
              </Text>
            </View>
            <Text style={styles.readinessRecommendation}>
              {recoveryScore?.recommendation || 'Sync health readings to estimate recovery.'}
            </Text>
          </View>
        </View>

        {/* Readiness factors */}
        <View style={styles.factorsRow}>
          <View style={styles.factorItem}>
            <Text style={styles.factorLabel}>SLEEP (45%)</Text>
            <Text style={styles.factorValue}>{recoveryScore?.hasEnoughData ? `${recoveryScore.sleepFactor}%` : '—'}</Text>
          </View>
          <View style={styles.factorItem}>
            <Text style={styles.factorLabel}>RHR DEVIATION (35%)</Text>
            <Text style={styles.factorValue}>{recoveryScore?.hasEnoughData ? `${recoveryScore.rhrFactor}%` : '—'}</Text>
          </View>
          <View style={styles.factorItem}>
            <Text style={styles.factorLabel}>WORKOUT STRAIN (20%)</Text>
            <Text style={styles.factorValue}>{recoveryScore?.hasEnoughData ? `${recoveryScore.strainFactor}%` : '—'}</Text>
          </View>
        </View>
      </Card>

      {/* SLEEP ARCHITECTURE & CIRCADIAN RHYTHM CARD */}
      <SleepArchitectureCard />

      {/* AUTONOMIC NERVOUS SYSTEM & HRV DIAGNOSTICS */}
      <AutonomicCardioCard />

      {/* WORKOUT QUICK ACTIONS */}
      <Card>
        <Heading
          title="Record or Log Workouts"
          detail="SafeScale attempts to save completed workouts to Apple Health. Ring credit depends on the samples accepted by HealthKit."
        />
        <View style={s.wrap}>
          <Button
            label="Start Live Recording"
            icon="play"
            onPress={() => setStartModalOpen(true)}
          />
          <Button
            label="Quick Log Past Workout"
            secondary
            icon="playlist-plus"
            onPress={() => setLogModalOpen(true)}
          />
        </View>
      </Card>

      {/* WORKOUT HISTORY LOG */}
      <Card>
        <View style={s.row}>
          <Icon name="history" size={24} color={C.green} />
          <Heading
            title="Workout History"
            detail={`${workouts.length} total workout sessions recorded`}
          />
        </View>

        {workouts.length > 0 ? (
          <View style={{ gap: 12 }}>
            {workouts.map((w) => {
              const dateStr = new Date(w.startedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });
              const timeStr = new Date(w.startedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <View key={w.id} style={styles.workoutItem}>
                  <View style={styles.workoutIconContainer}>
                    <Icon
                      name={
                        w.type === 'Running'
                          ? 'run'
                          : w.type === 'Walking'
                          ? 'walk'
                          : w.type === 'Cycling'
                          ? 'bike'
                          : w.type === 'Strength'
                          ? 'dumbbell'
                          : 'heart-pulse'
                      }
                      color={C.green}
                      size={24}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={s.row}>
                      <Text style={styles.workoutName}>{w.name || `${w.type} Workout`}</Text>
                      <Text style={styles.sourceTag}>
                        {w.source === 'apple-health' ? ' Health' : w.source === 'google-fit' ? 'Google' : 'SafeScale'}
                      </Text>
                    </View>
                    <Text style={styles.workoutMeta}>
                      {dateStr} · {timeStr} · {Math.round(w.durationSeconds / 60)} min · {w.caloriesBurned} kcal
                      {w.distanceMeters ? ` · ${(w.distanceMeters / 1000).toFixed(2)} km` : ''}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityLabel="Delete workout"
                    onPress={() => {
                      Alert.alert('Delete Workout', 'Delete this workout record?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(w.id) },
                      ]);
                    }}
                    style={{ padding: 8 }}
                  >
                    <Icon name="delete-outline" color={C.muted} size={20} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyWorkouts}>
            <Icon name="dumbbell" size={36} color={C.muted} />
            <Text style={styles.emptyTitle}>No workouts recorded yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap "Start Live Recording" above or sync with Apple Health / Google Fit.
            </Text>
          </View>
        )}
      </Card>

      {/* START WORKOUT MODAL */}
      {startModalOpen && (
        <Sheet title="Start a Workout" onClose={() => setStartModalOpen(false)}>
          <Text style={s.body}>
            Select your activity type. Live metrics, heart rate zones, and calories will be tracked and saved to Apple Health.
          </Text>

          <View style={styles.typeSelectorGrid}>
            {WORKOUT_TYPES.map((item) => (
              <Pressable
                key={item.type}
                accessibilityRole="button"
                onPress={() => setSelectedType(item.type)}
                style={[
                  styles.typeOptionCard,
                  selectedType === item.type && styles.typeOptionSelected,
                ]}
              >
                <Icon
                  name={item.icon}
                  size={26}
                  color={selectedType === item.type ? C.white : C.green}
                />
                <Text
                  style={[
                    styles.typeOptionLabel,
                    selectedType === item.type && { color: C.white },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ gap: 6, marginTop: 8 }}>
            <Text style={s.label}>Custom Name (Optional)</Text>
            <TextInput
              style={s.input}
              placeholder={`e.g. Afternoon ${selectedType}`}
              placeholderTextColor={C.muted}
              value={workoutCustomName}
              onChangeText={setWorkoutCustomName}
            />
          </View>

          <View style={[s.row, { justifyContent: 'flex-end', marginTop: 12 }]}>
            <Button label="Cancel" secondary onPress={() => setStartModalOpen(false)} />
            <Button label="Begin Session" icon="play" onPress={handleStartWorkout} />
          </View>
        </Sheet>
      )}

      {/* QUICK LOG WORKOUT MODAL */}
      {logModalOpen && (
        <Sheet title="Quick Log Workout" onClose={() => setLogModalOpen(false)}>
          <Text style={s.body}>
            Manually enter a completed workout to credit calories and exercise minutes to your activity rings.
          </Text>

          <Chips
            options={WORKOUT_TYPES.map((t) => t.type)}
            value={logType}
            onChange={(val) => setLogType(val as WorkoutType)}
          />

          <View style={{ gap: 6 }}>
            <Text style={s.label}>Duration (minutes)</Text>
            <TextInput
              style={s.input}
              keyboardType="numeric"
              value={logDurationMin}
              onChangeText={setLogDurationMin}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.label}>Calories Burned (kcal)</Text>
            <TextInput
              style={s.input}
              keyboardType="numeric"
              value={logCalories}
              onChangeText={setLogCalories}
            />
          </View>

          {(logType === 'Running' || logType === 'Walking' || logType === 'Cycling') && (
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Distance (km)</Text>
              <TextInput
                style={s.input}
                keyboardType="numeric"
                value={logDistanceKm}
                onChangeText={setLogDistanceKm}
              />
            </View>
          )}

          <View style={[s.row, { justifyContent: 'flex-end', marginTop: 12 }]}>
            <Button label="Cancel" secondary onPress={() => setLogModalOpen(false)} />
            <Button label="Save Workout" icon="check" onPress={handleManualLog} />
          </View>
        </Sheet>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  activeWorkoutCard: {
    backgroundColor: C.ink,
    borderRadius: 24,
    padding: 24,
    gap: 16,
    borderWidth: 2,
    borderColor: '#FA114F',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(250, 17, 79, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FA114F',
  },
  liveText: {
    color: '#FA114F',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  activeWorkoutTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: '700',
  },
  timerDisplay: {
    color: C.white,
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginVertical: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 14,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A4D6BD',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A4D6BD',
  },
  strengthLogger: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  subSectionTitle: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  strengthSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  setNumber: {
    color: '#A4D6BD',
    fontSize: 12,
    fontWeight: '700',
    width: 45,
  },
  setText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  setDetail: {
    color: '#A4D6BD',
    fontSize: 12,
    marginRight: 8,
  },
  miniInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: C.white,
    fontSize: 13,
  },
  readinessContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  readinessScoreBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.pale,
  },
  readinessScoreNumber: {
    fontSize: 24,
    fontWeight: '900',
  },
  readinessScoreMax: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '700',
    marginTop: -2,
  },
  readinessStatusBadge: {
    color: C.white,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  readinessRecommendation: {
    fontSize: 13,
    color: C.ink,
    lineHeight: 18,
    marginTop: 2,
  },
  factorsRow: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'space-between',
    marginTop: 4,
  },
  factorItem: {
    alignItems: 'center',
    flex: 1,
  },
  factorLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  factorValue: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
  },
  workoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  workoutIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.pale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  sourceTag: {
    fontSize: 10,
    fontWeight: '700',
    color: C.muted,
    backgroundColor: C.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  workoutMeta: {
    fontSize: 12,
    color: C.muted,
  },
  emptyWorkouts: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
    marginTop: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    maxWidth: 260,
  },
  typeSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 12,
  },
  typeOptionCard: {
    width: '30%',
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    gap: 6,
  },
  typeOptionSelected: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  typeOptionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.ink,
  },
});
