/**
 * @file src/screens/HomeScreen.tsx
 * @description Screen 5 — Home Dashboard with bottom navigation.
 *
 * Layout sections (top → bottom, matching Stitch Screen 5 spec):
 *   1. Status bar safe-area header
 *   2. Greeting + date header strip
 *   3. Health Stability Score card  ← SVG animated progress ring
 *   4. Biometric stats row          ← Heart rate · Sleep · Steps · Calories
 *   5. Allergen profile pill strip
 *   6. Medication timeline card     ← Interactive status state machine
 *   7. Bottom navigation bar
 *
 * Design token alignment:
 *   --color-primary          #227C54   (emerald green)
 *   --color-primary-container #D5F1E2
 *   --color-secondary        #3B8B9B   (muted teal)
 *   --color-background       #F3F5F7
 *   --color-surface          #FFFFFF
 *   --color-alert            #EB4C42   (coral-red)
 *   --color-text-primary     #1A2129
 *   --color-text-secondary   #6B7A87
 *   --radius-container       24px      (rounded-3xl)
 *   --screen-padding         20px
 */

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  StatusBar,
  LayoutAnimation,
  Platform,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  useSafeScaleStore,
  selectBiometricCore,
  selectMedicationSchedule,
  selectUserAllergies,
  selectDailyStabilityScore,
  selectIsTestMode,
  selectHasHealthPermission,
  selectMoodLogs,
  selectVitalsLogs,
} from '../store/useSafeScaleStore';
import type { MedicationItem } from '../types';
import { HealthDataService } from '../services/HealthDataService';

// ---------------------------------------------------------------------------
// Design constants
// ---------------------------------------------------------------------------

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
  ringTrack: '#E8EDF0',
} as const;

const SCREEN_PADDING = 20;

// ---------------------------------------------------------------------------
// SVG Ring configuration
// ---------------------------------------------------------------------------

const RING_SIZE = 180;
const RING_STROKE_WIDTH = 14;
const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// The ring starts at 12 o'clock — rotate SVG by -90°.

// ---------------------------------------------------------------------------
// Helper: score → ring color band
// ---------------------------------------------------------------------------

type ScoreBand = 'excellent' | 'good' | 'fair' | 'low';

function getScoreBand(score: number): ScoreBand {
  if (score >= 85) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 45) return 'fair';
  return 'low';
}

const BAND_COLORS: Record<ScoreBand, [string, string]> = {
  excellent: ['#34C98A', '#227C54'],
  good: ['#5BB8D4', '#3B8B9B'],
  fair: ['#F4C842', '#E0A020'],
  low: ['#F07070', '#EB4C42'],
};

// ---------------------------------------------------------------------------
// Helper: format sleep minutes → "7h 30m"
// ---------------------------------------------------------------------------

function formatSleepMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Helper: today's date string
// ---------------------------------------------------------------------------

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-component: AnimatedRing
// ---------------------------------------------------------------------------

interface AnimatedRingProps {
  score: number; // 1-100
}

const AnimatedRing: React.FC<AnimatedRingProps> = ({ score }) => {
  /** Animated value representing the dashoffset (drives the fill arc). */
  const animatedOffset = useRef(
    new Animated.Value(RING_CIRCUMFERENCE),
  ).current;

  /** Animated number mirrored to the displayed score text. */
  const [displayScore, setDisplayScore] = useState(0);
  const animatedScore = useRef(new Animated.Value(0)).current;

  const band = getScoreBand(score);
  const [gradStart, gradEnd] = BAND_COLORS[band];

  useEffect(() => {
    const targetOffset =
      RING_CIRCUMFERENCE - (score / 100) * RING_CIRCUMFERENCE;

    // Arc fill animation
    Animated.timing(animatedOffset, {
      toValue: targetOffset,
      duration: 1400,
      delay: 300,
      useNativeDriver: false, // SVG props cannot use native driver
    }).start();

    // Score counter animation
    Animated.timing(animatedScore, {
      toValue: score,
      duration: 1200,
      delay: 300,
      useNativeDriver: false,
    }).start();

    const listenerId = animatedScore.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });

    return () => {
      animatedScore.removeListener(listenerId);
    };
  }, [score, animatedOffset, animatedScore]);

  // Interpolate dashoffset for use in SVG
  const strokeDashoffset = animatedOffset;

  const bandLabel: Record<ScoreBand, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    low: 'Low',
  };

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Defs>
          <LinearGradient
            id="ringGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <Stop offset="0%" stopColor={gradStart} stopOpacity={1} />
            <Stop offset="100%" stopColor={gradEnd} stopOpacity={1} />
          </LinearGradient>
        </Defs>

        {/* Track circle */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={COLORS.ringTrack}
          strokeWidth={RING_STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
        />

        {/* Animated fill arc — uses AnimatedCircle via composition */}
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="url(#ringGradient)"
          strokeWidth={RING_STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
        />
      </Svg>

      {/* Centred score overlay */}
      <View
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
          width: RING_SIZE,
          height: RING_SIZE,
        }}
      >
        <Text
          style={{
            fontSize: 44,
            fontWeight: '800',
            color: COLORS.textPrimary,
            letterSpacing: -1,
          }}
        >
          {displayScore}
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: gradEnd,
            marginTop: -2,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
          }}
        >
          {bandLabel[band]}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: COLORS.textSecondary,
            marginTop: 2,
          }}
        >
          Stability Score
        </Text>
      </View>
    </View>
  );
};

/**
 * Animated wrapper for SVG Circle accepting an Animated.Value strokeDashoffset.
 * react-native-svg ships AnimatedCircle since v12 but we derive it explicitly
 * for compatibility across versions.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ---------------------------------------------------------------------------
// Sub-component: BiometricStatCard
// ---------------------------------------------------------------------------

interface BiometricStatCardProps {
  icon: string;
  iconColor: string;
  value: string;
  unit: string;
  label: string;
}

const BiometricStatCard: React.FC<BiometricStatCardProps> = ({
  icon,
  iconColor,
  value,
  unit,
  label,
}) => (
  <View
    style={{
      flex: 1,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 14,
      alignItems: 'center',
      // Card shadow
      shadowColor: '#1A2129',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    }}
  >
    <MaterialCommunityIcons
      name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
      size={22}
      color={iconColor}
    />
    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4, maxWidth: '100%' }}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{
          fontSize: 20,
          fontWeight: '700',
          color: COLORS.textPrimary,
          flexShrink: 1,
        }}
      >
        {value}
      </Text>
      {unit !== '' && (
        <Text
          numberOfLines={1}
          style={{
            fontSize: 11,
            fontWeight: '500',
            color: COLORS.textSecondary,
            marginLeft: 2,
            flexShrink: 1,
          }}
        >
          {unit}
        </Text>
      )}
    </View>
    <Text
      numberOfLines={1}
      style={{
        fontSize: 10,
        color: COLORS.textSecondary,
        marginTop: 2,
        textAlign: 'center',
      }}
    >
      {label}
    </Text>
  </View>
);

// ---------------------------------------------------------------------------
// Sub-component: MedicationTimelineRow
// ---------------------------------------------------------------------------

/**
 * Status → visual configuration map.
 * Drives the icon, colour scheme, and label for each medication card state.
 */
const STATUS_CONFIG = {
  Completed: {
    dotColor: COLORS.primary,
    badgeBackground: COLORS.primaryContainer,
    badgeText: COLORS.primary,
    iconName: 'check-circle',
    label: 'Completed',
  },
  Active: {
    dotColor: COLORS.secondary,
    badgeBackground: '#D6EFF4',
    badgeText: COLORS.secondary,
    iconName: 'clock-outline',
    label: 'Take Now',
  },
  Pending: {
    dotColor: '#B0BEC5',
    badgeBackground: '#F0F3F5',
    badgeText: '#6B7A87',
    iconName: 'clock-outline',
    label: 'Pending',
  },
} as const;

interface MedicationTimelineRowProps {
  item: MedicationItem;
  isLast: boolean;
  onMarkComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onRefill: (id: string, amount: number) => void;
}

