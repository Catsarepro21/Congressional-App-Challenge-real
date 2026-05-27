/**
 * @file App.tsx
 * @description Root application entry point for SafeScale Health.
 *
 * Provides:
 *   - SafeAreaProvider  (react-native-safe-area-context)
 *   - StatusBar configuration
 *   - Tab navigation state (activeIndex) wired to BottomNavBar + screen router
 */

import React, { useState, useCallback } from 'react';
import { View, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import { BottomNavBar } from './src/components/BottomNavBar';

const BACKGROUND = '#F3F5F7';

export default function App() {
  const [activeTab, setActiveTab] = useState<number>(0);

  const handleTabPress = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

  /** Render the active screen. ScanScreen and AnalyticsScreen will be wired in Phase 2. */
  const renderScreen = () => {
    switch (activeTab) {
      case 0:
        return <HomeScreen onNavigate={handleTabPress} />;
      case 1:
        // ScanScreen — placeholder until Phase 2
        return (
          <View
            style={{
              flex: 1,
              backgroundColor: BACKGROUND,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        );
      case 2:
        // AnalyticsScreen — placeholder until Phase 2
        return (
          <View
            style={{
              flex: 1,
              backgroundColor: BACKGROUND,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        );
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
