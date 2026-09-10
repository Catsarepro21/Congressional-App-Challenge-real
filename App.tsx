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

import React, { useState, useCallback, useEffect } from "react";
import { View, StatusBar, ActivityIndicator, AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "./src/screens/HomeScreen";
import JournalScreen from "./src/screens/JournalScreen";
import RecordsScreen from "./src/screens/RecordsScreen";
import EmergencyScreen from "./src/screens/EmergencyScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import { BottomNavBar } from "./src/components/BottomNavBar";
import { useSafeScaleStore } from "./src/store/useSafeScaleStore";

import WebAlertHost from "./src/components/WebAlertHost";

const BACKGROUND = "#F5F6F1";

export default function App() {
  const hasCompletedOnboarding = useSafeScaleStore(
    (s) => s.hasCompletedOnboarding,
  );
  const [activeTab, setActiveTab] = useState<number>(0);

  const handleTabPress = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

  // AsyncStorage must finish restoring the profile before routing or writing it.
  const [hydrated, setHydrated] = useState(
    useSafeScaleStore.persist.hasHydrated(),
  );
  useEffect(() => {
    const unsubscribe = useSafeScaleStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    setHydrated(useSafeScaleStore.persist.hasHydrated());
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const refresh = () => useSafeScaleStore.getState().ensureCurrentDay();
    refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const timer = setInterval(refresh, 30000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, [hydrated]);
  if (!hydrated) {
    return (
      <SafeAreaProvider>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            backgroundColor: BACKGROUND,
          }}
        >
          <ActivityIndicator accessibilityLabel="Loading your profile" />
        </View>
      </SafeAreaProvider>
    );
  }

  // Show onboarding on first launch
  if (!hasCompletedOnboarding) {
    return (
      <SafeAreaProvider>
        <WebAlertHost />
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
      case 6:
        return <JournalScreen />;
      case 7:
        return <RecordsScreen />;
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
      <WebAlertHost />
      <StatusBar barStyle="dark-content" backgroundColor={BACKGROUND} />
      <View style={{ flex: 1, backgroundColor: BACKGROUND }}>
        {renderScreen()}
        <BottomNavBar activeIndex={activeTab} onTabPress={handleTabPress} />
      </View>
    </SafeAreaProvider>
  );
}
