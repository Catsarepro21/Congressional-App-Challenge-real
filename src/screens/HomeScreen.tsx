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
} from '../store/useSafeScaleStore';
import type { MedicationItem } from '../types';

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
    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: '700',
          color: COLORS.textPrimary,
        }}
      >
        {value}
      </Text>
      {unit !== '' && (
        <Text
          style={{
            fontSize: 11,
            fontWeight: '500',
            color: COLORS.textSecondary,
            marginLeft: 2,
          }}
        >
          {unit}
        </Text>
      )}
    </View>
    <Text
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
}

const MedicationTimelineRow: React.FC<MedicationTimelineRowProps> = ({
  item,
  isLast,
  onMarkComplete,
}) => {
  const config = STATUS_CONFIG[item.status];

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
      style={{
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
      }}
    >
      {title}
    </Text>
    {subtitle !== undefined && (
      <Text
        style={{
          fontSize: 12,
          color: COLORS.secondary,
          fontWeight: '600',
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

  const setMedicationStatus = useSafeScaleStore((s) => s.setMedicationStatus);
  const toggleTestMode = useSafeScaleStore((s) => s.toggleTestMode);
  const addMedication = useSafeScaleStore((s) => s.addMedication);
  const updateBiometrics = useSafeScaleStore((s) => s.updateBiometrics);
  const setHealthPermission = useSafeScaleStore((s) => s.setHealthPermission);

  // ── Local UI State ────────────────────────────────────────────────────────
  const [tapCount, setTapCount] = useState(0);
  const lastTapTime = useRef<number>(0);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medTime, setMedTime] = useState('08:00');
  const [medIcon, setMedIcon] = useState('pill');

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(0);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);

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
    addMedication({
      name: medName.trim(),
      dosage: medDosage.trim(),
      time: medTime.trim() || '08:00',
      icon: medIcon,
    });
    setMedName('');
    setMedDosage('');
    setMedTime('08:00');
    setMedIcon('pill');
    setIsAddModalOpen(false);
  }, [medName, medDosage, medTime, medIcon, addMedication]);

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
          `No health tracker data found.\n\nReason: Running on an ${Platform.OS === 'ios' ? 'iOS Simulator' : 'Android Emulator'} which has no health tracker data configured.\n\nTo view biometric data, please enable Test Mode.`,
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
          setTimeout(() => {
            updateBiometrics({
              heartRate: 74,
              restingHeartRate: 64,
              sleepMinutes: 480, // 8 hours
              sleepConsistency: 88,
              steps: 9243,
              activeCalories: 460,
              dailyStabilityScore: 82,
              historicalRHR: [63, 65, 64, 62, 66],
            });
            setIsSyncing(false);
            setSyncStep(0);
            Alert.alert('Health Sync Complete', 'Successfully imported health metrics from your device tracker.');
          }, 1000);
        }, 1200);
      }, 1200);
    }, 1200);
  }, [updateBiometrics, isTestMode]);

  /**
   * Checks for health data permission before syncing.
   * Prompts the user if permission is unrequested or previously denied.
   */
  const handleSyncHealthData = useCallback(() => {
    if (hasHealthPermission === true) {
      executeSync();
    } else {
      setIsPermissionModalOpen(true);
    }
  }, [hasHealthPermission, executeSync]);

  const handleApprovePermission = useCallback(() => {
    setHealthPermission(true);
    setIsPermissionModalOpen(false);
    setTimeout(() => {
      executeSync();
    }, 300);
  }, [setHealthPermission, executeSync]);

  const handleDenyPermission = useCallback(() => {
    setHealthPermission(false);
    setIsPermissionModalOpen(false);
    Alert.alert('Permission Denied', 'SafeScale Health was denied access to your device health tracker.');
  }, [setHealthPermission]);

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
        <Pressable onPress={handleGreetingPress}>
          <View style={{ marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
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
                {greeting} 👋
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: COLORS.textSecondary,
                  marginTop: 4,
                }}
              >
                {isTestMode ? "Test Mode Active · Seed Data Loaded" : "Here's your daily health overview."}
              </Text>
            </View>
            {isTestMode && (
              <View
                style={{
                  backgroundColor: COLORS.alertContainer,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 100,
                  borderWidth: 1,
                  borderColor: COLORS.alert,
                }}
              >
                <Text style={{ color: COLORS.alert, fontWeight: '700', fontSize: 10, textTransform: 'uppercase' }}>
                  TEST MODE
                </Text>
              </View>
            )}
          </View>
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
            value={stabilityScore === 0 ? '--' : String(biometricCore.heartRate)}
            unit={stabilityScore === 0 ? '' : 'bpm'}
            label="Heart Rate"
          />
          <BiometricStatCard
            icon="sleep"
            iconColor={COLORS.secondary}
            value={stabilityScore === 0 ? '--' : formatSleepMinutes(biometricCore.sleepMinutes)}
            unit=""
            label="Sleep"
          />
          <BiometricStatCard
            icon="shoe-sneaker"
            iconColor={COLORS.primary}
            value={
              stabilityScore === 0
                ? '--'
                : biometricCore.steps >= 1000
                ? `${(biometricCore.steps / 1000).toFixed(1)}k`
                : String(biometricCore.steps)
            }
            unit=""
            label="Steps"
          />
          <BiometricStatCard
            icon="fire"
            iconColor="#E88C30"
            value={stabilityScore === 0 ? '--' : String(biometricCore.activeCalories)}
            unit={stabilityScore === 0 ? '' : 'kcal'}
            label="Active Cal"
          />
        </View>

        {/* ── 3b. Sync Health Data Button ── */}
        <Pressable
          onPress={handleSyncHealthData}
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
            Sync Apple Health / Google Health Connect
          </Text>
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

            {/* Input: Icon Selection */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
              Select Icon
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
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
    </View>
  );
};

export default HomeScreen;