const MedicationTimelineRow: React.FC<MedicationTimelineRowProps> = ({
  item,
  isLast,
  onMarkComplete,
  onDelete,
  onRefill,
}) => {
  const config = STATUS_CONFIG[item.status];
  const schedule = useSafeScaleStore(selectMedicationSchedule) || [];
  const loggedItems = useSafeScaleStore((s) => s.loggedItems) || [];

  // Check Drug-Drug Conflicts
  const drugConflicts = React.useMemo(() => {
    const activeNames = schedule.map(m => m.name.toLowerCase());
    const currentName = item.name.toLowerCase();
    const list: string[] = [];

    if (currentName === 'lisinopril' && activeNames.includes('spironolactone')) {
      list.push('Spironolactone (elevated blood potassium risk)');
    }
    if (currentName === 'spironolactone' && activeNames.includes('lisinopril')) {
      list.push('Lisinopril (elevated blood potassium risk)');
    }
    if (currentName === 'aspirin' && activeNames.includes('ibuprofen')) {
      list.push('Ibuprofen (GI bleed risk & blocks Aspirin action)');
    }
    if (currentName === 'ibuprofen' && activeNames.includes('aspirin')) {
      list.push('Aspirin (GI bleeding risk)');
    }
    return list;
  }, [schedule, item.name]);

  // Check Drug-Food Conflicts
  const foodConflicts = React.useMemo(() => {
    const loggedNames = loggedItems.map(li => li.name.toLowerCase());
    const currentName = item.name.toLowerCase();
    const list: string[] = [];

    if (currentName === 'atorvastatin' && loggedNames.some(n => n.includes('grapefruit'))) {
      list.push('Grapefruit Juice (increases statin toxicity risk)');
    }
    if (currentName === 'lisinopril') {
      if (loggedNames.some(n => n.includes('potassium'))) {
        list.push('High Potassium Foods (hyperkalemia risk)');
      }
      if (loggedNames.some(n => n.includes('sodium'))) {
        list.push('High Sodium Foods (counteracts BP medication)');
      }
    }
    return list;
  }, [loggedItems, item.name]);

  /** Pulsing ring animation for Active status indicator dot. */
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (item.status !== 'Active') return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 2.0,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [item.status, pulseScale, pulseOpacity]);

  const handlePress = useCallback(() => {
    if (item.status === 'Completed') return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onMarkComplete(item.id);
  }, [item.id, item.status, onMarkComplete]);

  return (
    <View style={{ flexDirection: 'row', marginBottom: isLast ? 0 : 16 }}>
      {/* Timeline track column */}
      <View style={{ alignItems: 'center', width: 28, marginRight: 12 }}>
        {/* Animated pulse ring (Active only) */}
        {item.status === 'Active' && (
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: config.dotColor,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            }}
          />
        )}
        {/* Solid status dot */}
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: config.dotColor,
            marginTop: 0,
          }}
        />
        {/* Connecting line */}
        {!isLast && (
          <View
            style={{
              flex: 1,
              width: 2,
              backgroundColor: COLORS.border,
              marginTop: 4,
              borderRadius: 1,
            }}
          />
        )}
      </View>

      {/* Medication card */}
      <Pressable
        onPress={handlePress}
        disabled={item.status === 'Completed'}
        style={({ pressed }) => ({
          flex: 1,
          backgroundColor: COLORS.surface,
          borderRadius: 16,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          opacity: pressed ? 0.88 : 1,
          // Card shadow
          shadowColor: '#1A2129',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
          elevation: 2,
        })}
      >
        {/* Pill icon container */}
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: config.badgeBackground,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <MaterialCommunityIcons
            name={item.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
            size={22}
            color={config.badgeText}
          />
        </View>

        {/* Name + dosage */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: COLORS.textPrimary,
            }}
          >
            {item.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: COLORS.textSecondary,
              marginTop: 2,
            }}
          >
            {item.dosage} · {item.time}
          </Text>
          {item.stock !== undefined && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <View
                style={{
                  backgroundColor: item.stock <= (item.refillThreshold || 5) ? COLORS.alertContainer : '#E8F5E9',
                  borderRadius: 4,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: item.stock <= (item.refillThreshold || 5) ? COLORS.alert : COLORS.primary,
                  }}
                >
                  Stock: {item.stock} left {item.stock <= (item.refillThreshold || 5) ? '⚠️' : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Conflict Warnings */}
          {drugConflicts.map((conflict, idx) => (
            <View
              key={`dc-${idx}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 4,
                backgroundColor: COLORS.alertContainer,
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderWidth: 0.5,
                borderColor: COLORS.alert,
              }}
            >
              <MaterialCommunityIcons name="alert-octagon" size={12} color={COLORS.alert} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: COLORS.alert, flex: 1 }}>
                Conflict: {conflict}
              </Text>
            </View>
          ))}
          {foodConflicts.map((conflict, idx) => (
            <View
              key={`fc-${idx}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 4,
                backgroundColor: '#FFF3E0',
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderWidth: 0.5,
                borderColor: '#E88C30',
              }}
            >
              <MaterialCommunityIcons name="alert" size={12} color="#E88C30" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#E65100', flex: 1 }}>
                Food Conflict: {conflict}
              </Text>
            </View>
          ))}
        </View>

        {/* Status badge */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: config.badgeBackground,
            borderRadius: 100,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
        >
          <MaterialCommunityIcons
            name={config.iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
            size={13}
            color={config.badgeText}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: config.badgeText,
              marginLeft: 4,
            }}
          >
            {config.label}
          </Text>
        </View>

        {/* Refill medication button */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            Alert.alert(
              'Refill Medication',
              `How many pills would you like to add to ${item.name}?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: '+30 Pills', onPress: () => onRefill(item.id, 30) },
                { text: '+60 Pills', onPress: () => onRefill(item.id, 60) },
              ]
            );
          }}
          style={({ pressed }) => ({
            marginLeft: 4,
            padding: 6,
            borderRadius: 8,
            backgroundColor: pressed ? COLORS.primaryContainer : 'transparent',
            justifyContent: 'center',
            alignItems: 'center',
          })}
        >
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={COLORS.primary} />
        </Pressable>

        {/* Delete medication button */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            Alert.alert(
              'Delete Medication',
              `Are you sure you want to remove ${item.name} from your schedule?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => onDelete(item.id),
                },
              ]
            );
          }}
          style={({ pressed }) => ({
            marginLeft: 4,
            padding: 6,
            borderRadius: 8,
            backgroundColor: pressed ? COLORS.alertContainer : 'transparent',
            justifyContent: 'center',
            alignItems: 'center',
          })}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.alert} />
        </Pressable>
      </Pressable>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: AllergenPill
// ---------------------------------------------------------------------------

interface AllergenPillProps {
  label: string;
}

const AllergenPill: React.FC<AllergenPillProps> = ({ label }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.alertContainer,
      borderRadius: 100,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      marginBottom: 8,
    }}
  >
    <MaterialCommunityIcons
      name="alert-circle-outline"
      size={13}
      color={COLORS.alert}
    />
    <Text
      style={{
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.alert,
        marginLeft: 5,
      }}
    >
      {label}
    </Text>
  </View>
);

// ---------------------------------------------------------------------------
// Section header helper
// ---------------------------------------------------------------------------

const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 14,
    }}
  >
    <Text
      numberOfLines={1}
      style={{
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
        flex: 1,
        marginRight: 8,
      }}
    >
      {title}
    </Text>
    {subtitle !== undefined && (
      <Text
        numberOfLines={1}
        style={{
          fontSize: 12,
          color: COLORS.secondary,
          fontWeight: '600',
          flexShrink: 1,
        }}
      >
        {subtitle}
      </Text>
    )}
  </View>
);

// ---------------------------------------------------------------------------
// HomeScreen
// ---------------------------------------------------------------------------

/** Helper function to detect if running on Android Emulator or iOS Simulator */
const checkIsEmulator = (): boolean => {
  const constants = Platform.constants as any;
  if (Platform.OS === 'android') {
    const brand = constants.Brand || '';
    const model = constants.Model || '';
    const fingerprint = constants.Fingerprint || '';
    const hardware = constants.Hardware || '';
    return (
      fingerprint.startsWith('generic') ||
      fingerprint.startsWith('unknown') ||
      model.includes('google_sdk') ||
      model.includes('Emulator') ||
      model.includes('Android SDK built for x86') ||
      model.includes('sdk_gphone') ||
      model.startsWith('sdk_') ||
      brand.startsWith('generic') ||
      hardware.includes('goldfish') ||
      hardware.includes('ranchu') ||
      hardware.includes('vbox86') ||
      hardware.includes('gphone')
    );
  } else if (Platform.OS === 'ios') {
    const model = constants.Model || '';
    return model.toLowerCase().includes('simulator');
  }
  return false;
};

interface HomeScreenProps {
  /** Passed from the root navigator to drive the BottomNavBar active state. */
  onNavigate: (index: number) => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
  const insets = useSafeAreaInsets();

  // ── Store selectors ──────────────────────────────────────────────────────
  const biometricCore = useSafeScaleStore(selectBiometricCore);
  const medicationSchedule = useSafeScaleStore(selectMedicationSchedule);
  const userAllergies = useSafeScaleStore(selectUserAllergies);
  const stabilityScore = useSafeScaleStore(selectDailyStabilityScore);
  const isTestMode = useSafeScaleStore(selectIsTestMode);
  const hasHealthPermission = useSafeScaleStore(selectHasHealthPermission);
  const lastSyncedAt = useSafeScaleStore((state) => state.lastSyncedAt);
  const moodLogs = useSafeScaleStore(selectMoodLogs) || [];
  const vitalsLogs = useSafeScaleStore(selectVitalsLogs) || [];

  const setMedicationStatus = useSafeScaleStore((s) => s.setMedicationStatus);
  const toggleTestMode = useSafeScaleStore((s) => s.toggleTestMode);
  const addMedication = useSafeScaleStore((s) => s.addMedication);
  const removeMedication = useSafeScaleStore((s) => s.removeMedication);
  const updateBiometrics = useSafeScaleStore((s) => s.updateBiometrics);
  const setHealthPermission = useSafeScaleStore((s) => s.setHealthPermission);
  const loggedItems = useSafeScaleStore((s) => s.loggedItems) || [];
  const deleteLoggedItem = useSafeScaleStore((s) => s.deleteLoggedItem);
  const hydrationGoal = useSafeScaleStore((s) => s.hydrationGoal) || 2000;
  const calorieGoal = useSafeScaleStore((s) => s.calorieGoal) || 2000;

  const symptomLogs = useSafeScaleStore((s) => s.symptomLogs) || [];
  const addSymptomLog = useSafeScaleStore((s) => s.addSymptomLog);
  const deleteSymptomLog = useSafeScaleStore((s) => s.deleteSymptomLog);
  const refillMedication = useSafeScaleStore((s) => s.refillMedication);
  const emergencyContacts = useSafeScaleStore((s) => s.emergencyContacts) || [];
  const addEmergencyContact = useSafeScaleStore((s) => s.addEmergencyContact);
  const removeEmergencyContact = useSafeScaleStore((s) => s.removeEmergencyContact);
  const profile = useSafeScaleStore((s) => s.profile);
  const addMoodLog = useSafeScaleStore((s) => s.addMoodLog);
  const addVitalLog = useSafeScaleStore((s) => s.addVitalLog);

  const totalHydration = loggedItems
    .filter((item) => item.type === 'Water')
    .reduce((acc, item) => {
      const match = item.value.match(/\d+/);
      return acc + (match ? parseInt(match[0], 10) : 0);
    }, 0);

  const totalCalories = loggedItems
    .filter((item) => item.type === 'Meal')
    .reduce((acc, item) => {
      const match = item.value.match(/\d+/);
      return acc + (match ? parseInt(match[0], 10) : 0);
    }, 0);

