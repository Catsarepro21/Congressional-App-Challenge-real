/**
 * @file src/screens/OnboardingScreen.tsx
 * @description Multi-step first-launch onboarding flow for SafeScale Health.
 *
 * Steps:
 *   0 — Welcome (choose: Manual setup OR import from health app)
 *   1 — Name & Date of Birth
 *   2 — Physical Stats (height, weight, blood type)
 *   3 — Allergen Selection
 *   4 — All Done
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import type { UserProfile } from '../types';
import { GoogleFitService } from '../services/GoogleFitService';
import { GoogleHealthService } from '../services/GoogleHealthService';

// Lazy-load HealthKit only on iOS
let AppleHealthKit: any = null;
if (Platform.OS === 'ios') {
  try {
    const healthModule = require('react-native-health');
    AppleHealthKit = healthModule.default ?? healthModule;
    if (typeof AppleHealthKit?.initHealthKit !== 'function') AppleHealthKit = null;
  } catch (e) {
    console.warn('[OnboardingScreen] Failed to load react-native-health:', e);
  }
}

const { width: SCREEN_W } = Dimensions.get('window');

const COLORS = {
  primary: '#227C54',
  primaryLight: '#D5F1E2',
  primaryMid: '#3BAD72',
  background: '#F3F5F7',
  surface: '#FFFFFF',
  text: '#1A2129',
  textSub: '#6B7A87',
  border: 'hsl(220,20%,88%)',
  googleBlue: '#4285F4',
  appleBlack: '#1A1A1A',
};

const TOTAL_STEPS = 5;

const BLOOD_TYPES = [
  'A-Positive', 'A-Negative', 'B-Positive', 'B-Negative',
  'AB-Positive', 'AB-Negative', 'O-Positive', 'O-Negative',
];

const COMMON_ALLERGENS = [
  { label: 'Peanut', icon: 'peanut' as const },
  { label: 'Tree Nuts', icon: 'food' as const },
  { label: 'Milk (Dairy)', icon: 'cup' as const },
  { label: 'Egg', icon: 'egg' as const },
  { label: 'Wheat / Gluten', icon: 'barley' as const },
  { label: 'Soy', icon: 'leaf' as const },
  { label: 'Fish', icon: 'fish' as const },
  { label: 'Shellfish', icon: 'fish-off' as const },
  { label: 'Sesame', icon: 'seed' as const },
  { label: 'Penicillin', icon: 'pill' as const },
];

interface Props {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const completeOnboarding = useSafeScaleStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [importingHealth, setImportingHealth] = useState(false);
  const [healthImportDone, setHealthImportDone] = useState(false);
  const [importSource, setImportSource] = useState<'apple' | 'google' | 'google-health' | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Step 1 - Identity
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');

  // Step 2 - Physical
  const [heightInput, setHeightInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [googleToken, setGoogleToken] = useState('');
  const [googleRefreshToken, setGoogleRefreshToken] = useState('');

  // Step 3 - Allergens
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [customAllergen, setCustomAllergen] = useState('');

  const goToStep = (next: number) => {
    const dir = next > step ? 1 : -1;
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: -dir * 30,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: dir * SCREEN_W,
        duration: 0,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
    setStep(next);
  };

  /**
   * Attempts to auto-fill profile fields from Apple HealthKit (iOS only).
   * HealthKit exposes: name (HKCharacteristicTypeIdentifierBiologicalSex is not name,
   * but DateOfBirth, BloodType, BiologicalSex, and from HKWorkout or HKBodyMass we get height/weight).
   */
  const handleImportFromAppleHealth = async () => {
    if (Platform.OS !== 'ios' || !AppleHealthKit) {
      Alert.alert(
        'Apple Health Not Available',
        'Apple Health is only available on iOS. Please fill in your details manually.',
      );
      return;
    }

    setImportingHealth(true);
    setImportSource(null);

    const permissions = {
      permissions: {
        read: [
          'DateOfBirth',
          'BloodType',
          'BiologicalSex',
          'Height',
          'Weight',
        ],
        write: [],
      },
    };

    AppleHealthKit.initHealthKit(permissions, (err: any) => {
      if (err) {
        setImportingHealth(false);
        Alert.alert(
          'Permission Required',
          'Please allow SafeScale Health to access Apple Health to import your profile data.',
        );
        return;
      }

      let filled = 0;

      // Date of Birth
      AppleHealthKit.getDateOfBirth({}, (_e: any, result: any) => {
        if (result?.value) {
          // result.value is an ISO date string
          const isoDate = result.value.split('T')[0];
          setDob(isoDate);
          filled++;
        }

        // Blood Type
        AppleHealthKit.getBloodType({}, (_e2: any, btResult: any) => {
          // btResult.value: "HKBloodTypeAPositive", "HKBloodTypeONegative", etc.
          if (btResult?.value && btResult.value !== 'HKBloodTypeNotSet') {
            const mapping: Record<string, string> = {
              HKBloodTypeAPositive: 'A-Positive',
              HKBloodTypeANegative: 'A-Negative',
              HKBloodTypeBPositive: 'B-Positive',
              HKBloodTypeBNegative: 'B-Negative',
              HKBloodTypeABPositive: 'AB-Positive',
              HKBloodTypeABNegative: 'AB-Negative',
              HKBloodTypeOPositive: 'O-Positive',
              HKBloodTypeONegative: 'O-Negative',
            };
            const mapped = mapping[btResult.value];
            if (mapped) {
              setBloodType(mapped);
              filled++;
            }
          }

          // Latest Height
          const now = new Date();
          const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          const heightOpts = { startDate: oneYearAgo.toISOString(), endDate: now.toISOString(), limit: 1 };
          AppleHealthKit.getHeightSamples(heightOpts, (_e3: any, heights: any[]) => {
            if (heights && heights.length > 0) {
              // HealthKit returns height in meters by default (value field)
              // or in the user's preferred units. Usually cm in react-native-health
              const h = heights[0].value;
              // If value < 3, it's in meters → convert to cm
              const cm = h < 3 ? Math.round(h * 100) : Math.round(h);
              if (cm > 50 && cm < 280) {
                setHeightInput(String(Math.round(cm / 2.54)));
                filled++;
              }
            }

            // Latest Weight
            const weightOpts = { startDate: oneYearAgo.toISOString(), endDate: now.toISOString(), limit: 1, unit: 'kg' };
            AppleHealthKit.getWeightSamples(weightOpts, (_e4: any, weights: any[]) => {
              if (weights && weights.length > 0) {
                const kg = Math.round(weights[0].value);
                if (kg > 10 && kg < 500) {
                  setWeightInput(String(Math.round(kg / 0.45359237)));
                  filled++;
                }
              }

              setImportingHealth(false);
              setHealthImportDone(true);
              setImportSource('apple');

              if (filled > 0) {
                Alert.alert(
                  `Imported ${filled} field${filled !== 1 ? 's' : ''} ✓`,
                  'Your Apple Health data has been imported. You can review and edit it on the next screens.',
                  [{ text: 'Continue', onPress: () => goToStep(1) }],
                );
              } else {
                Alert.alert(
                  'No Data Found',
                  'Apple Health doesn\'t have any profile data stored yet. Please fill it in manually.',
                  [{ text: 'OK', onPress: () => goToStep(1) }],
                );
              }
            });
          });
        });
      });
    });
  };

  const handleImportFromGoogleFit = async () => {
    setImportingHealth(true);
    setImportSource(null);

    try {
      let clientId = useSafeScaleStore.getState().profile.googleOAuthClientId || '';
      if (!clientId.trim() || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
        clientId = GoogleFitService.DEFAULT_CLIENT_ID;
      }

      if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
        Alert.alert(
          'Google Client ID Required',
          'A Google OAuth Client ID must be hardcoded in GoogleFitService.ts to use this feature.',
          [{ text: 'OK' }]
        );
        setImportingHealth(false);
        return;
      }

      const tokens = await GoogleFitService.authorize(clientId);
      if (!tokens) {
        setImportingHealth(false);
        return;
      }
      setGoogleToken(tokens.accessToken);
      if (tokens.refreshToken) {
        setGoogleRefreshToken(tokens.refreshToken);
      }

      const profileData = await GoogleFitService.fetchProfileData(tokens.accessToken);
      let filled = 0;

      if (profileData.name) {
        setName(profileData.name);
        filled++;
      }
      if (profileData.dob) {
        setDob(profileData.dob);
        filled++;
      }
      if (profileData.heightCm) {
        setHeightInput(String(Math.round(profileData.heightCm / 2.54)));
        filled++;
      }
      if (profileData.weightKg) {
        setWeightInput(String(Math.round(profileData.weightKg / 0.45359237)));
        filled++;
      }

      setImportingHealth(false);

      if (filled > 0) {
        setHealthImportDone(true);
        setImportSource('google');
        Alert.alert(
          `Imported ${filled} field${filled !== 1 ? 's' : ''} ✓`,
          'Your Google profile data has been imported. You can review and edit it on the next screens.',
          [{ text: 'Continue', onPress: () => goToStep(1) }],
        );
      } else {
        Alert.alert(
          'No Data Found',
          "We authorized with Google, but couldn't find any profile details or body metrics. Please fill them in manually.",
          [{ text: 'OK', onPress: () => goToStep(1) }],
        );
      }
    } catch (e: any) {
      setImportingHealth(false);
      console.warn('[GoogleFit] Onboarding import failed:', e);
      Alert.alert(
        'Import Failed',
        e.message === 'NO_CLIENT_ID'
          ? 'Google OAuth Client ID is missing. Please configure it.'
          : 'Could not connect to Google Fit. Please try manual onboarding.',
      );
    }
  };

  const handleImportFromGoogleHealth = async () => {
    setImportingHealth(true);
    setImportSource(null);

    try {
      let clientId = useSafeScaleStore.getState().profile.googleOAuthClientId || '';
      if (!clientId.trim() || clientId.includes('YOUR_')) {
        clientId = GoogleHealthService.DEFAULT_CLIENT_ID;
      }

      const tokens = await GoogleHealthService.authorize(clientId);
      if (!tokens) {
        setImportingHealth(false);
        return;
      }
      setGoogleToken(tokens.accessToken);
      if (tokens.refreshToken) {
        setGoogleRefreshToken(tokens.refreshToken);
      }

      const profileData = await GoogleHealthService.fetchProfileData(tokens.accessToken);
      let filled = 0;

      if (profileData.name) {
        setName(profileData.name);
        filled++;
      }
      if (profileData.dob) {
        setDob(profileData.dob);
        filled++;
      }
      if (profileData.heightCm) {
        setHeightInput(String(Math.round(profileData.heightCm / 2.54)));
        filled++;
      }
      if (profileData.weightKg) {
        setWeightInput(String(Math.round(profileData.weightKg / 0.45359237)));
        filled++;
      }

      setImportingHealth(false);

      if (filled > 0) {
        setHealthImportDone(true);
        setImportSource('google-health');
        Alert.alert(
          `Imported ${filled} field${filled !== 1 ? 's' : ''} ✓`,
          'Your Google Health profile data has been imported. You can review and edit it on the next screens.',
          [{ text: 'Continue', onPress: () => goToStep(1) }],
        );
      } else {
        Alert.alert(
          'No Data Found',
          "We authorized with Google Health, but couldn't find any profile details or body metrics. Please fill them in manually.",
          [{ text: 'OK', onPress: () => goToStep(1) }],
        );
      }
    } catch (e: any) {
      setImportingHealth(false);
      console.warn('[GoogleHealth] Onboarding import failed:', e);
      Alert.alert(
        'Import Failed',
        'Could not connect to Google Health. Please try manual onboarding.',
      );
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert('Name Required', 'Please enter your name to continue.');
        return;
      }
      if (dob.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) {
        Alert.alert('Invalid Date', 'Please enter your date of birth in YYYY-MM-DD format, e.g. 2001-05-14');
        return;
      }
    }
    if (step < TOTAL_STEPS - 1) {
      goToStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) goToStep(step - 1);
  };

  const toggleAllergen = (label: string) => {
    setSelectedAllergens((prev) =>
      prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label],
    );
  };

  const addCustomAllergen = () => {
    const trimmed = customAllergen.trim();
    if (!trimmed) return;
    if (!selectedAllergens.includes(trimmed)) {
      setSelectedAllergens((prev) => [...prev, trimmed]);
    }
    setCustomAllergen('');
  };

  const handleFinish = () => {
    const heightVal = parseFloat(heightInput);
    const weightVal = parseFloat(weightInput);
    const profile: UserProfile = {
      name: name.trim() || 'User',
      dob: dob.trim() || '2000-01-01',
      bloodType: bloodType || 'Unknown',
      height: isNaN(heightVal) ? 170 : Math.round(heightVal * 2.54 * 10) / 10,
      weight: isNaN(weightVal) ? 70 : Math.round(weightVal * 0.45359237 * 10) / 10,
      organDonor: false,
      unitPreference: 'imperial',
      useGeminiFoodVision: true,
      geminiApiKey: '',
      useGeminiWeeklyReport: true,
      useCloudAIDocuments: true,
      googleAccessToken: googleToken || undefined,
      googleRefreshToken: googleRefreshToken || undefined,
    };
    completeOnboarding(profile, selectedAllergens);
    onDone();
  };

  // ── Progress dots ──────────────────────────────────────────────────────────
  const renderDots = () => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === step ? 20 : 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: i <= step ? COLORS.primary : COLORS.border,
          }}
        />
      ))}
    </View>
  );

  // ── Step 0: Welcome + Import choice ───────────────────────────────────────
  const renderStep0 = () => (
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }} showsVerticalScrollIndicator={false}>
      <View style={{
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: COLORS.primaryLight,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
      }}>
        <MaterialCommunityIcons name="heart-pulse" size={52} color={COLORS.primary} />
      </View>
      <Text style={{ fontSize: 28, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 12 }}>
        Welcome to{'\n'}SafeScale Health
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.textSub, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
        Set up your personal profile so the app works perfectly for you. You can import data from your health app or enter it manually.
      </Text>

      {/* Auto-import from Apple Health (iOS) */}
      {Platform.OS === 'ios' && (
        <Pressable
          onPress={handleImportFromAppleHealth}
          disabled={importingHealth}
          style={({ pressed }) => ({
            width: '100%',
            backgroundColor: importingHealth && importSource === 'apple' ? '#E8EDF0' : COLORS.appleBlack,
            borderRadius: 18,
            paddingVertical: 16,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 14,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {importingHealth && importSource === 'apple' ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <MaterialCommunityIcons name="apple" size={22} color="#FFFFFF" />
          )}
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
            {importingHealth && importSource === 'apple' ? 'Importing from Apple Health…' : 'Import from Apple Health'}
          </Text>
        </Pressable>
      )}

      {/* Auto-import from Google Fit */}
      <Pressable
        onPress={handleImportFromGoogleFit}
        disabled={importingHealth}
        style={({ pressed }) => ({
          width: '100%',
          backgroundColor: importingHealth && importSource === 'google' ? '#E8EDF0' : COLORS.googleBlue,
          borderRadius: 18,
          paddingVertical: 16,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 14,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {importingHealth && importSource === 'google' ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <MaterialCommunityIcons name="google" size={20} color="#FFFFFF" />
        )}
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
          {importingHealth && importSource === 'google' ? 'Importing from Google…' : 'Import from Google Fit'}
        </Text>
      </Pressable>

      {/* Auto-import from Google Health */}
      <Pressable
        onPress={handleImportFromGoogleHealth}
        disabled={importingHealth}
        style={({ pressed }) => ({
          width: '100%',
          backgroundColor: importingHealth && importSource === 'google-health' ? '#E8EDF0' : COLORS.primary,
          borderRadius: 18,
          paddingVertical: 16,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 14,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {importingHealth && importSource === 'google-health' ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <MaterialCommunityIcons name="heart-pulse" size={20} color="#FFFFFF" />
        )}
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
          {importingHealth && importSource === 'google-health' ? 'Importing from Google Health…' : 'Import from Google Health'}
        </Text>
      </Pressable>

      {/* Manual setup */}
      <Pressable
        onPress={() => goToStep(1)}
        style={({ pressed }) => ({
          width: '100%',
          backgroundColor: COLORS.surface,
          borderRadius: 18,
          paddingVertical: 16,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          borderWidth: 1.5,
          borderColor: COLORS.border,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <MaterialCommunityIcons name="pencil-outline" size={20} color={COLORS.primary} />
        <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 16 }}>
          Enter Manually
        </Text>
      </Pressable>

      <Text style={{ fontSize: 11, color: COLORS.textSub, marginTop: 14, textAlign: 'center', lineHeight: 16 }}>
        Supports Apple Watch, Samsung Health, Fitbit, CMF Watch, and Nothing X integrations via system health sync.
      </Text>
      <Text style={{ fontSize: 11, color: COLORS.textSub, marginTop: 6, textAlign: 'center', lineHeight: 16 }}>
        You can always update your profile from the Settings tab at any time.
      </Text>
    </ScrollView>
  );

  // ── Step 1: Identity ───────────────────────────────────────────────────────
  const renderStep1 = () => (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <MaterialCommunityIcons name="account-circle" size={40} color={COLORS.primary} style={{ marginBottom: 12 }} />
      <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 6 }}>Your Identity</Text>
      <Text style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 28, lineHeight: 19 }}>
        Used for your emergency ICE card and personalized health reports.
        {healthImportDone ? `\n\n✓ Some fields were pre-filled from ${importSource === 'apple' ? 'Apple Health' : importSource === 'google-health' ? 'Google Health' : 'Google Fit'}.` : ''}
      </Text>

      <Text style={labelStyle}>Full Name</Text>
      <TextInput
        style={[inputStyle, name && healthImportDone ? { borderColor: COLORS.primary, borderWidth: 2 } : {}]}
        placeholder="e.g. Alex Johnson"
        placeholderTextColor="#A0AAB2"
        value={name}
        onChangeText={setName}
        returnKeyType="next"
        autoCapitalize="words"
      />
      {healthImportDone && name ? (
        <Text style={{ fontSize: 11, color: COLORS.primary, marginTop: 4, fontWeight: '600', marginBottom: 12 }}>✓ Imported name</Text>
      ) : null}

      <Text style={[labelStyle, { marginTop: 18 }]}>Date of Birth</Text>
      <TextInput
        style={[inputStyle, dob && healthImportDone ? { borderColor: COLORS.primary, borderWidth: 2 } : {}]}
        placeholder="YYYY-MM-DD  (e.g. 2001-05-14)"
        placeholderTextColor="#A0AAB2"
        value={dob}
        onChangeText={setDob}
        keyboardType="number-pad"
        maxLength={10}
      />
      {healthImportDone && dob ? (
        <Text style={{ fontSize: 11, color: COLORS.primary, marginTop: 4, fontWeight: '600' }}>✓ Imported from {importSource === 'apple' ? 'Apple Health' : 'Google Fit'}</Text>
      ) : (
        <Text style={{ fontSize: 11, color: COLORS.textSub, marginTop: 4 }}>
          Used to generate age-appropriate vaccine milestones.
        </Text>
      )}
    </ScrollView>
  );

  // ── Step 2: Physical Stats ─────────────────────────────────────────────────
  const renderStep2 = () => (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <MaterialCommunityIcons name="human-male-height" size={40} color={COLORS.primary} style={{ marginBottom: 12 }} />
      <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 6 }}>Physical Stats</Text>
      <Text style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 28 }}>
        Used for calorie goals, BMI tracking, and your emergency medical card.
      </Text>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Height (inches)</Text>
          <TextInput
            style={[inputStyle, heightInput && healthImportDone ? { borderColor: COLORS.primary, borderWidth: 2 } : {}]}
            placeholder="e.g. 69"
            placeholderTextColor="#A0AAB2"
            value={heightInput}
            onChangeText={setHeightInput}
            keyboardType="decimal-pad"
          />
          {healthImportDone && heightInput ? (
            <Text style={{ fontSize: 10, color: COLORS.primary, marginTop: 3, fontWeight: '600' }}>
              ✓ From {importSource === 'apple' ? 'Apple Health' : importSource === 'google-health' ? 'Google Health' : 'Google Fit'}
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Weight (lbs)</Text>
          <TextInput
            style={[inputStyle, weightInput && healthImportDone ? { borderColor: COLORS.primary, borderWidth: 2 } : {}]}
            placeholder="e.g. 154"
            placeholderTextColor="#A0AAB2"
            value={weightInput}
            onChangeText={setWeightInput}
            keyboardType="decimal-pad"
          />
          {healthImportDone && weightInput ? (
            <Text style={{ fontSize: 10, color: COLORS.primary, marginTop: 3, fontWeight: '600' }}>
              ✓ From {importSource === 'apple' ? 'Apple Health' : importSource === 'google-health' ? 'Google Health' : 'Google Fit'}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={[labelStyle, { marginTop: 20 }]}>Blood Type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {BLOOD_TYPES.map((bt) => (
            <Pressable
              key={bt}
              onPress={() => setBloodType(bt)}
              style={{
                paddingHorizontal: 14, paddingVertical: 9,
                borderRadius: 20,
                backgroundColor: bloodType === bt ? COLORS.primary : COLORS.surface,
                borderWidth: bloodType === bt ? 0 : 1.5,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: bloodType === bt ? '#FFFFFF' : COLORS.text }}>
                {bt}
              </Text>
            </Pressable>
        ))}
      </View>
      {healthImportDone && bloodType && importSource === 'apple' ? (
        <Text style={{ fontSize: 11, color: COLORS.primary, marginTop: 8, fontWeight: '600' }}>✓ Blood type imported from Apple Health</Text>
      ) : null}
    </ScrollView>
  );

  // ── Step 3: Allergens ──────────────────────────────────────────────────────
  const renderStep3 = () => (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#E87C3E" style={{ marginBottom: 12 }} />
      <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 6 }}>Allergen Profile</Text>
      <Text style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 24, lineHeight: 19 }}>
        Select all allergens that apply. The Scan tab will automatically alert you when any food or product contains them.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {COMMON_ALLERGENS.map(({ label, icon }) => {
          const selected = selectedAllergens.includes(label);
          return (
            <Pressable
              key={label}
              onPress={() => toggleAllergen(label)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 9,
                borderRadius: 16,
                backgroundColor: selected ? '#FFF4ED' : COLORS.surface,
                borderWidth: 1.5,
                borderColor: selected ? '#E87C3E' : COLORS.border,
              }}
            >
              <MaterialCommunityIcons name={icon} size={15} color={selected ? '#E87C3E' : COLORS.textSub} />
              <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500', color: selected ? '#E87C3E' : COLORS.text }}>
                {label}
              </Text>
              {selected && <MaterialCommunityIcons name="check-circle" size={13} color="#E87C3E" />}
            </Pressable>
          );
        })}
      </View>

      <Text style={[labelStyle, { marginTop: 20 }]}>Add Custom Allergen</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <TextInput
          style={[inputStyle, { flex: 1 }]}
          placeholder="e.g. Latex, Peach..."
          placeholderTextColor="#A0AAB2"
          value={customAllergen}
          onChangeText={setCustomAllergen}
          onSubmitEditing={addCustomAllergen}
          returnKeyType="done"
          autoCapitalize="words"
        />
        <Pressable
          onPress={addCustomAllergen}
          style={{ backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Add</Text>
        </Pressable>
      </View>

      {selectedAllergens.filter(a => !COMMON_ALLERGENS.map(c => c.label).includes(a)).length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {selectedAllergens
            .filter(a => !COMMON_ALLERGENS.map(c => c.label).includes(a))
            .map((allergen) => (
              <Pressable key={allergen} onPress={() => toggleAllergen(allergen)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: '#FFF4ED', borderWidth: 1.5, borderColor: '#E87C3E' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#E87C3E' }}>{allergen}</Text>
                <MaterialCommunityIcons name="close" size={13} color="#E87C3E" />
              </Pressable>
            ))}
        </View>
      )}
      {selectedAllergens.length === 0 && (
        <Text style={{ fontSize: 12, color: COLORS.textSub, marginTop: 16, textAlign: 'center' }}>
          No allergens selected. You can always update this in Settings later.
        </Text>
      )}
    </ScrollView>
  );

  // ── Step 4: Done ───────────────────────────────────────────────────────────
  const renderStep4 = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
        <MaterialCommunityIcons name="check-decagram" size={56} color={COLORS.primary} />
      </View>
      <Text style={{ fontSize: 28, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 14 }}>
        You're all set{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}! 🎉
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.textSub, textAlign: 'center', lineHeight: 22, marginBottom: 16 }}>
        Your profile is ready. You can sync health data from the Home tab, and update all settings anytime.
      </Text>
      {selectedAllergens.length > 0 && (
        <View style={{ backgroundColor: '#FFF4ED', borderRadius: 14, padding: 14, width: '100%', marginTop: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#E87C3E', marginBottom: 6 }}>
            🛡 Allergen Alerts Active ({selectedAllergens.length})
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.text }}>{selectedAllergens.join(', ')}</Text>
        </View>
      )}
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderStep0();
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      default: return renderStep0();
    }
  };

  const stepTitles = ['', 'Your Identity', 'Physical Stats', 'Allergens', 'All Done'];
  const isWelcome = step === 0;
  const isDone = step === TOTAL_STEPS - 1;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 10,
        paddingHorizontal: 20,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
        {step > 0 && (
          <Pressable onPress={handleBack} hitSlop={12}
            style={{ padding: 8, borderRadius: 20, backgroundColor: COLORS.surface }}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text} />
          </Pressable>
        )}
        {step > 0 && (
          <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>{stepTitles[step]}</Text>
        )}
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: COLORS.textSub, fontWeight: '600' }}>{step + 1}/{TOTAL_STEPS}</Text>
      </View>

      {/* Main Content */}
      <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
        {renderCurrentStep()}
      </Animated.View>

      {/* Footer — hidden on welcome screen (buttons are inline there) */}
      {!isWelcome && (
        <View style={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 16,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          backgroundColor: COLORS.surface,
        }}>
          {renderDots()}
          <Pressable
            onPress={isDone ? handleFinish : handleNext}
            style={({ pressed }) => ({
              backgroundColor: COLORS.primary,
              borderRadius: 18,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
              {isDone ? 'Start Using SafeScale Health →' : 'Continue →'}
            </Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle = {
  fontSize: 12,
  fontWeight: '700' as const,
  color: COLORS.textSub,
  marginBottom: 6,
  letterSpacing: 0.4,
  textTransform: 'uppercase' as const,
};

const inputStyle = {
  backgroundColor: COLORS.surface,
  borderWidth: 1.5,
  borderColor: COLORS.border,
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontSize: 15,
  color: COLORS.text,
};
