/**
 * @file src/screens/SettingsScreen.tsx
 * @description Consolidated settings panel for SafeScale Health.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useSafeScaleStore,
  selectUserAllergies,
  selectIsLocalAIOptedIn,
  selectIsTestMode,
} from '../store/useSafeScaleStore';

// ---------------------------------------------------------------------------
// Design Constants
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
};

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  // ── Store Selectors & Actions ──────────────────────────────────────────────
  const userAllergies = useSafeScaleStore(selectUserAllergies);
  const isLocalAIOptedIn = useSafeScaleStore(selectIsLocalAIOptedIn);
  const isTestMode = useSafeScaleStore(selectIsTestMode);

  const addAllergy = useSafeScaleStore((s) => s.addAllergy);
  const removeAllergy = useSafeScaleStore((s) => s.removeAllergy);
  const setLocalAIOptedIn = useSafeScaleStore((s) => s.setLocalAIOptedIn);
  const toggleTestMode = useSafeScaleStore((s) => s.toggleTestMode);
  const setUserAllergies = useSafeScaleStore((s) => s.setUserAllergies);
  const updateBiometrics = useSafeScaleStore((s) => s.updateBiometrics);

  // ── Local Form States ──────────────────────────────────────────────────────
  const [newAllergen, setNewAllergen] = useState('');

  // ── Switch Animations ──────────────────────────────────────────────────────
  const aiToggleAnim = useRef(new Animated.Value(isLocalAIOptedIn ? 20 : 0)).current;
  const testToggleAnim = useRef(new Animated.Value(isTestMode ? 20 : 0)).current;

  useEffect(() => {
    Animated.spring(aiToggleAnim, {
      toValue: isLocalAIOptedIn ? 20 : 0,
      tension: 280,
      friction: 20,
      useNativeDriver: true,
    }).start();
  }, [isLocalAIOptedIn, aiToggleAnim]);

  useEffect(() => {
    Animated.spring(testToggleAnim, {
      toValue: isTestMode ? 20 : 0,
      tension: 280,
      friction: 20,
      useNativeDriver: true,
    }).start();
  }, [isTestMode, testToggleAnim]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAddAllergen = useCallback(() => {
    if (newAllergen.trim() === '') {
      Alert.alert('Required Field', 'Please enter an allergen name.');
      return;
    }
    addAllergy(newAllergen.trim());
    setNewAllergen('');
  }, [newAllergen, addAllergy]);

  const handleClearAllData = useCallback(() => {
    Alert.alert(
      'Reset All Data?',
      'This will clear your allergen profile, scheduled medications, and synced biometric telemetry back to zero. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset App',
          style: 'destructive',
          onPress: () => {
            // Reset state slices
            setUserAllergies([]);
            updateBiometrics({
              heartRate: 0,
              restingHeartRate: 0,
              sleepMinutes: 0,
              sleepConsistency: 0,
              steps: 0,
              activeCalories: 0,
              dailyStabilityScore: 0,
              historicalRHR: [],
            });
            // If currently in test mode, toggle it off to clear scheduled meds
            if (isTestMode) {
              toggleTestMode();
            }
            Alert.alert('System Reset', 'All user profile records and daily telemetry have been cleared.');
          },
        },
      ]
    );
  }, [isTestMode, toggleTestMode, setUserAllergies, updateBiometrics]);

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
            Settings
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Configure allergen profile parameters and system properties.
          </Text>
        </View>

        {/* ── Section: Allergen Profile ─────────────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            marginBottom: 20,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <MaterialCommunityIcons name="shield-alert-outline" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Allergen Profile
            </Text>
          </View>
          
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 16 }}>
            Ingredients matching these tokens will trigger immediate alerts during label scans.
          </Text>

          {/* Allergen chips list */}
          {userAllergies.length === 0 ? (
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic', marginBottom: 16 }}>
              No allergens registered. Use the input below to add one.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {userAllergies.map((allergen) => (
                <Pressable
                  key={allergen}
                  onPress={() => removeAllergy(allergen)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: COLORS.alertContainer,
                    borderRadius: 100,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ color: COLORS.alert, fontWeight: '700', fontSize: 12, marginRight: 6 }}>
                    {allergen}
                  </Text>
                  <MaterialCommunityIcons name="close-circle" size={14} color={COLORS.alert} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Add Allergen Form */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: COLORS.background,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: COLORS.textPrimary,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
              placeholder="e.g. Peanut, Milk, Soy"
              placeholderTextColor="#A0AAB2"
              value={newAllergen}
              onChangeText={setNewAllergen}
            />
            <Pressable
              onPress={handleAddAllergen}
              style={({ pressed }) => ({
                backgroundColor: COLORS.primary,
                borderRadius: 12,
                paddingHorizontal: 20,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                Add
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Section: System Toggles ───────────────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            marginBottom: 20,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
            gap: 20,
          }}
        >
          {/* Local AI Preferences Switch */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <MaterialCommunityIcons name="robot-outline" size={18} color={COLORS.primary} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
                  Local AI Research
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 16 }}>
                Use an offline 2B parameter LLM to analyze chemical and nutritional safety metrics from labels. 100% private.
              </Text>
            </View>
            <Pressable
              onPress={() => setLocalAIOptedIn(!isLocalAIOptedIn)}
              style={{
                width: 48,
                height: 28,
                borderRadius: 14,
                backgroundColor: isLocalAIOptedIn ? COLORS.primary : '#E8EDF0',
                padding: 2,
                justifyContent: 'center',
              }}
            >
              <Animated.View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#FFFFFF',
                  transform: [{ translateX: aiToggleAnim }],
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 2,
                  elevation: 2,
                }}
              />
            </Pressable>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: COLORS.border }} />

          {/* Developer Test/Simulation Mode Switch */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <MaterialCommunityIcons name="xml" size={18} color={COLORS.primary} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
                  Developer Test Mode
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 16 }}>
                Seed simulated biometric histories and daily medication slots to test layouts offline without active trackers.
              </Text>
            </View>
            <Pressable
              onPress={toggleTestMode}
              style={{
                width: 48,
                height: 28,
                borderRadius: 14,
                backgroundColor: isTestMode ? COLORS.primary : '#E8EDF0',
                padding: 2,
                justifyContent: 'center',
              }}
            >
              <Animated.View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#FFFFFF',
                  transform: [{ translateX: testToggleAnim }],
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 2,
                  elevation: 2,
                }}
              />
            </Pressable>
          </View>
        </View>

        {/* ── Section: Storage Reset ───────────────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
            alignItems: 'center',
          }}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={24} color={COLORS.alert} style={{ marginBottom: 8 }} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 }}>
            System Reset Options
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 16 }}>
            Purge active user accounts and reset state variables back to initial setup.
          </Text>
          <Pressable
            onPress={handleClearAllData}
            style={({ pressed }) => ({
              backgroundColor: COLORS.alert,
              borderRadius: 14,
              paddingVertical: 12,
              paddingHorizontal: 24,
              width: '100%',
              alignItems: 'center',
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
              Clear App Data & Telemetry
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

export default SettingsScreen;
