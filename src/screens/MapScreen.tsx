/**
 * @file src/screens/MapScreen.tsx
 * @description Screen for regional pollen and air quality mapping.
 * Connects to the free public Open-Meteo Air Quality API to query real-time data.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
  warning: '#F5A623',
  warningContainer: '#FFF5E6',
};

interface CityStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  x: number; // coordinate for representation on custom SVG map
  y: number; // coordinate for representation on custom SVG map
}

const STATIONS: CityStation[] = [
  { id: 'wdc', name: 'Washington D.C.', lat: 38.9072, lon: -77.0369, x: 260, y: 110 },
  { id: 'nyc', name: 'New York City', lat: 40.7128, lon: -74.0060, x: 290, y: 90 },
  { id: 'chi', name: 'Chicago', lat: 41.8781, lon: -87.6298, x: 200, y: 80 },
  { id: 'mia', name: 'Miami', lat: 25.7617, lon: -80.1918, x: 270, y: 200 },
  { id: 'sfo', name: 'San Francisco', lat: 37.7749, lon: -122.4194, x: 40, y: 100 },
];

interface PollenData {
  time: string;
  aqi: number;
  alder: number;
  birch: number;
  grass: number;
  mugwort: number;
  olive: number;
  ragweed: number;
}

export const MapScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  
  const [selectedStation, setSelectedStation] = useState<CityStation | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pollenData, setPollenData] = useState<PollenData | null>(null);

  // Fetch pollen and AQI data for the selected city
  const fetchAirQuality = useCallback(async (station: CityStation) => {
    setLoading(true);
    setError(null);
    setPollenData(null);

    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${station.lat}&longitude=${station.lon}&current=us_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const current = data.current;
      
      if (!current) {
        throw new Error('Invalid response layout');
      }

      setPollenData({
        time: current.time,
        aqi: current.us_aqi ?? 0,
        alder: current.alder_pollen ?? 0,
        birch: current.birch_pollen ?? 0,
        grass: current.grass_pollen ?? 0,
        mugwort: current.mugwort_pollen ?? 0,
        olive: current.olive_pollen ?? 0,
        ragweed: current.ragweed_pollen ?? 0,
      });
    } catch (err: any) {
      console.error('Error fetching air quality data:', err);
      setError('Could not establish contact with Open-Meteo. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectStation = (station: CityStation) => {
    setSelectedStation(station);
    fetchAirQuality(station);
  };

  const getAqiColor = (aqi: number) => {
    if (aqi <= 50) return { main: COLORS.primary, container: COLORS.primaryContainer, text: 'Good' };
    if (aqi <= 100) return { main: COLORS.warning, container: COLORS.warningContainer, text: 'Moderate' };
    return { main: COLORS.alert, container: COLORS.alertContainer, text: 'Poor' };
  };

  const renderPollenRow = (label: string, value: number, max: number = 50) => {
    // Normalise percentage
    const percent = Math.min(100, Math.max(0, (value / max) * 100));
    let color = COLORS.primary;
    let hazard = 'Low';

    if (percent > 66) {
      color = COLORS.alert;
      hazard = 'High';
    } else if (percent > 33) {
      color = COLORS.warning;
      hazard = 'Moderate';
    }

    return (
      <View style={{ marginBottom: 12 }} key={label}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textPrimary }}>{label}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color }}>
            {value.toFixed(1)} grains/m³ ({hazard})
          </Text>
        </View>
        <View style={{ height: 6, backgroundColor: COLORS.background, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${percent}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
        </View>
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
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textPrimary }}>
            Allergen Map
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Select a telemetry station to fetch real-time pollen indices.
          </Text>
        </View>

        {/* Custom SVG US Schematic Map */}
        <View
          style={{
            backgroundColor: '#1E293B',
            borderRadius: 24,
            height: 240,
            overflow: 'hidden',
            position: 'relative',
            marginBottom: 20,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          {/* Schematic US Borders drawn as a simplified polyline background */}
          <Svg width="100%" height="100%" viewBox="0 0 340 240" style={{ position: 'absolute' }}>
            <G opacity="0.12">
              <Path
                d="M 30,80 L 80,75 L 140,55 L 200,60 L 250,50 L 300,70 L 310,120 L 290,160 L 280,200 L 240,210 L 210,190 L 160,185 L 110,195 L 70,170 L 40,150 L 25,120 Z"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </G>

            {/* Render Station Pins */}
            {STATIONS.map((station) => {
              const isSelected = selectedStation?.id === station.id;
              return (
                <G key={station.id}>
                  {/* Pulse Ring for selected */}
                  {isSelected && (
                    <Circle
                      cx={station.x}
                      cy={station.y}
                      r="12"
                      fill={COLORS.primary}
                      opacity="0.3"
                    />
                  )}
                  {/* Pin Circle */}
                  <Circle
                    cx={station.x}
                    cy={station.y}
                    r={isSelected ? '6' : '4'}
                    fill={isSelected ? COLORS.primary : '#94A3B8'}
                    onPress={() => handleSelectStation(station)}
                  />
                  {/* Station Label */}
                  <SvgText
                    x={station.x}
                    y={station.y - 10}
                    fill={isSelected ? '#FFFFFF' : '#94A3B8'}
                    fontSize="9"
                    fontWeight={isSelected ? '800' : '400'}
                    textAnchor="middle"
                    onPress={() => handleSelectStation(station)}
                  >
                    {station.name}
                  </SvgText>
                </G>
              );
            })}
          </Svg>

          {/* User hint */}
          <View style={{ position: 'absolute', bottom: 12, left: 16, flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="gesture-tap" size={14} color="#94A3B8" />
            <Text style={{ color: '#94A3B8', fontSize: 10, marginLeft: 4, fontWeight: '600' }}>
              Tap any node to query live telemetry
            </Text>
          </View>
        </View>

        {/* Selected station info sheet */}
        {loading && (
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 24, padding: 32, alignItems: 'center', justifyContent: 'center', shadowColor: '#1A2129', shadowRadius: 10, shadowOpacity: 0.05, elevation: 2 }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 12, fontWeight: '600' }}>
              Connecting to station telemetry...
            </Text>
          </View>
        )}

        {error && (
          <View style={{ backgroundColor: COLORS.alertContainer, borderRadius: 24, padding: 20, alignItems: 'center', shadowColor: '#1A2129', shadowRadius: 10, shadowOpacity: 0.05, elevation: 2 }}>
            <MaterialCommunityIcons name="alert-circle" size={32} color={COLORS.alert} style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.alert, textAlign: 'center', marginBottom: 12 }}>
              Telemetry Link Failed
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 18 }}>
              {error}
            </Text>
            <Pressable
              onPress={() => selectedStation && fetchAirQuality(selectedStation)}
              style={{ backgroundColor: COLORS.alert, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Retry Sync</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && !pollenData && (
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 24, padding: 32, alignItems: 'center', shadowColor: '#1A2129', shadowRadius: 10, shadowOpacity: 0.05, elevation: 2 }}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={48} color={COLORS.textSecondary} style={{ marginBottom: 12, opacity: 0.6 }} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 6 }}>
              No Station Selected
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 18 }}>
              Tap a monitoring node on the map to fetch real-time pollen indices and air quality ratings.
            </Text>
          </View>
        )}

        {!loading && !error && pollenData && selectedStation && (
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 24,
              padding: 20,
              shadowColor: '#1A2129',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 12,
              elevation: 2,
            }}
          >
            {/* Header detail */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 12 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                  {selectedStation.name}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                  Coordinates: {selectedStation.lat.toFixed(4)}°N, {Math.abs(selectedStation.lon).toFixed(4)}°W
                </Text>
              </View>
              
              {/* AQI Badge */}
              <View
                style={{
                  backgroundColor: getAqiColor(pollenData.aqi).container,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: getAqiColor(pollenData.aqi).main, fontSize: 16, fontWeight: '800' }}>
                  {pollenData.aqi}
                </Text>
                <Text style={{ color: getAqiColor(pollenData.aqi).main, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
                  AQI ({getAqiColor(pollenData.aqi).text})
                </Text>
              </View>
            </View>

            {/* Pollen categories */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 12 }}>
              Active Pollen Categories
            </Text>

            {renderPollenRow('Grass Pollen', pollenData.grass, 30)}
            {renderPollenRow('Birch Pollen', pollenData.birch, 50)}
            {renderPollenRow('Ragweed Pollen', pollenData.ragweed, 20)}
            {renderPollenRow('Alder Pollen', pollenData.alder, 30)}
            {renderPollenRow('Mugwort Pollen', pollenData.mugwort, 15)}
            {renderPollenRow('Olive Pollen', pollenData.olive, 25)}

            {/* Footnote */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <MaterialCommunityIcons name="earth" size={14} color={COLORS.textSecondary} />
              <Text style={{ fontSize: 10, color: COLORS.textSecondary, marginLeft: 6 }}>
                Live updates provided via Open-Meteo Air Quality telemetry network.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default MapScreen;