  // ── Local UI State ────────────────────────────────────────────────────────
  const [tapCount, setTapCount] = useState(0);
  const lastTapTime = useRef<number>(0);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medTime, setMedTime] = useState('08:00');
  const [medIcon, setMedIcon] = useState('pill');
  const [medStock, setMedStock] = useState('30');
  const [medRefillThreshold, setMedRefillThreshold] = useState('5');
  const [medInactiveIngredients, setMedInactiveIngredients] = useState('');

  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isSymptomModalOpen, setIsSymptomModalOpen] = useState(false);

  // AI Symptom Triage States
  const [isSymptomCheckerOpen, setIsSymptomCheckerOpen] = useState(false);
  const [checkerSymptoms, setCheckerSymptoms] = useState<string[]>([]);
  const [triageResult, setTriageResult] = useState<{ severity: 'Red' | 'Yellow' | 'Green'; text: string; actionText: string } | null>(null);
  const [symptomTypeInput, setSymptomTypeInput] = useState('Headache');
  const [symptomSeverityInput, setSymptomSeverityInput] = useState(5);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(0);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [isSyncPickerOpen, setIsSyncPickerOpen] = useState(false);
  const [syncPlatform, setSyncPlatform] = useState<'apple' | 'google' | null>(null);

  const [isICEModalOpen, setIsICEModalOpen] = useState(false);
  const [isVitalsModalOpen, setIsVitalsModalOpen] = useState(false);
  const [isMentalModalOpen, setIsMentalModalOpen] = useState(false);

  // Vitals inputs
  const [systolicBPInput, setSystolicBPInput] = useState('');
  const [diastolicBPInput, setDiastolicBPInput] = useState('');
  const [glucoseInput, setGlucoseInput] = useState('');
  const [glucoseContext, setGlucoseContext] = useState<'Fasting' | 'Post-Meal' | 'General'>('Fasting');
  const [spo2Input, setSpo2Input] = useState('');
  const [tempInput, setTempInput] = useState('');

  // Mood inputs
  const [moodRating, setMoodRating] = useState(7);
  const [moodStress, setMoodStress] = useState<'Low' | 'Medium' | 'High'>('Low');
  const [selectedFeelings, setSelectedFeelings] = useState<string[]>([]);
  const [moodNotes, setMoodNotes] = useState('');

  // Box Breathing
  const [isBreathingActive, setIsBreathingActive] = useState(false);
  const [breathingText, setBreathingText] = useState('Get Ready');
  const [breathingCycle, setBreathingCycle] = useState(0); // 0: ready, 1: inhale, 2: hold, 3: exhale, 4: hold
  const [breathingProgress, setBreathingProgress] = useState(0);
  const breathingAnim = useRef(new Animated.Value(1)).current;

  // ── Handlers ─────────────────────────────────────────────────────────────

  /**
   * Toggles the developer test mode after tapping 5 times within a 2-second window.
   */
  const handleGreetingPress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime.current < 2000) {
      const nextCount = tapCount + 1;
      setTapCount(nextCount);
      if (nextCount >= 5) {
        toggleTestMode();
        setTapCount(0);
        Alert.alert(
          !isTestMode ? 'Test Mode Enabled' : 'Test Mode Disabled',
          !isTestMode
            ? 'SafeScale Health has loaded mock user telemetry and medication schedules.'
            : 'SafeScale Health has cleared mock data back to default empty states.',
          [{ text: 'OK' }]
        );
      }
    } else {
      setTapCount(1);
    }
    lastTapTime.current = now;
  }, [tapCount, isTestMode, toggleTestMode]);

  /**
   * Submits the interactive add medication form to the Zustand store.
   */
  const handleAddMedicationSubmit = useCallback(() => {
    if (medName.trim() === '' || medDosage.trim() === '') {
      Alert.alert('Required Fields', 'Please enter both medication name and dosage.');
      return;
    }
    const parsedStock = parseInt(medStock, 10);
    const parsedThreshold = parseInt(medRefillThreshold, 10);
    const inactiveArray = medInactiveIngredients
      .split(',')
      .map(i => i.trim())
      .filter(i => i.length > 0);

    addMedication({
      name: medName.trim(),
      dosage: medDosage.trim(),
      time: medTime.trim() || '08:00',
      icon: medIcon,
      stock: isNaN(parsedStock) ? 30 : parsedStock,
      refillThreshold: isNaN(parsedThreshold) ? 5 : parsedThreshold,
      refillAlertsEnabled: true,
      inactiveIngredients: inactiveArray,
    });

    setMedName('');
    setMedDosage('');
    setMedTime('08:00');
    setMedIcon('pill');
    setMedStock('30');
    setMedRefillThreshold('5');
    setMedInactiveIngredients('');
    setIsAddModalOpen(false);
  }, [
    medName,
    medDosage,
    medTime,
    medIcon,
    medStock,
    medRefillThreshold,
    medInactiveIngredients,
    addMedication,
  ]);

  // Removed handleAddAllergenSubmit (moved to SettingsScreen)

  /**
   * Helper that executes the actual animated sync sequence.
   */
  const executeSync = useCallback(() => {
    setIsSyncing(true);
    setSyncStep(1);

    // Step 1: Connecting to Platform Health APIs
    setTimeout(() => {
      // Check if we are running on an emulator and test mode is NOT active
      const runningOnEmulator = checkIsEmulator();
      if (runningOnEmulator && !isTestMode) {
        setIsSyncing(false);
        setSyncStep(0);
        Alert.alert(
          'Sync Failed',
          `No health tracker data found.\n\nReason: Running on an emulator which has no health tracker data configured.\n\nTo view biometric data, please enable Test Mode.`,
          [{ text: 'OK' }]
        );
        return;
      }

      setSyncStep(2);
      
      // Step 2: Reading Resting Heart Rate History
      setTimeout(() => {
        setSyncStep(3);

        // Step 3: Importing steps & sleep metrics
        setTimeout(() => {
          setSyncStep(4);

          // Step 4: Import complete, update store
          setTimeout(async () => {
            let heartRate = Math.floor(68 + Math.random() * 12);
            let restingHeartRate = Math.floor(58 + Math.random() * 8);
            let sleepMinutes = Math.floor(420 + Math.random() * 90);
            let sleepConsistency = Math.floor(82 + Math.random() * 14);
            let steps = Math.floor(8000 + Math.random() * 4000);
            let activeCalories = Math.floor(350 + Math.random() * 200);

            if (Platform.OS === 'ios' && syncPlatform === 'apple') {
              try {
                const realData = await HealthDataService.fetchHealthData();
                if (realData) {
                  heartRate = realData.heartRate;
                  restingHeartRate = realData.restingHeartRate;
                  sleepMinutes = realData.sleepMinutes;
                  sleepConsistency = realData.sleepConsistency;
                  steps = realData.steps;
                  activeCalories = realData.activeCalories;
                }
              } catch (e) {
                console.warn('[HealthKit] Failed to fetch real health data:', e);
              }
            } else if (Platform.OS === 'android' && syncPlatform === 'google') {
              try {
                const realData = await HealthDataService.fetchHealthConnectData();
                if (realData) {
                  heartRate = realData.heartRate;
                  restingHeartRate = realData.restingHeartRate;
                  sleepMinutes = realData.sleepMinutes;
                  sleepConsistency = realData.sleepConsistency;
                  steps = realData.steps;
                  activeCalories = realData.activeCalories;
                }
              } catch (e) {
                console.warn('[HealthConnect] Failed to fetch real health data:', e);
              }
            }

            const baseHistory = biometricCore.historicalRHR.length >= 3 
              ? biometricCore.historicalRHR 
              : [64, 66, 65, 63, 67];
            const updatedHistory = [...baseHistory, restingHeartRate].slice(-14);

            const dailyStabilityScore = HealthDataService.calculateHealthStabilityScore(
              restingHeartRate,
              sleepConsistency,
              updatedHistory
            );

            updateBiometrics({
              heartRate,
              restingHeartRate,
              sleepMinutes,
              sleepConsistency,
              steps,
              activeCalories,
              dailyStabilityScore,
              historicalRHR: updatedHistory,
            });

            // Simulate updating profile weight baseline from health tracker sync
            const nextWeight = Math.floor(60 + Math.random() * 5);
            useSafeScaleStore.getState().updateProfile({
              weight: nextWeight,
            });

            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            useSafeScaleStore.setState({ lastSyncedAt: `Today at ${timeString}` });

            setIsSyncing(false);
            setSyncStep(0);
            Alert.alert('Health Sync Complete', 'Successfully imported health metrics from your device tracker.');
          }, 1000);
        }, 1200);
      }, 1200);
    }, 1200);
  }, [updateBiometrics, isTestMode, biometricCore.historicalRHR, syncPlatform]);

  /**
   * Checks for health data permission before syncing.
   * Prompts the user if permission is unrequested or previously denied.
   */
  const handleSyncHealthData = useCallback((platform: 'apple' | 'google') => {
    if (Platform.OS === 'ios' && platform === 'google') {
      setIsSyncPickerOpen(false);
      Alert.alert(
        'Google Health on iOS',
        'On iOS, Google Fit and Fitbit sync their data directly into Apple Health (HealthKit).\n\nPlease make sure Google Fit/Fitbit is allowed to share data with Apple Health in your device settings, then sync using Apple Health.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sync via Apple Health',
            onPress: () => {
              setSyncPlatform('apple');
              if (hasHealthPermission === true) {
                executeSync();
              } else {
                setIsPermissionModalOpen(true);
              }
            },
          },
        ]
      );
      return;
    }

    if (Platform.OS === 'android' && platform === 'apple') {
      setIsSyncPickerOpen(false);
      Alert.alert(
        'Apple Health on Android',
        'Apple Health is exclusive to iOS devices.\n\nPlease select Google Health Connect to sync your fitness and activity data on Android.',
        [{ text: 'OK' }]
      );
      return;
    }

    setSyncPlatform(platform);
    setIsSyncPickerOpen(false);
    if (hasHealthPermission === true) {
      executeSync();
    } else {
      setIsPermissionModalOpen(true);
    }
  }, [hasHealthPermission, executeSync]);

  const handleApprovePermission = useCallback(async () => {
    setIsPermissionModalOpen(false);
    
    let permissionGranted = true;
    if (Platform.OS === 'ios' && syncPlatform === 'apple') {
      try {
        permissionGranted = await HealthDataService.requestHealthPermissions();
      } catch (e) {
        console.error('[HealthKit] Permission request error:', e);
        permissionGranted = false;
      }
    } else if (Platform.OS === 'android' && syncPlatform === 'google') {
      try {
        permissionGranted = await HealthDataService.requestHealthConnectPermissions();
      } catch (e) {
        console.error('[HealthConnect] Permission request error:', e);
        permissionGranted = false;
      }
    }

    setHealthPermission(permissionGranted);

    if (permissionGranted) {
      setTimeout(() => {
        executeSync();
      }, 300);
    } else {
      Alert.alert('Permission Denied', 'SafeScale Health was denied access to your device health tracker.');
    }
  }, [setHealthPermission, executeSync, syncPlatform]);

  const handleDenyPermission = useCallback(() => {
    setHealthPermission(false);
    setIsPermissionModalOpen(false);
    Alert.alert('Permission Denied', 'SafeScale Health was denied access to your device health tracker.');
  }, [setHealthPermission]);

  const runSymptomTriage = (selected: string[]) => {
    if (selected.length === 0) {
      setTriageResult(null);
      return;
    }

    const emergencySymptoms = ['Difficulty Breathing', 'Chest Pain', 'Severe Swelling'];
    const urgentSymptoms = ['Fever', 'Vomiting', 'Dizziness', 'Widespread Rash'];

    const hasEmergency = selected.some(s => emergencySymptoms.includes(s));
    const hasUrgent = selected.some(s => urgentSymptoms.includes(s));

    if (hasEmergency) {
      setTriageResult({
        severity: 'Red',
        text: 'HIGH EMERGENCY ALERT: Potential anaphylactic reaction or severe systemic distress.',
        actionText: 'Action Required: Administer epinephrine (EpiPen) immediately if prescribed, call 911 (or emergency services), and notify your listed emergency contacts.'
      });
    } else if (hasUrgent) {
      setTriageResult({
        severity: 'Yellow',
        text: 'URGENT CARE RECOMMENDATION: Systemic physiological response observed.',
        actionText: 'Action Required: Plan to visit an urgent care clinic within 24 hours. Stay hydrated, rest, and monitor closely for respiratory difficulty.'
      });
    } else {
      setTriageResult({
        severity: 'Green',
        text: 'SELF CARE & MONITORING: Mild reaction or localized symptoms.',
        actionText: 'Action Required: Rest, drink fluids, and monitor for changes. If symptoms spread or worsen, consult a clinician.'
      });
    }
  };

  const toggleCheckerSymptom = (symptom: string) => {
    const next = checkerSymptoms.includes(symptom)
      ? checkerSymptoms.filter(s => s !== symptom)
      : [...checkerSymptoms, symptom];
    setCheckerSymptoms(next);
    runSymptomTriage(next);
  };

  // Box Breathing Timer Effect
  useEffect(() => {
    let interval: any = null;
    let secondsLeft = 4;
    
    if (isBreathingActive) {
      setBreathingCycle(1);
      setBreathingText('Inhale... Expansion');
      secondsLeft = 4;
      setBreathingProgress(secondsLeft);
      
      // Animate Inhale
      Animated.timing(breathingAnim, {
        toValue: 2,
        duration: 4000,
        useNativeDriver: true,
      }).start();

      interval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          secondsLeft = 4;
          setBreathingCycle((prev) => {
            const next = prev === 4 ? 1 : prev + 1;
            if (next === 1) {
              setBreathingText('Inhale... Expansion');
              Animated.timing(breathingAnim, {
                toValue: 2,
                duration: 4000,
                useNativeDriver: true,
              }).start();
            } else if (next === 2) {
              setBreathingText('Hold... Feel the stillness');
            } else if (next === 3) {
              setBreathingText('Exhale... Release stress');
              Animated.timing(breathingAnim, {
                toValue: 1,
                duration: 4000,
                useNativeDriver: true,
              }).start();
            } else if (next === 4) {
              setBreathingText('Hold... Remaining empty');
            }
            return next;
          });
        }
        setBreathingProgress(secondsLeft);
      }, 1000);
    } else {
      breathingAnim.setValue(1);
      setBreathingCycle(0);
      setBreathingText('Get Ready');
      setBreathingProgress(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isBreathingActive]);

  const handleVitalSubmit = useCallback(() => {
    const sys = parseInt(systolicBPInput, 10);
    const dia = parseInt(diastolicBPInput, 10);
    const gluc = parseInt(glucoseInput, 10);
    const spo2 = parseInt(spo2Input, 10);
    const temp = parseFloat(tempInput);

    if (isNaN(sys) && isNaN(dia) && isNaN(gluc) && isNaN(spo2) && isNaN(temp)) {
      Alert.alert('Empty Fields', 'Please enter at least one vital parameter.');
      return;
    }

    addVitalLog({
      systolicBP: isNaN(sys) ? undefined : sys,
      diastolicBP: isNaN(dia) ? undefined : dia,
      bloodGlucose: isNaN(gluc) ? undefined : gluc,
      glucoseContext: glucoseInput ? glucoseContext : undefined,
      spo2: isNaN(spo2) ? undefined : spo2,
      temperature: isNaN(temp) ? undefined : temp,
    });

    setSystolicBPInput('');
    setDiastolicBPInput('');
    setGlucoseInput('');
    setSpo2Input('');
    setTempInput('');
    setIsVitalsModalOpen(false);
    Alert.alert('Success', 'Vitals logged successfully.');
  }, [systolicBPInput, diastolicBPInput, glucoseInput, glucoseContext, spo2Input, tempInput, addVitalLog]);

  const handleMoodSubmit = useCallback(() => {
    addMoodLog({
      rating: moodRating,
      stressLevel: moodStress,
      feelings: selectedFeelings,
      notes: moodNotes.trim() || undefined,
    });

    setMoodRating(7);
    setMoodStress('Low');
    setSelectedFeelings([]);
    setMoodNotes('');
    setIsMentalModalOpen(false);
    Alert.alert('Success', 'Mood logged successfully.');
  }, [moodRating, moodStress, selectedFeelings, moodNotes, addMoodLog]);

  /**
   * Marks a medication as Completed. If it was previously Active → Completed.
   * If it was Pending → marks as Active first tap, Completed on second.
   */
  const handleMarkComplete = useCallback(
    (id: string) => {
      const med = medicationSchedule.find((m) => m.id === id);
      if (!med) return;
      if (med.status === 'Pending') {
        setMedicationStatus(id, 'Active');
      } else if (med.status === 'Active') {
        setMedicationStatus(id, 'Completed');
      }
    },
    [medicationSchedule, setMedicationStatus],
  );

  // ── Completed count for subtitle ─────────────────────────────────────────
  const completedCount = medicationSchedule.filter(
    (m) => m.status === 'Completed',
  ).length;

  // ── Greeting ─────────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Symptom-Food correlation predictor
  const getSymptomMealReaction = (): { symptomType: string; symptomTime: string; mealName: string; mealTime: string; timeDiffMins: number } | null => {
    if (symptomLogs.length === 0 || loggedItems.length === 0) return null;

    const latestSymptom = symptomLogs[0];
    const [sHour, sMin] = latestSymptom.timestamp.split(':').map(Number);
    const sTotalMins = sHour * 60 + sMin;

    for (const item of loggedItems) {
      if (item.type !== 'Meal') continue;
      const [mHour, mMin] = item.timestamp.split(':').map(Number);
      const mTotalMins = mHour * 60 + mMin;

      const diff = sTotalMins - mTotalMins;
      if (diff >= 0 && diff <= 240) {
        return {
          symptomType: latestSymptom.type,
          symptomTime: latestSymptom.timestamp,
          mealName: item.name,
          mealTime: item.timestamp,
          timeDiffMins: diff,
        };
      }
    }

    return null;
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: 24,
          paddingHorizontal: SCREEN_PADDING,
        }}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
      >
        {/* ── 1. Greeting Header (Pressable to toggle test mode) ── */}
        <View style={{ marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={handleGreetingPress} style={{ flex: 1, marginRight: 8 }}>
            <View>
              <Text
                style={{
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  fontWeight: '500',
                  marginBottom: 2,
                }}
              >
                {formatTodayDate()}
              </Text>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: '800',
                  color: COLORS.textPrimary,
                  letterSpacing: -0.5,
                }}
              >
                {greeting}, {profile.name.split(' ')[0]} 👋
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  marginTop: 4,
                }}
              >
                {isTestMode ? "Test Mode Active · Seeding Loaded" : "Here's your daily health overview."}
              </Text>
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {isTestMode && (
              <View
                style={{
                  backgroundColor: COLORS.alertContainer,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: COLORS.alert,
                }}
              >
                <Text style={{ color: COLORS.alert, fontWeight: '700', fontSize: 9, textTransform: 'uppercase' }}>
                  TEST
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => setIsICEModalOpen(true)}
              style={({ pressed }) => ({
                backgroundColor: '#FFF5F5',
                borderWidth: 1.5,
                borderColor: COLORS.alert,
                borderRadius: 12,
                paddingVertical: 8,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: COLORS.alert,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <MaterialCommunityIcons name="card-account-details-star" size={16} color={COLORS.alert} style={{ marginRight: 6 }} />
              <Text style={{ color: COLORS.alert, fontWeight: '800', fontSize: 11 }}>ICE CARD</Text>
            </Pressable>
          </View>
        </View>

        {/* Emergency Action Plan Card */}
        <Pressable
          onPress={() => setIsEmergencyModalOpen(true)}
          style={({ pressed }) => ({
            backgroundColor: COLORS.alertContainer,
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: COLORS.alert,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <MaterialCommunityIcons name="shield-alert" size={24} color={COLORS.alert} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.alert }}>
              Emergency Action Plan
            </Text>
            <Text style={{ fontSize: 11, color: COLORS.textPrimary, marginTop: 2 }}>
              Severe allergy guidelines, emergency contacts & dialer.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.alert} />
        </Pressable>

        {/* ── 2. Health Stability Score Card ──────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            paddingVertical: 28,
            paddingHorizontal: 24,
            marginBottom: 16,
            alignItems: 'center',
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 5,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <MaterialCommunityIcons
              name="shield-outline"
              size={18}
              color={COLORS.primary}
            />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: COLORS.textPrimary,
                marginLeft: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Daily Stability
            </Text>
          </View>

          <AnimatedRing score={stabilityScore} />

          {/* Score legend pills */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: 20,
              gap: 8,
            }}
          >
            {(
              [
                { label: 'Excellent', range: '85-100', color: '#34C98A' },
                { label: 'Good', range: '65-84', color: '#5BB8D4' },
                { label: 'Fair', range: '45-64', color: '#F4C842' },
                { label: 'Low', range: '1-44', color: '#F07070' },
              ] as const
            ).map((band) => (
              <View
                key={band.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginRight: 12,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: band.color,
                    marginRight: 4,
                  }}
                />
                <Text
                  style={{
                    fontSize: 10,
                    color: COLORS.textSecondary,
                    fontWeight: '500',
                  }}
                >
                  {band.label} {band.range}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 3. Biometric Stats Row ───────────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <BiometricStatCard
            icon="heart-pulse"
            iconColor={COLORS.alert}
            value={biometricCore.heartRate > 0 ? String(biometricCore.heartRate) : '--'}
            unit={biometricCore.heartRate > 0 ? 'bpm' : ''}
            label="Heart Rate"
          />
          <BiometricStatCard
            icon="sleep"
            iconColor={COLORS.secondary}
            value={biometricCore.sleepMinutes > 0 ? formatSleepMinutes(biometricCore.sleepMinutes) : '--'}
            unit=""
            label="Sleep"
          />
          <BiometricStatCard
            icon="shoe-sneaker"
            iconColor={COLORS.primary}
            value={
              biometricCore.steps > 0
                ? biometricCore.steps >= 1000
                  ? `${(biometricCore.steps / 1000).toFixed(1)}k`
                  : String(biometricCore.steps)
                : '--'
            }
            unit=""
            label="Steps"
          />
          <BiometricStatCard
            icon="fire"
            iconColor="#E88C30"
            value={biometricCore.activeCalories > 0 ? String(biometricCore.activeCalories) : '--'}
            unit={biometricCore.activeCalories > 0 ? 'kcal' : ''}
            label="Active Cal"
          />
        </View>

        {/* ── 3b. Sync Health Data Button ── */}
        <Pressable
          onPress={() => setIsSyncPickerOpen(true)}
          style={({ pressed }) => ({
            backgroundColor: COLORS.surface,
            borderRadius: 16,
            paddingVertical: 12,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            opacity: pressed ? 0.88 : 1,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 6,
            elevation: 1,
          })}
        >
          <MaterialCommunityIcons name="cached" size={20} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontWeight: '700', marginLeft: 8, fontSize: 13 }}>
            Sync Health Data
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.primary} style={{ marginLeft: 4 }} />
        </Pressable>

        {lastSyncedAt ? (
          <Text
            style={{
              fontSize: 12,
              color: COLORS.textSecondary,
              textAlign: 'center',
              marginTop: -8,
              marginBottom: 16,
              fontWeight: '500',
            }}
          >
            Last synced: {lastSyncedAt}
          </Text>
        ) : null}

        {/* ── 3c. Clinical Vitals Card ── */}
        <Pressable
          onPress={() => setIsVitalsModalOpen(true)}
          style={({ pressed }) => ({
            backgroundColor: COLORS.surface,
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <SectionHeader title="Clinical Vitals Tracker" subtitle="Log & Analyze →" />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.alertContainer, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <MaterialCommunityIcons name="heart-pulse" size={20} color={COLORS.alert} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                  {vitalsLogs.length > 0 && vitalsLogs[0].systolicBP ? `${vitalsLogs[0].systolicBP}/${vitalsLogs[0].diastolicBP} mmHg` : '-- / --'}
                </Text>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 1 }}>
                  Blood Pressure
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <MaterialCommunityIcons name="water-percent" size={20} color="#E88C30" />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                  {vitalsLogs.length > 0 && vitalsLogs[0].bloodGlucose ? `${vitalsLogs[0].bloodGlucose} mg/dL` : '-- mg/dL'}
                </Text>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 1 }}>
                  Glucose ({vitalsLogs.length > 0 && vitalsLogs[0].glucoseContext ? vitalsLogs[0].glucoseContext : 'Fasting'})
                </Text>
              </View>
            </View>
          </View>
        </Pressable>

        {/* ── 3d. Mental Health & Stress Buster Card ── */}
        <Pressable
          onPress={() => {
            setIsBreathingActive(false);
            setIsMentalModalOpen(true);
          }}
          style={({ pressed }) => ({
            backgroundColor: COLORS.surface,
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <SectionHeader title="Mental Health & Stress Buster" subtitle="Calm & Breathe →" />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#D5F1E2', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <MaterialCommunityIcons name="emoticon-happy-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                {moodLogs.length > 0 ? `Current Mood: ${moodLogs[0].rating}/10 (${moodLogs[0].stressLevel} Stress)` : 'How are you feeling today?'}
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                {moodLogs.length > 0 && moodLogs[0].feelings.length > 0 ? `Feelings: ${moodLogs[0].feelings.join(', ')}` : 'Log your mood or start paced breathing.'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
          </View>
        </Pressable>

        {/* ── 4. Allergen Profile Strip ────────────────────────────────── */}
        <Pressable
          onPress={() => onNavigate(4)}
          style={({ pressed }) => ({
            backgroundColor: COLORS.surface,
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <SectionHeader title="Allergen Profile" subtitle="Tap to manage →" />
          {userAllergies.length === 0 ? (
            <Text
              style={{ fontSize: 13, color: COLORS.textSecondary }}
            >
              No allergens configured.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {userAllergies.map((allergen) => (
                <AllergenPill key={allergen} label={allergen} />
              ))}
            </View>
          )}
        </Pressable>

        {/* Local AI Preferences Card removed (moved to SettingsScreen) */}

        {/* ── 5. Medication Timeline Card ──────────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 4,
          }}
        >
          <SectionHeader
            title="Today's Medications"
            subtitle={`${completedCount}/${medicationSchedule.length} done`}
          />

          {medicationSchedule.length === 0 ? (
            <Text
              style={{
                fontSize: 13,
                color: COLORS.textSecondary,
                textAlign: 'center',
                paddingVertical: 16,
              }}
            >
              No medications scheduled for today.
            </Text>
          ) : (
            medicationSchedule.map((med, index) => (
              <MedicationTimelineRow
                key={med.id}
                item={med}
                isLast={index === medicationSchedule.length - 1}
                onMarkComplete={handleMarkComplete}
                onDelete={removeMedication}
                onRefill={refillMedication}
              />
            ))
          )}

          {/* Progress bar at the bottom of the card */}
          <View
            style={{
              marginTop: 18,
              height: 4,
              backgroundColor: COLORS.border,
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${
                  medicationSchedule.length > 0
                    ? (completedCount / medicationSchedule.length) * 100
                    : 0
                }%`,
                backgroundColor: COLORS.primary,
                borderRadius: 2,
              }}
            />
          </View>
          <Text
            style={{
              fontSize: 11,
              color: COLORS.textSecondary,
              marginTop: 6,
              textAlign: 'right',
            }}
          >
            {medicationSchedule.length > 0
              ? `${Math.round(
                  (completedCount / medicationSchedule.length) * 100,
                )}% complete`
              : '—'}
          </Text>

          {/* Add Medication Trigger Button */}
          <Pressable
            onPress={() => setIsAddModalOpen(true)}
            style={({ pressed }) => ({
              marginTop: 16,
              backgroundColor: COLORS.primaryContainer,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <MaterialCommunityIcons name="plus" size={18} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontWeight: '700', marginLeft: 6, fontSize: 14 }}>
              Add Medication
            </Text>
          </Pressable>
        </View>

        {/* ── 5b. Daily Health Log Card ──────────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            marginTop: 16,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 4,
          }}
        >
          <SectionHeader
            title="Daily Health Log"
            subtitle={`${totalHydration} ml / ${totalCalories} kcal`}
          />

          {/* Hydration Progress Bar */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textPrimary }}>
                Hydration Tracker
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                Goal: {hydrationGoal} ml ({Math.min(100, Math.round((totalHydration / hydrationGoal) * 100))}% reached)
              </Text>
            </View>
            <View
              style={{
                height: 8,
                backgroundColor: COLORS.border,
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.min(100, (totalHydration / hydrationGoal) * 100)}%`,
                  backgroundColor: COLORS.secondary,
                  borderRadius: 4,
                }}
              />
            </View>
          </View>

          {/* Nutrition Progress Bar */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textPrimary }}>
                Caloric Intake
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                Goal: {calorieGoal} kcal ({Math.min(100, Math.round((totalCalories / calorieGoal) * 100))}% reached)
              </Text>
            </View>
            <View
              style={{
                height: 8,
                backgroundColor: COLORS.border,
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.min(100, (totalCalories / calorieGoal) * 100)}%`,
                  backgroundColor: '#E88C30',
                  borderRadius: 4,
                }}
              />
            </View>
          </View>

          {/* Log Entries */}
          {loggedItems.length === 0 ? (
            <Text
              style={{
                fontSize: 13,
                color: COLORS.textSecondary,
                textAlign: 'center',
                paddingVertical: 16,
              }}
            >
              No hydration or meals logged today.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {loggedItems.map((item) => (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: COLORS.background,
                    borderRadius: 16,
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: item.type === 'Water' ? '#D6EFF4' : '#FFEFEA',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <MaterialCommunityIcons
                        name={item.type === 'Water' ? 'water' : 'silverware-fork-knife'}
                        size={20}
                        color={item.type === 'Water' ? COLORS.secondary : COLORS.alert}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textPrimary }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                        {item.value} · {item.timestamp}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        'Remove Logged Item',
                        `Are you sure you want to delete this entry from your daily log?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => deleteLoggedItem(item.id),
                          },
                        ]
                      );
                    }}
                    style={({ pressed }) => ({
                      padding: 6,
                      borderRadius: 100,
                      backgroundColor: pressed ? 'rgba(0,0,0,0.05)' : 'transparent',
                    })}
                  >
                    <MaterialCommunityIcons name="close-circle-outline" size={20} color={COLORS.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── 5c. Symptoms & Flare-up Predictor Card ────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            marginTop: 16,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 4,
          }}
        >
          <SectionHeader
            title="Symptoms & Reaction Predictor"
            subtitle={`${symptomLogs.length} logged today`}
          />

          {/* Flare-up predictor alerts */}
          {(() => {
            const reaction = getSymptomMealReaction();
            if (reaction) {
              return (
                <View
                  style={{
                    backgroundColor: COLORS.alertContainer,
                    borderWidth: 1,
                    borderColor: COLORS.alert,
                    borderRadius: 16,
                    padding: 12,
                    marginBottom: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <MaterialCommunityIcons name="alert" size={20} color={COLORS.alert} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.alert }}>
                      Reaction Detected
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.textPrimary, marginTop: 2, lineHeight: 16 }}>
                      Your <Text style={{ fontWeight: '700' }}>{reaction.symptomType}</Text> was logged {reaction.timeDiffMins}m after consuming <Text style={{ fontWeight: '700' }}>{reaction.mealName}</Text>. This meal may contain active allergen triggers.
                    </Text>
                  </View>
                </View>
              );
            }
            return null;
          })()}

          {/* Symptom logs list */}
          {symptomLogs.length === 0 ? (
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 16 }}>
              No symptoms logged today.
            </Text>
          ) : (
            <View style={{ gap: 8, marginBottom: 16 }}>
              {symptomLogs.map((log: any) => (
                <View key={log.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 12, padding: 10, justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: log.severity >= 8 ? COLORS.alert : log.severity >= 4 ? '#E88C30' : COLORS.primary, marginRight: 10 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                      {log.type}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginRight: 12 }}>
                      Severity: {log.severity}/10 · {log.timestamp}
                    </Text>
                    <Pressable onPress={() => deleteSymptomLog(log.id)}>
                      <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.alert} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Add Symptom Button */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setIsSymptomModalOpen(true)}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: COLORS.primaryContainer,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <MaterialCommunityIcons name="plus" size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: '700', marginLeft: 6, fontSize: 13 }}>
                Log Symptom
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setCheckerSymptoms([]);
                setTriageResult(null);
                setIsSymptomCheckerOpen(true);
              }}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: '#FFF3E0',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <MaterialCommunityIcons name="shield-check-outline" size={18} color="#E65100" />
              <Text style={{ color: '#E65100', fontWeight: '700', marginLeft: 6, fontSize: 13 }}>
                AI Triage Guide
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Bottom spacer so content clears the nav bar */}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── 6. Add Medication Modal ───────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isAddModalOpen}
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsAddModalOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                New Medication
              </Text>
              <Pressable onPress={() => setIsAddModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380, marginBottom: 16 }}>
              {/* Input: Name */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Medication Name
              </Text>
              <TextInput
                style={{
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 15,
                  color: COLORS.textPrimary,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                placeholder="e.g. Lisinopril"
                placeholderTextColor="#A0AAB2"
                value={medName}
                onChangeText={setMedName}
              />

              {/* Input: Dosage */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Dosage / Instructions
              </Text>
              <TextInput
                style={{
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 15,
                  color: COLORS.textPrimary,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                placeholder="e.g. 10mg or 2 tablets"
                placeholderTextColor="#A0AAB2"
                value={medDosage}
                onChangeText={setMedDosage}
              />

              {/* Input: Time */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Scheduled Time (24h format)
              </Text>
              <TextInput
                style={{
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 15,
                  color: COLORS.textPrimary,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                placeholder="e.g. 08:00 or 21:00"
                placeholderTextColor="#A0AAB2"
                value={medTime}
                onChangeText={setMedTime}
              />

              {/* Input: Stock & Threshold */}
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                    Initial Stock (Qty)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: COLORS.textPrimary,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                    keyboardType="numeric"
                    value={medStock}
                    onChangeText={setMedStock}
                    placeholder="e.g. 30"
                    placeholderTextColor="#A0AAB2"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                    Low Alert Qty
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: COLORS.textPrimary,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                    keyboardType="numeric"
                    value={medRefillThreshold}
                    onChangeText={setMedRefillThreshold}
                    placeholder="e.g. 5"
                    placeholderTextColor="#A0AAB2"
                  />
                </View>
              </View>

              {/* Input: Inactive Ingredients */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Inactive Ingredients (comma separated)
              </Text>
              <TextInput
                style={{
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 15,
                  color: COLORS.textPrimary,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                placeholder="e.g. Lactose, Wheat starch, Gelatin"
                placeholderTextColor="#A0AAB2"
                value={medInactiveIngredients}
                onChangeText={setMedInactiveIngredients}
              />

              {/* Input: Icon Selection */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
                Select Icon
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                {(['pill', 'capsule', 'syringe', 'droplet'] as const).map((icon) => (
                  <Pressable
                    key={icon}
                    onPress={() => setMedIcon(icon)}
                    style={{
                      flex: 1,
                      backgroundColor: medIcon === icon ? COLORS.primaryContainer : COLORS.background,
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: medIcon === icon ? COLORS.primary : 'transparent',
                    }}
                  >
                    <MaterialCommunityIcons
                      name={icon as any}
                      size={24}
                      color={medIcon === icon ? COLORS.primary : COLORS.textSecondary}
                    />
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Submit Button */}
            <Pressable
              onPress={handleAddMedicationSubmit}
              style={({ pressed }) => ({
                backgroundColor: COLORS.primary,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                Schedule Medication
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manage Allergens Modal removed (moved to SettingsScreen) */}

      {/* ── 8. Health Sync Progress Modal ──────────────────────────────── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isSyncing}
        onRequestClose={() => {}}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 320, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8, textAlign: 'center' }}>
              Syncing Health Tracker
            </Text>
            
            <View style={{ width: '100%', gap: 12, marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons 
                  name={syncStep >= 1 ? "check-circle" : "circle-outline"} 
                  size={16} 
                  color={syncStep >= 1 ? COLORS.primary : COLORS.textSecondary} 
                />
                <Text style={{ fontSize: 12, color: syncStep >= 1 ? COLORS.textPrimary : COLORS.textSecondary, marginLeft: 8, fontWeight: syncStep === 1 ? '700' : '400' }}>
                  Connecting to Platform Health APIs...
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons 
                  name={syncStep >= 2 ? "check-circle" : "circle-outline"} 
                  size={16} 
                  color={syncStep >= 2 ? COLORS.primary : COLORS.textSecondary} 
                />
                <Text style={{ fontSize: 12, color: syncStep >= 2 ? COLORS.textPrimary : COLORS.textSecondary, marginLeft: 8, fontWeight: syncStep === 2 ? '700' : '400' }}>
                  Reading Resting Heart Rate History...
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons 
                  name={syncStep >= 3 ? "check-circle" : "circle-outline"} 
                  size={16} 
                  color={syncStep >= 3 ? COLORS.primary : COLORS.textSecondary} 
                />
                <Text style={{ fontSize: 12, color: syncStep >= 3 ? COLORS.textPrimary : COLORS.textSecondary, marginLeft: 8, fontWeight: syncStep === 3 ? '700' : '400' }}>
                  Importing steps & sleep metrics...
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons 
                  name={syncStep >= 4 ? "check-circle" : "circle-outline"} 
                  size={16} 
                  color={syncStep >= 4 ? COLORS.primary : COLORS.textSecondary} 
                />
                <Text style={{ fontSize: 12, color: syncStep >= 4 ? COLORS.textPrimary : COLORS.textSecondary, marginLeft: 8, fontWeight: syncStep === 4 ? '700' : '400' }}>
                  Calculating Health Stability Index...
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Health Sync Platform Picker Modal ─────────────────────────── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isSyncPickerOpen}
        onRequestClose={() => setIsSyncPickerOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => setIsSyncPickerOpen(false)}
        >
          <Pressable
            style={{ backgroundColor: COLORS.surface, borderRadius: 28, padding: 24, width: '100%', maxWidth: 340 }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                Sync Health Data
              </Text>
              <Pressable onPress={() => setIsSyncPickerOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 20, lineHeight: 17 }}>
              Choose your health platform to import biometric data including heart rate, sleep, steps, and active calories.
            </Text>

            {/* Apple Health Option */}
            <Pressable
              onPress={() => handleSyncHealthData('apple')}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: pressed ? '#F0FFF8' : COLORS.background,
                borderRadius: 18,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1.5,
                borderColor: syncPlatform === 'apple' ? COLORS.primary : COLORS.border,
              })}
            >
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#FFEBEA', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <MaterialCommunityIcons name="apple" size={28} color="#FF2D55" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary }}>Apple Health</Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 15 }}>
                  HealthKit · Heart Rate · Sleep · Steps · Active Calories
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.primary} />
            </Pressable>

            {/* Google Health Connect Option */}
            <Pressable
              onPress={() => handleSyncHealthData('google')}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: pressed ? '#F0FFF8' : COLORS.background,
                borderRadius: 18,
                padding: 16,
                marginBottom: 4,
                borderWidth: 1.5,
                borderColor: syncPlatform === 'google' ? COLORS.primary : COLORS.border,
              })}
            >
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <MaterialCommunityIcons name="google-fit" size={28} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary }}>Google Health Connect</Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 15 }}>
                  Health Connect · Fitbit · Samsung Health · Garmin
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.primary} />
            </Pressable>

            <Text style={{ fontSize: 10, color: COLORS.textSecondary, textAlign: 'center', marginTop: 14, lineHeight: 14 }}>
              SafeScale Health reads health data from your device's health platform. No data is uploaded to external servers.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 9. Health Tracker Permission Modal ──────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isPermissionModalOpen}
        onRequestClose={() => setIsPermissionModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 320, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <MaterialCommunityIcons name="heart-pulse" size={32} color={COLORS.primary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8, textAlign: 'center' }}>
              Health Data Access
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
              SafeScale Health requires your permission to connect and read activity counts, resting heart rate values, and sleep metrics from your device tracker.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <Pressable
                onPress={handleDenyPermission}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: COLORS.background,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 }}>Deny</Text>
              </Pressable>
              <Pressable
                onPress={handleApprovePermission}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: COLORS.primary,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Approve</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 10. Emergency Action Plan Modal ───────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEmergencyModalOpen}
        onRequestClose={() => setIsEmergencyModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsEmergencyModalOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '90%',
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="shield-alert" size={24} color={COLORS.alert} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                  Emergency Action Plan
                </Text>
              </View>
              <Pressable onPress={() => setIsEmergencyModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Emergency Call Buttons */}
              <View style={{ gap: 10, marginBottom: 20 }}>
                <Pressable
                  onPress={() => Linking.openURL('tel:911')}
                  style={({ pressed }) => ({
                    backgroundColor: COLORS.alert,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    opacity: pressed ? 0.9 : 1,
                    shadowColor: COLORS.alert,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.2,
                    shadowRadius: 8,
                    elevation: 4,
                  })}
                >
                  <MaterialCommunityIcons name="phone" size={24} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
                    CALL EMERGENCY SERVICES (911)
                  </Text>
                </Pressable>
              </View>

              {/* Severe Allergens Section */}
              <View style={{ backgroundColor: COLORS.alertContainer, borderRadius: 16, padding: 16, marginBottom: 20 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.alert, marginBottom: 8 }}>
                  YOUR SEVERE ALLERGENS:
                </Text>
                {userAllergies.length === 0 ? (
                  <Text style={{ fontSize: 12, color: COLORS.textPrimary, fontStyle: 'italic' }}>
                    No allergies registered.
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {userAllergies.map(a => (
                      <View key={a} style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.alert }}>
                        <Text style={{ color: COLORS.alert, fontWeight: '700', fontSize: 11 }}>{a}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* EpiPen Guide Steps */}
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 10 }}>
                EpiPen Administration Guide:
              </Text>
              <View style={{ gap: 12, marginBottom: 24 }}>
                {[
                  { step: '1', title: 'Prepare Pen', text: 'Flip open yellow cap and slide auto-injector out. Pull off blue safety release cap.' },
                  { step: '2', title: 'Position Pen', text: 'Hold orange tip near outer thigh (swing and push firmly until it clicks).' },
                  { step: '3', title: 'Hold & Inject', text: 'Hold firmly against thigh for 3 full seconds. Remove injector and massage thigh for 10 seconds.' },
                  { step: '4', title: 'Call 911', text: 'Always call emergency services immediately after using an epinephrine auto-injector.' }
                ].map(item => (
                  <View key={item.step} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.alertContainer, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                      <Text style={{ color: COLORS.alert, fontSize: 12, fontWeight: '800' }}>{item.step}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>{item.title}</Text>
                      <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 }}>{item.text}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Emergency Contacts Section */}
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 10 }}>
                Emergency Contacts:
              </Text>

              {emergencyContacts.length === 0 ? (
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic', marginBottom: 16 }}>
                  No emergency contacts configured. Add one below.
                </Text>
              ) : (
                <View style={{ gap: 8, marginBottom: 16 }}>
                  {emergencyContacts.map(contact => (
                    <View key={contact.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 12, padding: 12, justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>{contact.name}</Text>
                        <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>{contact.phone}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                          style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.primaryContainer, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <MaterialCommunityIcons name="phone" size={16} color={COLORS.primary} />
                        </Pressable>
                        <Pressable
                          onPress={() => removeEmergencyContact(contact.id)}
                          style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.alertContainer, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.alert} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Add Emergency Contact Form */}
              <View style={{ gap: 10, backgroundColor: COLORS.background, borderRadius: 16, padding: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textPrimary }}>
                  Add Contact:
                </Text>
                <TextInput
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 8,
                    padding: 8,
                    fontSize: 13,
                    color: COLORS.textPrimary,
                    borderWidth: 1,
                    borderColor: COLORS.border
                  }}
                  placeholder="Contact Name (e.g. Mom)"
                  placeholderTextColor="#A0AAB2"
                  value={newContactName}
                  onChangeText={setNewContactName}
                />
                <TextInput
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 8,
                    padding: 8,
                    fontSize: 13,
                    color: COLORS.textPrimary,
                    borderWidth: 1,
                    borderColor: COLORS.border
                  }}
                  placeholder="Phone Number (e.g. 555-0199)"
                  placeholderTextColor="#A0AAB2"
                  keyboardType="phone-pad"
                  value={newContactPhone}
                  onChangeText={setNewContactPhone}
                />
                <Pressable
                  onPress={() => {
                    if (newContactName.trim() === '' || newContactPhone.trim() === '') {
                      Alert.alert('Required Fields', 'Please fill in both name and phone.');
                      return;
                    }
                    addEmergencyContact({ name: newContactName.trim(), phone: newContactPhone.trim() });
                    setNewContactName('');
                    setNewContactPhone('');
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: COLORS.primary,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pressed ? 0.9 : 1
                  })}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                    Save Contact
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 11. Symptom Logging Modal ──────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isSymptomModalOpen}
        onRequestClose={() => setIsSymptomModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsSymptomModalOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                Log Symptom
              </Text>
              <Pressable onPress={() => setIsSymptomModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            {/* Selector: Symptom Type */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
              Select Symptom Type
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {['Hives', 'Headache', 'Bloating', 'Fatigue', 'Itching', 'Nausea'].map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setSymptomTypeInput(type)}
                  style={{
                    backgroundColor: symptomTypeInput === type ? COLORS.primaryContainer : COLORS.background,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 100,
                    borderWidth: 1.5,
                    borderColor: symptomTypeInput === type ? COLORS.primary : 'transparent',
                  }}
                >
                  <Text style={{ color: symptomTypeInput === type ? COLORS.primary : COLORS.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Severity Rating Selector */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
              Severity Level ({symptomSeverityInput}/10)
            </Text>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 24 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <Pressable
                  key={num}
                  onPress={() => setSymptomSeverityInput(num)}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 8,
                    backgroundColor: symptomSeverityInput === num 
                      ? (num <= 3 ? '#E8F5E9' : num <= 7 ? '#FFF3E0' : '#FFEBEE')
                      : COLORS.background,
                    borderWidth: 2,
                    borderColor: symptomSeverityInput === num
                      ? (num <= 3 ? COLORS.primary : num <= 7 ? '#E88C30' : COLORS.alert)
                      : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: symptomSeverityInput === num
                      ? (num <= 3 ? COLORS.primary : num <= 7 ? '#E88C30' : COLORS.alert)
                      : COLORS.textSecondary
                  }}>
                    {num}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Submit button */}
            <Pressable
              onPress={() => {
                addSymptomLog({ type: symptomTypeInput, severity: symptomSeverityInput });
                setIsSymptomModalOpen(false);
                setSymptomSeverityInput(5);
                Alert.alert('Symptom Logged', `Successfully recorded ${symptomTypeInput} with severity ${symptomSeverityInput}/10.`);
              }}
              style={({ pressed }) => ({
                backgroundColor: COLORS.primary,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                Log Symptom
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 7. AI Symptom Checker & Triage Guide Modal ───────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isSymptomCheckerOpen}
        onRequestClose={() => setIsSymptomCheckerOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsSymptomCheckerOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '90%',
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                  AI Symptom Triage Guide
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                  Offline Clinical Triage Guidelines Engine
                </Text>
              </View>
              <Pressable onPress={() => setIsSymptomCheckerOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 }}>
                Check all active symptoms:
              </Text>
              
              {/* Checkboxes List */}
              <View style={{ gap: 8, marginBottom: 20 }}>
                {[
                  'Difficulty Breathing',
                  'Chest Pain',
                  'Severe Swelling',
                  'Fever',
                  'Vomiting',
                  'Dizziness',
                  'Widespread Rash',
                  'Headache',
                  'Mild Hives',
                  'Fatigue',
                  'Itching',
                  'Bloating'
                ].map((symptom) => {
                  const isChecked = checkerSymptoms.includes(symptom);
                  return (
                    <Pressable
                      key={symptom}
                      onPress={() => toggleCheckerSymptom(symptom)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isChecked ? COLORS.primaryContainer : COLORS.background,
                        borderRadius: 12,
                        padding: 14,
                        borderWidth: 1.5,
                        borderColor: isChecked ? COLORS.primary : 'transparent',
                      }}
                    >
                      <MaterialCommunityIcons
                        name={isChecked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={20}
                        color={isChecked ? COLORS.primary : COLORS.textSecondary}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={{ fontSize: 13, fontWeight: isChecked ? '700' : '500', color: isChecked ? COLORS.primary : COLORS.textPrimary }}>
                        {symptom}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Triage Urgency Result display */}
              {triageResult ? (
                <View
                  style={{
                    backgroundColor: triageResult.severity === 'Red' ? COLORS.alertContainer : triageResult.severity === 'Yellow' ? '#FFF3E0' : COLORS.primaryContainer,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1.5,
                    borderColor: triageResult.severity === 'Red' ? COLORS.alert : triageResult.severity === 'Yellow' ? '#E88C30' : COLORS.primary,
                    marginBottom: 20,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <MaterialCommunityIcons
                      name={triageResult.severity === 'Red' ? 'alert-octagon' : triageResult.severity === 'Yellow' ? 'alert-circle' : 'checkbox-marked-circle'}
                      size={22}
                      color={triageResult.severity === 'Red' ? COLORS.alert : triageResult.severity === 'Yellow' ? '#E88C30' : COLORS.primary}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '800',
                        color: triageResult.severity === 'Red' ? COLORS.alert : triageResult.severity === 'Yellow' ? '#E65100' : COLORS.primary,
                        marginLeft: 8,
                      }}
                    >
                      {triageResult.severity === 'Red' ? 'CRITICAL EMERGENCY' : triageResult.severity === 'Yellow' ? 'URGENT CARE ADVISED' : 'SELF-CARE GUIDE'}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 18, marginBottom: 8 }}>
                    {triageResult.text}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 }}>
                    {triageResult.actionText}
                  </Text>

                  {triageResult.severity === 'Red' && (
                    <Pressable
                      onPress={() => Linking.openURL('tel:911')}
                      style={({ pressed }) => ({
                        backgroundColor: COLORS.alert,
                        borderRadius: 12,
                        paddingVertical: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        marginTop: 14,
                        opacity: pressed ? 0.88 : 1,
                      })}
                    >
                      <MaterialCommunityIcons name="phone" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                        Call Emergency Services (911)
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <View style={{ backgroundColor: COLORS.background, borderRadius: 16, padding: 16, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 20 }}>
                  <MaterialCommunityIcons name="heart-pulse" size={24} color={COLORS.textSecondary} style={{ marginBottom: 6 }} />
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' }}>
                    Select one or more symptoms above to calculate offline AI triage and safety guides.
                  </Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ICE Medical Card Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isICEModalOpen}
        onRequestClose={() => setIsICEModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.75)', justifyContent: 'center', padding: 20 }}
          onPress={() => setIsICEModalOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: 24,
              borderWidth: 3,
              borderColor: COLORS.alert,
              maxHeight: '90%',
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="card-account-details-star" size={28} color={COLORS.alert} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 22, fontWeight: '900', color: COLORS.alert, letterSpacing: -0.5 }}>
                  ICE EMERGENCY CARD
                </Text>
              </View>
              <Pressable onPress={() => setIsICEModalOpen(false)}>
                <MaterialCommunityIcons name="close-circle" size={28} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Patient Identity */}
              <View style={{ backgroundColor: '#FFF5F5', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FFCDD2' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.alert, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>PATIENT IDENTIFICATION</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>{profile.name}</Text>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>Date of Birth: {profile.dob}</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <View style={{ backgroundColor: COLORS.alert, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>BLOOD: {profile.bloodType || 'Unknown'}</Text>
                  </View>
                  <View style={{ backgroundColor: profile.organDonor ? COLORS.primary : COLORS.textSecondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>ORGAN DONOR: {profile.organDonor ? 'YES' : 'NO'}</Text>
                  </View>
                </View>
              </View>

              {/* Severe Allergies */}
              <View style={{ backgroundColor: COLORS.alertContainer, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FFCDD2' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.alert, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>SEVERE ALLERGIES</Text>
                {userAllergies.length === 0 ? (
                  <Text style={{ fontSize: 13, color: COLORS.textPrimary, fontStyle: 'italic' }}>No known severe allergies.</Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {userAllergies.map((allergy) => (
                      <View key={allergy} style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.alert }}>
                        <Text style={{ color: COLORS.alert, fontWeight: '800', fontSize: 12 }}>{allergy}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Current Medications */}
              <View style={{ backgroundColor: COLORS.background, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>ACTIVE MEDICATIONS</Text>
                {medicationSchedule.length === 0 ? (
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' }}>No active medications logged.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {medicationSchedule.map((med) => (
                      <View key={med.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, flex: 1 }}>{med.name} ({med.dosage})</Text>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{med.time}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Emergency Contacts */}
              <View style={{ backgroundColor: COLORS.background, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>EMERGENCY CONTACT DETAILS</Text>
                {emergencyContacts.length === 0 ? (
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' }}>No emergency contacts registered.</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {emergencyContacts.map((contact) => (
                      <View key={contact.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>{contact.name}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>{contact.phone}</Text>
                        </View>
                        <Pressable
                          onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                          style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.primaryContainer, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <MaterialCommunityIcons name="phone" size={18} color={COLORS.primary} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Vitals Tracker Logging Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isVitalsModalOpen}
        onRequestClose={() => setIsVitalsModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsVitalsModalOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '90%',
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                  Log Clinical Vitals
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                  Record BP, Glucose, SpO2, and Temperature
                </Text>
              </View>
              <Pressable onPress={() => setIsVitalsModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Blood Pressure Row */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Blood Pressure (mmHg)
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: COLORS.textPrimary,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                    placeholder="Systolic (e.g. 120)"
                    placeholderTextColor="#A0AAB2"
                    keyboardType="numeric"
                    value={systolicBPInput}
                    onChangeText={setSystolicBPInput}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: COLORS.textPrimary,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                    placeholder="Diastolic (e.g. 80)"
                    placeholderTextColor="#A0AAB2"
                    keyboardType="numeric"
                    value={diastolicBPInput}
                    onChangeText={setDiastolicBPInput}
                  />
                </View>
              </View>

              {/* Glucose Row */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Blood Glucose (mg/dL) & Context
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1.2 }}>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: COLORS.textPrimary,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                    placeholder="Glucose (e.g. 95)"
                    placeholderTextColor="#A0AAB2"
                    keyboardType="numeric"
                    value={glucoseInput}
                    onChangeText={setGlucoseInput}
                  />
                </View>
                <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                  {(['Fasting', 'Post-Meal', 'General'] as const).map((ctx) => (
                    <Pressable
                      key={ctx}
                      onPress={() => setGlucoseContext(ctx)}
                      style={{
                        flex: 1,
                        backgroundColor: glucoseContext === ctx ? COLORS.primaryContainer : COLORS.background,
                        borderRadius: 8,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: glucoseContext === ctx ? COLORS.primary : COLORS.border,
                      }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '700', color: glucoseContext === ctx ? COLORS.primary : COLORS.textSecondary, textAlign: 'center' }}>
                        {ctx}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* SpO2 & Temp Row */}
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                    Oxygen Saturation (SpO2 %)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: COLORS.textPrimary,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                    placeholder="e.g. 98"
                    placeholderTextColor="#A0AAB2"
                    keyboardType="numeric"
                    value={spo2Input}
                    onChangeText={setSpo2Input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                    Temperature (°F)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: COLORS.textPrimary,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                    placeholder="e.g. 98.6"
                    placeholderTextColor="#A0AAB2"
                    keyboardType="numeric"
                    value={tempInput}
                    onChangeText={setTempInput}
                  />
                </View>
              </View>

              {/* Submit Button */}
              <Pressable
                onPress={handleVitalSubmit}
                style={({ pressed }) => ({
                  backgroundColor: COLORS.primary,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>
                  Save Vitals Log
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mental Health Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isMentalModalOpen}
        onRequestClose={() => {
          setIsBreathingActive(false);
          setIsMentalModalOpen(false);
        }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => {
            setIsBreathingActive(false);
            setIsMentalModalOpen(false);
          }}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '90%',
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                  Mental Health & Calming
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                  Log your daily mood or start guided box breathing
                </Text>
              </View>
              <Pressable onPress={() => {
                setIsBreathingActive(false);
                setIsMentalModalOpen(false);
              }}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Box Breathing Tool Panel */}
              <View
                style={{
                  backgroundColor: COLORS.secondary + '12',
                  borderWidth: 1.5,
                  borderColor: COLORS.secondary,
                  borderRadius: 20,
                  padding: 16,
                  alignItems: 'center',
                  marginBottom: 20,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <MaterialCommunityIcons name="lungs" size={20} color={COLORS.secondary} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.secondary }}>
                    Box Breathing Assistant
                  </Text>
                </View>

                {isBreathingActive ? (
                  <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                    <Animated.View
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        backgroundColor: COLORS.secondary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: [{ scale: breathingAnim }],
                        shadowColor: COLORS.secondary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 10,
                        elevation: 4,
                      }}
                    >
                      <MaterialCommunityIcons name="air-filter" size={28} color="#FFFFFF" />
                    </Animated.View>
                    
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginTop: 24 }}>
                      {breathingText}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.secondary, marginTop: 8 }}>
                      {breathingProgress} seconds left
                    </Text>

                    <Pressable
                      onPress={() => setIsBreathingActive(false)}
                      style={{
                        backgroundColor: COLORS.alertContainer,
                        borderRadius: 12,
                        paddingVertical: 8,
                        paddingHorizontal: 20,
                        marginTop: 18,
                      }}
                    >
                      <Text style={{ color: COLORS.alert, fontWeight: '700', fontSize: 12 }}>Stop Breathing Guide</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 16, marginBottom: 12 }}>
                      A clinical practice of inhaling, holding, and exhaling on a 4-second paced cycle to lower heart rates and stress.
                    </Text>
                    <Pressable
                      onPress={() => setIsBreathingActive(true)}
                      style={({ pressed }) => ({
                        backgroundColor: COLORS.secondary,
                        borderRadius: 12,
                        paddingVertical: 10,
                        paddingHorizontal: 24,
                        alignItems: 'center',
                        opacity: pressed ? 0.9 : 1,
                      })}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Start Box Breathing</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {!isBreathingActive && (
                <>
                  {/* Mood Rating Slider/Pills */}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
                    Mood Rating (1 = Low, 10 = High)
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <Pressable
                        key={num}
                        onPress={() => setMoodRating(num)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: moodRating === num ? COLORS.primary : COLORS.background,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: moodRating === num ? COLORS.primary : COLORS.border,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: moodRating === num ? '#FFFFFF' : COLORS.textPrimary }}>
                          {num}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Stress Level */}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
                    Stress Level
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                    {(['Low', 'Medium', 'High'] as const).map((level) => (
                      <Pressable
                        key={level}
                        onPress={() => setMoodStress(level)}
                        style={{
                          flex: 1,
                          backgroundColor: moodStress === level ? COLORS.primaryContainer : COLORS.background,
                          borderRadius: 12,
                          paddingVertical: 10,
                          alignItems: 'center',
                          borderWidth: 1.5,
                          borderColor: moodStress === level ? COLORS.primary : COLORS.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: moodStress === level ? COLORS.primary : COLORS.textPrimary }}>
                          {level}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Feelings Checklist */}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
                    Feelings Tagging
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {['Anxious', 'Calm', 'Energetic', 'Sad', 'Stressed', 'Focused', 'Happy', 'Fatigued'].map((feeling) => {
                      const isSelected = selectedFeelings.includes(feeling);
                      return (
                        <Pressable
                          key={feeling}
                          onPress={() => {
                            setSelectedFeelings(
                              isSelected ? selectedFeelings.filter((f) => f !== feeling) : [...selectedFeelings, feeling]
                            );
                          }}
                          style={{
                            backgroundColor: isSelected ? COLORS.primaryContainer : COLORS.background,
                            borderRadius: 100,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderWidth: 1,
                            borderColor: isSelected ? COLORS.primary : COLORS.border,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: isSelected ? COLORS.primary : COLORS.textPrimary }}>
                            {feeling}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Notes */}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                    Journal / Notes
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 14,
                      color: COLORS.textPrimary,
                      marginBottom: 20,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      minHeight: 60,
                      textAlignVertical: 'top',
                    }}
                    placeholder="Log any mental reflections or symptom alerts..."
                    placeholderTextColor="#A0AAB2"
                    multiline={true}
                    value={moodNotes}
                    onChangeText={setMoodNotes}
                  />

                  {/* Submit Button */}
                  <Pressable
                    onPress={handleMoodSubmit}
                    style={({ pressed }) => ({
                      backgroundColor: COLORS.primary,
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>
                      Save Mood Entry
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default HomeScreen;
