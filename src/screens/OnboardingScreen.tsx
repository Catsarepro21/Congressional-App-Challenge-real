/**
 * @file src/screens/OnboardingScreen.tsx
 * @description Multi-step first-launch onboarding flow for SafeScale Health.
 *
 * Steps:
 *   0 — Welcome
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import type { UserProfile } from '../types';

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
  error: '#EB4C42',
  errorBg: '#FFEBEA',
  accent: '#2D8FD4',
};

const TOTAL_STEPS = 5;

const BLOOD_TYPES = ['A-Positive', 'A-Negative', 'B-Positive', 'B-Negative',
  'AB-Positive', 'AB-Negative', 'O-Positive', 'O-Negative'];

const COMMON_ALLERGENS = [
  { label: 'Peanut', icon: 'peanut' },
  { label: 'Tree Nuts', icon: 'food' },
  { label: 'Milk (Dairy)', icon: 'cup' },
  { label: 'Egg', icon: 'egg' },
  { label: 'Wheat / Gluten', icon: 'barley' },
  { label: 'Soy', icon: 'leaf' },
  { label: 'Fish', icon: 'fish' },
  { label: 'Shellfish', icon: 'fish-off' },
  { label: 'Sesame', icon: 'seed' },
  { label: 'Penicillin', icon: 'pill' },
];

interface Props {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const completeOnboarding = useSafeScaleStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Step 1 - Identity
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');

  // Step 2 - Physical
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [bloodType, setBloodType] = useState('');

  // Step 3 - Allergens
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [customAllergen, setCustomAllergen] = useState('');

  const goToStep = (next: number) => {
    const dir = next > step ? 1 : -1;
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: -dir * SCREEN_W * 0.15,
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
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
    setStep(next);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert('Name Required', 'Please enter your name to continue.');
        return;
      }
      if (!dob.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) {
        Alert.alert('Date Required', 'Please enter your date of birth in YYYY-MM-DD format.');
        return;
      }
    }
    if (step === 2) {
      if (!bloodType) {
        Alert.alert('Blood Type Required', 'Please select your blood type.');
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
      prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label]
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
    const profile: UserProfile = {
      name: name.trim() || 'User',
      dob: dob.trim() || '2000-01-01',
      bloodType: bloodType || 'O-Positive',
      height: parseFloat(heightCm) || 170,
      weight: parseFloat(weightKg) || 70,
      organDonor: false,
      unitPreference: 'metric',
      useGeminiFoodVision: false,
      geminiApiKey: '',
      useGeminiWeeklyReport: false,
    };
    completeOnboarding(profile, selectedAllergens);
    onDone();
  };

  // ── Progress dots ──────────────────────────────────────────────────────────
  const renderDots = () => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
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

  // ── Step renderers ─────────────────────────────────────────────────────────
  const renderStep0 = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: COLORS.primaryLight,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 28,
      }}>
        <MaterialCommunityIcons name="shield-heart" size={52} color={COLORS.primary} />
      </View>
      <Text style={{ fontSize: 30, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 14 }}>
        Welcome to{'\n'}SafeScale Health
      </Text>
      <Text style={{ fontSize: 15, color: COLORS.textSub, textAlign: 'center', lineHeight: 22 }}>
        Your personal health command center. Let's set up your profile so the app works perfectly for you — takes less than a minute!
      </Text>
    </View>
  );

  const renderStep1 = () => (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <MaterialCommunityIcons name="account-circle" size={40} color={COLORS.primary} style={{ marginBottom: 12 }} />
      <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 6 }}>
        Your Identity
      </Text>
      <Text style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 28 }}>
        This is used for your ICE emergency card and personalized health reports.
      </Text>

      <Text style={labelStyle}>Full Name</Text>
      <TextInput
        style={inputStyle}
        placeholder="e.g. Alex Johnson"
        placeholderTextColor="#A0AAB2"
        value={name}
        onChangeText={setName}
        returnKeyType="next"
        autoCapitalize="words"
      />

      <Text style={[labelStyle, { marginTop: 16 }]}>Date of Birth</Text>
      <TextInput
        style={inputStyle}
        placeholder="YYYY-MM-DD (e.g. 2001-05-14)"
        placeholderTextColor="#A0AAB2"
        value={dob}
        onChangeText={setDob}
        keyboardType="number-pad"
        maxLength={10}
      />
      <Text style={{ fontSize: 11, color: COLORS.textSub, marginTop: 4 }}>
        Used to generate age-appropriate vaccine milestones.
      </Text>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <MaterialCommunityIcons name="human-male-height" size={40} color={COLORS.primary} style={{ marginBottom: 12 }} />
      <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 6 }}>
        Physical Stats
      </Text>
      <Text style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 28 }}>
        Used for calorie goals, BMI tracking, and your emergency medical card.
      </Text>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Height (cm)</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. 175"
            placeholderTextColor="#A0AAB2"
            value={heightCm}
            onChangeText={setHeightCm}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Weight (kg)</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. 70"
            placeholderTextColor="#A0AAB2"
            value={weightKg}
            onChangeText={setWeightKg}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <Text style={[labelStyle, { marginTop: 20 }]}>Blood Type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {BLOOD_TYPES.map((bt) => (
          <Pressable
            key={bt}
            onPress={() => setBloodType(bt)}
            style={{
              paddingHorizontal: 14, paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: bloodType === bt ? COLORS.primary : COLORS.surface,
              borderWidth: 1.5,
              borderColor: bloodType === bt ? COLORS.primary : COLORS.border,
            }}
          >
            <Text style={{
              fontSize: 12, fontWeight: '700',
              color: bloodType === bt ? '#FFFFFF' : COLORS.text,
            }}>
              {bt}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );

  const renderStep3 = () => (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#E87C3E" style={{ marginBottom: 12 }} />
      <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 6 }}>
        Allergen Profile
      </Text>
      <Text style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 24 }}>
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
              <MaterialCommunityIcons
                name={icon as any}
                size={16}
                color={selected ? '#E87C3E' : COLORS.textSub}
              />
              <Text style={{
                fontSize: 13, fontWeight: selected ? '700' : '500',
                color: selected ? '#E87C3E' : COLORS.text,
              }}>
                {label}
              </Text>
              {selected && (
                <MaterialCommunityIcons name="check-circle" size={14} color="#E87C3E" />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Custom allergen input */}
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
          style={{
            backgroundColor: COLORS.primary, borderRadius: 14,
            paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Add</Text>
        </Pressable>
      </View>

      {/* Custom allergen chips */}
      {selectedAllergens.filter(a => !COMMON_ALLERGENS.map(c => c.label).includes(a)).length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {selectedAllergens
            .filter(a => !COMMON_ALLERGENS.map(c => c.label).includes(a))
            .map((allergen) => (
              <Pressable
                key={allergen}
                onPress={() => toggleAllergen(allergen)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 7,
                  borderRadius: 14,
                  backgroundColor: '#FFF4ED',
                  borderWidth: 1.5, borderColor: '#E87C3E',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#E87C3E' }}>{allergen}</Text>
                <MaterialCommunityIcons name="close" size={13} color="#E87C3E" />
              </Pressable>
            ))
          }
        </View>
      )}

      {selectedAllergens.length === 0 && (
        <Text style={{ fontSize: 12, color: COLORS.textSub, marginTop: 16, textAlign: 'center' }}>
          No allergens selected. You can always update this in Settings later.
        </Text>
      )}
    </ScrollView>
  );

  const renderStep4 = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: COLORS.primaryLight,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 28,
      }}>
        <MaterialCommunityIcons name="check-decagram" size={56} color={COLORS.primary} />
      </View>
      <Text style={{ fontSize: 28, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 14 }}>
        You're all set, {name.trim() || 'there'}! 🎉
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.textSub, textAlign: 'center', lineHeight: 22, marginBottom: 12 }}>
        Your profile is ready. You can always update your details, allergens, and settings from the Settings tab at any time.
      </Text>
      {selectedAllergens.length > 0 && (
        <View style={{
          backgroundColor: '#FFF4ED', borderRadius: 14,
          padding: 14, width: '100%', marginTop: 8,
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#E87C3E', marginBottom: 6 }}>
            🛡 Allergen Alerts Active ({selectedAllergens.length})
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.text }}>
            {selectedAllergens.join(', ')}
          </Text>
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
        {step > 0 && (
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            style={{ padding: 8, borderRadius: 20, backgroundColor: COLORS.surface }}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text} />
          </Pressable>
        )}
        {step > 0 && (
          <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>
            {stepTitles[step]}
          </Text>
        )}
        <View style={{ flex: 1 }} />
        {step === 0 && (
          <Pressable onPress={() => goToStep(4)}>
            <Text style={{ fontSize: 13, color: COLORS.textSub, fontWeight: '600' }}>Skip</Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 12, color: COLORS.textSub, fontWeight: '600' }}>
          {step + 1}/{TOTAL_STEPS}
        </Text>
      </View>

      {/* Main Content */}
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX: slideAnim }],
        }}
      >
        {renderCurrentStep()}
      </Animated.View>

      {/* Footer */}
      <View style={{
        paddingHorizontal: 24,
        paddingBottom: insets.bottom + 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        backgroundColor: COLORS.surface,
      }}>
        {renderDots()}
        <Pressable
          onPress={step === TOTAL_STEPS - 1 ? handleFinish : handleNext}
          style={({ pressed }) => ({
            backgroundColor: COLORS.primary,
            borderRadius: 18,
            paddingVertical: 16,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
            {step === TOTAL_STEPS - 1 ? 'Start Using SafeScale Health →' : 'Continue →'}
          </Text>
        </Pressable>
      </View>
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
