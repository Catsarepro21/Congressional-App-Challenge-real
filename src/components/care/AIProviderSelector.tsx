/**
 * @file src/components/care/AIProviderSelector.tsx
 * @description Reusable component for selecting the AI Intelligence provider.
 *
 * Renders three radio-style cards (On-Device, Cloud, Opt-Out) using the
 * existing design system tokens from UI.tsx. Automatically detects hardware
 * capabilities and disables the on-device option on unsupported devices with
 * a clear explanation.
 *
 * Used in both OnboardingScreen (step 2) and SettingsScreen.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { C, Icon, Heading, s as shared, type IconName } from './UI';
import { AIIntelligenceService, getDeviceCapabilities, refreshDeviceCapabilities } from '../../services/AIIntelligenceService';
import type { AIIntelligenceProvider, AIDeviceCapabilities } from '../../types';

// ---------------------------------------------------------------------------
// Option definition
// ---------------------------------------------------------------------------

interface ProviderOption {
  key: AIIntelligenceProvider;
  icon: IconName;
  badge: string;
}

const OPTIONS: ProviderOption[] = [
  { key: 'on-device', icon: 'chip', badge: '' },
  { key: 'cloud', icon: 'cloud-outline', badge: 'All devices' },
  { key: 'opt-out', icon: 'shield-lock-outline', badge: 'Maximum privacy' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AIProviderSelector({
  value,
  onChange,
  showHeading = true,
}: {
  value: AIIntelligenceProvider;
  onChange: (next: AIIntelligenceProvider) => void;
  showHeading?: boolean;
}) {
  const [caps, setCaps] = useState<AIDeviceCapabilities>(getDeviceCapabilities);
  useEffect(() => {let active = true; void refreshDeviceCapabilities().then(value => {if (active) setCaps(value);}); return () => {active = false;};}, []);

  // Compute the on-device badge dynamically
  const onDeviceBadge = caps.isOnDeviceSupported
    ? 'Recommended for your device'
    : 'Not available on this device';

  return (
    <View style={{ gap: 14 }}>
      {showHeading ? (
        <Heading
          title="Intelligence & privacy"
          detail="Choose how SafeScale processes ingredient scans and health insights. You can change this any time in Settings."
        />
      ) : null}

      {OPTIONS.map((opt) => {
        const isOnDevice = opt.key === 'on-device';
        const disabled = isOnDevice && !caps.isOnDeviceSupported;
        const selected = value === opt.key;
        const badge = isOnDevice ? onDeviceBadge : opt.badge;

        return (
          <Pressable
            key={opt.key}
            accessibilityRole="radio"
            accessibilityLabel={AIIntelligenceService.providerLabel(opt.key)}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(opt.key)}
            style={({ pressed }) => [
              styles.optionCard,
              selected && styles.optionSelected,
              disabled && styles.optionDisabled,
              { opacity: pressed && !disabled ? 0.7 : 1 },
            ]}
          >
            <View style={styles.optionHeader}>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Icon
                name={opt.icon}
                color={disabled ? C.muted : selected ? C.green : C.ink}
                size={21}
              />
              <Text
                style={[
                  shared.label,
                  { flexShrink: 1 },
                  disabled && { color: C.muted },
                ]}
                numberOfLines={2}
              >
                {AIIntelligenceService.providerLabel(opt.key)}
              </Text>
            </View>
            {badge ? (
              <View
                style={[
                  styles.badge,
                  { alignSelf: 'flex-start' },
                  selected && { backgroundColor: C.green },
                  disabled && { backgroundColor: C.line },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    selected && { color: C.white },
                    disabled && { color: C.muted },
                  ]}
                >
                  {badge}
                </Text>
              </View>
            ) : null}

            <Text style={[shared.body, disabled && { color: C.muted }]}>
              {AIIntelligenceService.providerDescription(opt.key)}
            </Text>

            {/* Show unsupported reason for on-device when disabled */}
            {isOnDevice && disabled && caps.unsupportedReason ? (
              <Text style={styles.unsupportedNote}>
                {caps.unsupportedReason}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      <Text style={shared.body}>
        {caps.isOnDeviceSupported
          ? `Photo recognition: ${caps.isVisionSupported ? 'available' : 'unavailable'}. Text generation: ${caps.isTextGenerationSupported ? 'available' : 'unavailable'}.`
          : 'Availability is checked against the installed native app. Offline ingredient checks do not require an AI model.'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  optionCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: C.line,
    gap: 10,
  },
  optionSelected: {
    borderColor: C.green,
    backgroundColor: C.pale,
  },
  optionDisabled: {
    opacity: 0.55,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: C.green,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.green,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: C.pale,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.green,
    letterSpacing: 0.3,
  },
  unsupportedNote: {
    fontSize: 12,
    lineHeight: 18,
    color: C.amber,
    fontStyle: 'italic',
  },
});
