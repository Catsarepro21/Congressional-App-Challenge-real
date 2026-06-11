/**
 * @file App.tsx
 * @description Root application entry point for SafeScale Health.
 *
 * Provides:
 *   - SafeAreaProvider  (react-native-safe-area-context)
 *   - StatusBar configuration
 *   - First-launch onboarding gate (checks hasCompletedOnboarding in the store)
 *   - Tab navigation state (activeIndex) wired to BottomNavBar + screen router
 */

import React, { useState, useCallback } from 'react';
import { View, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import MapScreen from './src/screens/MapScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import EmergencyScreen from './src/screens/EmergencyScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { BottomNavBar } from './src/components/BottomNavBar';
import { useSafeScaleStore } from './src/store/useSafeScaleStore';

const BACKGROUND = '#F3F5F7';

export default function App() {
  const hasCompletedOnboarding = useSafeScaleStore((s) => s.hasCompletedOnboarding);
  const [activeTab, setActiveTab] = useState<number>(0);

  const handleTabPress = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

  // Show onboarding on first launch
  if (!hasCompletedOnboarding) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={BACKGROUND} />
        <OnboardingScreen onDone={() => {}} />
      </SafeAreaProvider>
    );
  }

  /** Render the active screen. */
  const renderScreen = () => {
    switch (activeTab) {
      case 0:
        return <HomeScreen onNavigate={handleTabPress} />;
      case 1:
        return <ScanScreen onNavigate={handleTabPress} />;
      case 2:
        return <MapScreen />;
      case 3:
        return <AnalyticsScreen />;
      case 4:
        return <EmergencyScreen />;
      case 5:
        return <SettingsScreen />;
      default:
        return <HomeScreen onNavigate={handleTabPress} />;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={BACKGROUND} />
      <View style={{ flex: 1, backgroundColor: BACKGROUND }}>
        {renderScreen()}
        <BottomNavBar
          activeIndex={activeTab}
          onTabPress={handleTabPress}
        />
      </View>
    </SafeAreaProvider>
  );
}
