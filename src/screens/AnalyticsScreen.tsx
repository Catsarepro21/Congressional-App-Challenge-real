import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line, Circle, Polyline, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeScaleStore, selectBiometricCore, selectIsTestMode } from '../store/useSafeScaleStore';

const COLORS = {
  primary: '#227C54',
  primaryContainer: '#D5F1E2',
  secondary: '#3B8B9B',
  background: '#F3F5F7',
  surface: '#FFFFFF',
  alert: '#EB4C42',
  textPrimary: '#1A2129',
  textSecondary: '#6B7A87',
  border: 'hsl(220, 20%, 90%)',
};

export const AnalyticsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const biometricCore = useSafeScaleStore(selectBiometricCore);
  const isTestMode = useSafeScaleStore(selectIsTestMode);

  // If stability score is 0, we assume no data is active/loaded
  const hasData = isTestMode && biometricCore.dailyStabilityScore > 0;

  // Render SVG Heart Rate History line chart
  const renderRhrChart = () => {
    const data = biometricCore.historicalRHR;
    if (data.length === 0) return null;

    const width = Dimensions.get('window').width - 72; // Padding adjustment
    const height = 120;
    const padding = 15;
    
    // Scale data coordinates
    const minVal = Math.min(...data) - 2;
    const maxVal = Math.max(...data) + 2;
    const range = maxVal - minVal;

    const getX = (index: number) => padding + (index * (width - 2 * padding)) / (data.length - 1);
    const getY = (val: number) => height - padding - ((val - minVal) * (height - 2 * padding)) / range;

    const points = data.map((val, idx) => `${getX(idx)},${getY(val)}`).join(' ');

    return (
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={COLORS.secondary} />
              <Stop offset="100%" stopColor={COLORS.primary} />
            </LinearGradient>
          </Defs>
          {/* Grid lines */}
          <Line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke={COLORS.border} strokeWidth={1} strokeDasharray="4 4" />
          
          {/* Path line */}
          <Polyline
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth={3}
            points={points}
          />
          
          {/* Markers */}
          {data.map((val, idx) => (
            <React.Fragment key={idx}>
              <Circle
                cx={getX(idx)}
                cy={getY(val)}
                r={4}
                fill={COLORS.surface}
                stroke={COLORS.secondary}
                strokeWidth={2}
              />
              <SvgText
                x={getX(idx)}
                y={getY(val) - 8}
                fontSize="9"
                fontWeight="700"
                fill={COLORS.textPrimary}
                textAnchor="middle"
              >
                {val}
              </SvgText>
            </React.Fragment>
          ))}
        </Svg>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: 24,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textPrimary }}>
            Health Analytics
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Visual progression of your daily stability and biometrics.
          </Text>
        </View>

        {!hasData ? (
          /* Empty State View */
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 24,
              paddingVertical: 64,
              paddingHorizontal: 24,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#1A2129',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 12,
              elevation: 3,
              marginTop: 40,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: COLORS.background,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={32} color={COLORS.textSecondary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' }}>
              No Telemetry Synced
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>
              No active health data was found. Tap the Greeting Header on the **Home Tab** 5 times to enable Test Mode and load seed biometrics.
            </Text>
          </View>
        ) : (
          /* Analytics Dashboard */
          <View style={{ gap: 16 }}>
            {/* Health Stability Overview */}
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 24,
                padding: 20,
                shadowColor: '#1A2129',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Current Stability
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ fontSize: 48, fontWeight: '800', color: COLORS.textPrimary }}>
                  {biometricCore.dailyStabilityScore}
                </Text>
                <Text style={{ fontSize: 16, color: COLORS.primary, fontWeight: '700', marginLeft: 8, marginTop: 16 }}>
                  / 100
                </Text>
                <View
                  style={{
                    backgroundColor: COLORS.primaryContainer,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 100,
                    marginLeft: 'auto',
                  }}
                >
                  <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '700' }}>
                    Excellent Index
                  </Text>
                </View>
              </View>
            </View>

            {/* Resting Heart Rate Chart */}
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 24,
                padding: 20,
                shadowColor: '#1A2129',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Resting HR History (BPM)
              </Text>
              {renderRhrChart()}
            </View>

            {/* Sleep Summary Card */}
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 24,
                padding: 20,
                shadowColor: '#1A2129',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Sleep Details
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                <View>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Sleep Quality</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginTop: 4 }}>
                    {biometricCore.sleepConsistency}%
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Last Sleep</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginTop: 4 }}>
                    {(biometricCore.sleepMinutes / 60).toFixed(1)} hrs
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Goal Met</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary, marginTop: 4 }}>
                    94%
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default AnalyticsScreen;
