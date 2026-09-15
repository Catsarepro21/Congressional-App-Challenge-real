import {useWorkoutSensors} from './src/hooks/useWorkoutSensors';
import { SecureHealthStorage, useStorageStatus } from './src/services/SecureHealthStorage';
import { Button } from './src/components/care/UI';
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
import { View, Text, StatusBar, ActivityIndicator, AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import TimelineScreen from "./src/screens/TimelineScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ActivityScreen from "./src/screens/ActivityScreen";
import JournalScreen from "./src/screens/JournalScreen";
import RecordsScreen from "./src/screens/RecordsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import EmergencyScreen from "./src/screens/EmergencyScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HealthChatScreen from "./src/screens/HealthChatScreen";
import { BottomNavBar } from "./src/components/BottomNavBar";
import { useSafeScaleStore } from "./src/store/useSafeScaleStore";

import WebAlertHost from "./src/components/WebAlertHost";
import CloudPermissionModal from "./src/components/care/CloudPermissionModal";

const BACKGROUND = "#F5F6F1";

export default function App() {
  const isDeletingData = useSafeScaleStore(state => state.isDeletingData);
  const storageError = useStorageStatus(state => state.error);
  const readFailed = useStorageStatus(state => state.readFailed);
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
  useWorkoutSensors(hydrated && !isDeletingData);
  useEffect(() => {
    const unsubscribe = useSafeScaleStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    setHydrated(useSafeScaleStore.persist.hasHydrated());
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const refresh = () => {
      useSafeScaleStore.getState().ensureCurrentDay();
      useSafeScaleStore.getState().triggerAutoSync();
    };
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

  if (isDeletingData) return <SafeAreaProvider><View style={{flex:1,justifyContent:"center",padding:24}}><ActivityIndicator /><Text>Deleting local records…</Text></View></SafeAreaProvider>;

  if (storageError) return <SafeAreaProvider><View style={{flex:1, justifyContent:'center',padding:24,gap:20,backgroundColor:BACKGROUND}}>
    <Text accessibilityRole="alert">{storageError}</Text>
    <Button label="Retry storage" onPress={() => {if (readFailed) void useSafeScaleStore.persist.rehydrate(); else void SecureHealthStorage.retryWrite();}} />
  </View></SafeAreaProvider>;

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
      case 1:
        return <ActivityScreen />;
      case 2:
      case 6:
        return <JournalScreen />;
      case 3:
      case 7:
        return <RecordsScreen />;
      case 8:
        return <EmergencyScreen />;
      case 9:
        return <TimelineScreen />;
      case 4:
      case 5:
        return <ProfileScreen />;
      case 10:
        return <HealthChatScreen onBack={() => handleTabPress(0)} />;
      default:
        return <HomeScreen onNavigate={handleTabPress} />;
    }
  };

  return (
    <SafeAreaProvider>
      <WebAlertHost />
      <CloudPermissionModal />
      <StatusBar barStyle="dark-content" backgroundColor={BACKGROUND} />
      <View style={{ flex: 1, backgroundColor: BACKGROUND }}>
        {renderScreen()}
        <BottomNavBar activeIndex={activeTab} onTabPress={handleTabPress} />
      </View>
    </SafeAreaProvider>
  );
}
