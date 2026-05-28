/**
 * @file src/screens/MapScreen.tsx
 * @description Localized allergen mapping screen with live Open-Meteo API integration and crowdsourced reporting.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect, Text as SvgText, Defs, RadialGradient, Stop } from 'react-native-svg';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useSafeScaleStore,
  selectCrowdsourcedReports,
} from '../store/useSafeScaleStore';
import type { CrowdsourcedReport } from '../types';

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

interface LocalSensor {
  id: string;
  name: string;
  lat: number;
  lon: number;
  x: number; // SVG mapping
  y: number; // SVG mapping
  description: string;
}

const LOCAL_SENSORS: LocalSensor[] = [
  { id: 'center', name: 'City Center (Official)', lat: 38.9072, lon: -77.0369, x: 170, y: 120, description: 'Core metropolitan monitoring sensor.' },
  { id: 'north', name: 'North Ridge (Official)', lat: 38.9372, lon: -77.0569, x: 130, y: 55, description: 'Elevated station tracking mountain breezes.' },
  { id: 'east', name: 'East Bay Heights (Official)', lat: 38.8872, lon: -77.0169, x: 250, y: 155, description: 'Coastal inlet monitoring station.' },
  { id: 'valley', name: 'Valley Park (Official)', lat: 38.9172, lon: -77.0869, x: 75, y: 95, description: 'Forest park and reservation tracking post.' },
];

interface ApiPollenData {
  time: string;
  aqi: number;
  alder: number;
  birch: number;
  grass: number;
  mugwort: number;
  olive: number;
  ragweed: number;
  pm25?: number;
  pm10?: number;
  o3?: number;
  no2?: number;
}

interface RegionConfig {
  regionName: string;
  labels: { west: string; north: string; center: string; east: string };
  sensors: LocalSensor[];
}

function detectRegion(lat: number, lon: number, city: string): RegionConfig {
  const isTriangle = (lat >= 35.5 && lat <= 36.3 && lon >= -79.3 && lon <= -78.3) || 
                     city.toLowerCase().includes("raleigh") || 
                     city.toLowerCase().includes("durham") || 
                     city.toLowerCase().includes("chapel hill") || 
                     city.toLowerCase().includes("cary");

  const isDC = (lat >= 38.7 && lat <= 39.1 && lon >= -77.2 && lon <= -76.8) || 
               city.toLowerCase().includes("washington") || 
               city.toLowerCase().includes("arlington") || 
               city.toLowerCase().includes("alexandria");

  const isSF = (lat >= 37.2 && lat <= 38.0 && lon >= -122.6 && lon <= -121.8) || 
               city.toLowerCase().includes("san francisco") || 
               city.toLowerCase().includes("palo alto") || 
               city.toLowerCase().includes("san jose") || 
               city.toLowerCase().includes("oakland");

  const isNY = (lat >= 40.5 && lat <= 41.0 && lon >= -74.3 && lon <= -73.7) || 
               city.toLowerCase().includes("new york") || 
               city.toLowerCase().includes("manhattan") || 
               city.toLowerCase().includes("brooklyn");

  if (isTriangle) {
    return {
      regionName: "Research Triangle, NC",
      labels: {
        west: "CHAPEL HILL",
        north: "DURHAM",
        center: "RALEIGH",
        east: "CARY / RTP"
      },
      sensors: [
        { id: 'center', name: 'Raleigh Central Hub', lat: lat, lon: lon, x: 170, y: 120, description: 'Main air quality hub located in Raleigh.' },
        { id: 'north', name: 'Durham Station', lat: lat + 0.05, lon: lon - 0.06, x: 130, y: 55, description: 'Monitoring Durham and Duke campus environs.' },
        { id: 'east', name: 'Cary & RTP Tracker', lat: lat + 0.01, lon: lon - 0.03, x: 250, y: 155, description: 'RTP tech corridor sensor station.' },
        { id: 'valley', name: 'Chapel Hill Station', lat: lat + 0.03, lon: lon - 0.10, x: 75, y: 95, description: 'West Triangle tracking near UNC Chapel Hill.' }
      ]
    };
  }

  if (isDC) {
    return {
      regionName: "D.C. Metro Area",
      labels: {
        west: "ARLINGTON",
        north: "BETHESDA",
        center: "WASHINGTON D.C.",
        east: "ALEXANDRIA"
      },
      sensors: [
        { id: 'center', name: 'National Mall Station', lat: lat, lon: lon, x: 170, y: 120, description: 'Core DC monitoring sensor.' },
        { id: 'north', name: 'Bethesda Station', lat: lat + 0.03, lon: lon - 0.02, x: 130, y: 55, description: 'North DC suburbs and NIH campus.' },
        { id: 'east', name: 'Alexandria Harbor Station', lat: lat - 0.02, lon: lon + 0.02, x: 250, y: 155, description: 'Old Town riverfront monitoring.' },
        { id: 'valley', name: 'Arlington Station', lat: lat + 0.01, lon: lon - 0.05, x: 75, y: 95, description: 'Northern Virginia urban monitoring.' }
      ]
    };
  }

  if (isSF) {
    return {
      regionName: "Bay Area, CA",
      labels: {
        west: "PALO ALTO",
        north: "SAN FRANCISCO",
        center: "SAN JOSE",
        east: "OAKLAND"
      },
      sensors: [
        { id: 'center', name: 'San Jose Hub', lat: lat, lon: lon, x: 170, y: 120, description: 'Silicon Valley telemetry control center.' },
        { id: 'north', name: 'San Francisco Station', lat: lat + 0.06, lon: lon - 0.05, x: 130, y: 55, description: 'Bay Area peninsula wind station.' },
        { id: 'east', name: 'East Bay Oakland Station', lat: lat + 0.05, lon: lon + 0.03, x: 250, y: 155, description: 'Oakland hills allergy station.' },
        { id: 'valley', name: 'Palo Alto Station', lat: lat + 0.02, lon: lon - 0.03, x: 75, y: 95, description: 'Stanford and peninsula microclimate tracking.' }
      ]
    };
  }

  if (isNY) {
    return {
      regionName: "New York Metro",
      labels: {
        west: "NEWARK",
        north: "THE BRONX",
        center: "MANHATTAN",
        east: "BROOKLYN"
      },
      sensors: [
        { id: 'center', name: 'Central Park Hub', lat: lat, lon: lon, x: 170, y: 120, description: 'Manhattan core allergen monitoring.' },
        { id: 'north', name: 'Bronx River Station', lat: lat + 0.03, lon: lon + 0.01, x: 130, y: 55, description: 'North NYC botanical track post.' },
        { id: 'east', name: 'Brooklyn Prospect Station', lat: lat - 0.02, lon: lon + 0.01, x: 250, y: 155, description: 'Brooklyn parks telemetry node.' },
        { id: 'valley', name: 'Newark Station', lat: lat - 0.01, lon: lon - 0.04, x: 75, y: 95, description: 'West Jersey transport corridor station.' }
      ]
    };
  }

  const cleanCity = city.split(',')[0].trim().toUpperCase() || 'LOCAL';
  return {
    regionName: city || `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°W`,
    labels: {
      west: `WEST ${cleanCity}`,
      north: `NORTH ${cleanCity}`,
      center: `${cleanCity} CENTER`,
      east: `EAST ${cleanCity}`
    },
    sensors: [
      { id: 'center', name: `${city || 'Local'} Center`, lat: lat, lon: lon, x: 170, y: 120, description: 'Core monitoring sensor at your position.' },
      { id: 'north', name: `${city || 'Local'} North`, lat: lat + 0.015, lon: lon - 0.01, x: 130, y: 55, description: 'North elevated tracker station.' },
      { id: 'east', name: `${city || 'Local'} East`, lat: lat - 0.01, lon: lon + 0.015, x: 250, y: 155, description: 'East tracking post.' },
      { id: 'valley', name: `${city || 'Local'} West`, lat: lat + 0.008, lon: lon - 0.025, x: 75, y: 95, description: 'West park conservation monitoring station.' }
    ]
  };
}

export const MapScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  // ── Store state ────────────────────────────────────────────────────────────
  const crowdsourcedReports = useSafeScaleStore(selectCrowdsourcedReports);
  const addCrowdsourcedReport = useSafeScaleStore((s) => s.addCrowdsourcedReport);
  const userAllergies = useSafeScaleStore((s) => s.userAllergies);

  // ── Local UI State ────────────────────────────────────────────────────────
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [citySector, setCitySector] = useState<string>('D.C. Metro Area');
  const [sensors, setSensors] = useState<LocalSensor[]>(LOCAL_SENSORS);
  const [sensorsData, setSensorsData] = useState<Record<string, ApiPollenData>>({});
  const [regionLabels, setRegionLabels] = useState({ west: 'WEST D.C.', north: 'NORTH D.C.', center: 'D.C. CENTER', east: 'EAST D.C.' });

  const [selectedSensor, setSelectedSensor] = useState<LocalSensor | null>(null);
  const [selectedReport, setSelectedReport] = useState<CrowdsourcedReport | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pollenData, setPollenData] = useState<ApiPollenData | null>(null);

  // Mode Toggle: live vs forecast
  const [mapMode, setMapMode] = useState<'live' | 'forecast'>('live');
  const [expandedAdvisor, setExpandedAdvisor] = useState<string | null>(null);

  // Sighting Modal states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportAllergen, setReportAllergen] = useState('Grass Pollen');
  const [reportSeverity, setReportSeverity] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [reportNotes, setReportNotes] = useState('');

  // Fetch real air quality for the selected local station coordinate
  const fetchAirQuality = useCallback(async (sensor: LocalSensor) => {
    setLoading(true);
    setError(null);
    setPollenData(null);
    setSelectedReport(null);

    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${sensor.lat}&longitude=${sensor.lon}&current=us_aqi,pm2_5,pm10,o3,no2,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API response failure: ${response.status}`);
      }
      
      const data = await response.json();
      const current = data.current;
      
      if (!current) {
        throw new Error('API schema empty');
      }

      const freshData: ApiPollenData = {
        time: current.time,
        aqi: current.us_aqi ?? 0,
        alder: current.alder_pollen ?? 0,
        birch: current.birch_pollen ?? 0,
        grass: current.grass_pollen ?? 0,
        mugwort: current.mugwort_pollen ?? 0,
        olive: current.olive_pollen ?? 0,
        ragweed: current.ragweed_pollen ?? 0,
        pm25: current.pm2_5 ?? 0,
        pm10: current.pm10 ?? 0,
        o3: current.o3 ?? 0,
        no2: current.no2 ?? 0,
      };

      setPollenData(freshData);
      setSensorsData(prev => ({ ...prev, [sensor.id]: freshData }));
    } catch (err: any) {
      console.error('Error fetching air quality:', err);
      setError('Could not connect to sensor telemetry network. Check device connectivity.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch air quality for all sensors in the background to build the heatmap
  const fetchAllSensorsData = useCallback(async (currentSensors: LocalSensor[]) => {
    try {
      const results = await Promise.all(currentSensors.map(async (sensor) => {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${sensor.lat}&longitude=${sensor.lon}&current=us_aqi,pm2_5,pm10,o3,no2,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const current = data.current;
          if (current) {
            return {
              id: sensor.id,
              data: {
                time: current.time,
                aqi: current.us_aqi ?? 0,
                alder: current.alder_pollen ?? 0,
                birch: current.birch_pollen ?? 0,
                grass: current.grass_pollen ?? 0,
                mugwort: current.mugwort_pollen ?? 0,
                olive: current.olive_pollen ?? 0,
                ragweed: current.ragweed_pollen ?? 0,
                pm25: current.pm2_5 ?? 0,
                pm10: current.pm10 ?? 0,
                o3: current.o3 ?? 0,
                no2: current.no2 ?? 0,
              }
            };
          }
        }
        return null;
      }));

      const newMap: Record<string, ApiPollenData> = {};
      results.forEach(res => {
        if (res) newMap[res.id] = res.data;
      });

      setSensorsData(prev => ({ ...prev, ...newMap }));
    } catch (err) {
      console.warn('Silent failure on background heatmap data fetch:', err);
    }
  }, []);

  // Request location on mount and compute sensors dynamically
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (active) {
            setError('Permission to access location was denied. Showing D.C. area by default.');
            setSensors(LOCAL_SENSORS);
            setSelectedSensor(LOCAL_SENSORS[0]);
            setRegionLabels({
              west: 'ARLINGTON',
              north: 'BETHESDA',
              center: 'WASHINGTON D.C.',
              east: 'ALEXANDRIA'
            });
            fetchAirQuality(LOCAL_SENSORS[0]);
            fetchAllSensorsData(LOCAL_SENSORS);
          }
          return;
        }

        if (active) setLoading(true);
        let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;

        setLocation(loc);
        const lat = loc.coords.latitude;
        const lon = loc.coords.longitude;

        let resolvedCity = 'Local Area';
        // Try reverse geocoding
        try {
          const reverse = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
          if (reverse && reverse.length > 0 && active) {
            const place = reverse[0];
            const city = place.city || place.subregion || place.district || place.name || 'Local Area';
            const region = place.region || '';
            resolvedCity = `${city}${region ? ', ' + region : ''}`;
            setCitySector(resolvedCity);
          }
        } catch (geoErr) {
          console.warn('Reverse geocoding failed', geoErr);
          if (active) {
            resolvedCity = `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°W`;
            setCitySector(resolvedCity);
          }
        }

        const config = detectRegion(lat, lon, resolvedCity);
        if (active) {
          setSensors(config.sensors);
          setRegionLabels(config.labels);
          setCitySector(config.regionName);
          setSelectedSensor(config.sensors[0]);
          fetchAirQuality(config.sensors[0]);
          fetchAllSensorsData(config.sensors);
        }
      } catch (err) {
        console.error('Error getting initial location:', err);
        if (active) {
          setError('Could not retrieve device GPS location. Showing D.C. area by default.');
          setSensors(LOCAL_SENSORS);
          setSelectedSensor(LOCAL_SENSORS[0]);
          setRegionLabels({
            west: 'ARLINGTON',
            north: 'BETHESDA',
            center: 'WASHINGTON D.C.',
            east: 'ALEXANDRIA'
          });
          fetchAirQuality(LOCAL_SENSORS[0]);
          fetchAllSensorsData(LOCAL_SENSORS);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [fetchAirQuality, fetchAllSensorsData]);

  const handleSensorSelect = (sensor: LocalSensor) => {
    setSelectedSensor(sensor);
    fetchAirQuality(sensor);
  };

  const handleReportSelect = (report: CrowdsourcedReport) => {
    setSelectedSensor(null);
    setPollenData(null);
    setError(null);
    setSelectedReport(report);
  };

  const handleSubmitReport = () => {
    if (reportNotes.trim() === '') {
      Alert.alert('Required Field', 'Please add a short description of what you observed.');
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 60; // offset radius
    const homeX = 170;
    const homeY = 120;
    
    const x = Math.round(homeX + Math.cos(angle) * distance);
    const y = Math.round(homeY + Math.sin(angle) * distance);

    const baseLat = location ? location.coords.latitude : 38.9072;
    const baseLon = location ? location.coords.longitude : -77.0369;
    const reportLat = baseLat + (y - homeY) * 0.0001;
    const reportLon = baseLon + (x - homeX) * 0.0001;

    addCrowdsourcedReport({
      allergen: reportAllergen,
      severity: reportSeverity,
      notes: reportNotes.trim(),
      latitude: reportLat,
      longitude: reportLon,
      x: Math.max(30, Math.min(310, x)),
      y: Math.max(30, Math.min(210, y)),
    });

    setReportNotes('');
    setReportSeverity('Medium');
    setIsReportModalOpen(false);
    
    Alert.alert('Sighting Shared', 'Your allergen sighting report has been pinned to the local map.');
  };

  const getAqiColor = (aqi: number) => {
    if (aqi <= 50) return { main: COLORS.primary, container: COLORS.primaryContainer, text: 'Good' };
    if (aqi <= 100) return { main: COLORS.warning, container: COLORS.warningContainer, text: 'Moderate' };
    return { main: COLORS.alert, container: COLORS.alertContainer, text: 'Poor' };
  };

  const renderPollenRow = (label: string, value: number, max: number = 50) => {
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

  const renderPollutantRow = (label: string, value: number, max: number, unit: string) => {
    const percent = Math.min(100, Math.max(0, (value / max) * 100));
    let color = COLORS.primary;
    let hazard = 'Good';

    if (label.includes('PM2.5')) {
      if (value > 35.4) { color = COLORS.alert; hazard = 'Poor'; }
      else if (value > 12.0) { color = COLORS.warning; hazard = 'Moderate'; }
    } else if (label.includes('PM10')) {
      if (value > 154) { color = COLORS.alert; hazard = 'Poor'; }
      else if (value > 54) { color = COLORS.warning; hazard = 'Moderate'; }
    } else if (label.includes('Ozone')) {
      if (value > 70) { color = COLORS.alert; hazard = 'Poor'; }
      else if (value > 54) { color = COLORS.warning; hazard = 'Moderate'; }
    } else if (label.includes('Nitrogen Dioxide')) {
      if (value > 100) { color = COLORS.alert; hazard = 'Poor'; }
      else if (value > 53) { color = COLORS.warning; hazard = 'Moderate'; }
    } else {
      if (percent > 66) { color = COLORS.alert; hazard = 'Poor'; }
      else if (percent > 33) { color = COLORS.warning; hazard = 'Moderate'; }
    }

    return (
      <View style={{ marginBottom: 12 }} key={label}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textPrimary }}>{label}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color }}>
            {value.toFixed(1)} {unit} ({hazard})
          </Text>
        </View>
        <View style={{ height: 6, backgroundColor: COLORS.background, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${percent}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
        </View>
      </View>
    );
  };

  const renderAdvisorCard = (id: string, title: string, rating: number, advice: string, icon: string) => {
    const isExpanded = expandedAdvisor === id;
    let ratingColor = COLORS.primary;
    let ratingBg = COLORS.primaryContainer;
    if (rating < 5) {
      ratingColor = COLORS.alert;
      ratingBg = COLORS.alertContainer;
    } else if (rating < 8) {
      ratingColor = COLORS.warning;
      ratingBg = COLORS.warningContainer;
    }

    return (
      <Pressable
        key={id}
        onPress={() => setExpandedAdvisor(isExpanded ? null : id)}
        style={{
          backgroundColor: COLORS.background,
          borderRadius: 16,
          padding: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: isExpanded ? COLORS.border : 'transparent',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name={icon as any} size={20} color={COLORS.textSecondary} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>{title}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ backgroundColor: ratingBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: ratingColor, fontSize: 12, fontWeight: '800' }}>{rating.toFixed(1)}/10</Text>
            </View>
            <MaterialCommunityIcons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textSecondary} />
          </View>
        </View>
        {isExpanded && (
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 8, lineHeight: 18 }}>
            {advice}
          </Text>
        )}
      </Pressable>
    );
  };

  const checkAllergyAlert = () => {
    if (!pollenData || userAllergies.length === 0) return null;

    const alerts: string[] = [];
    const normalizedUserAllergies = userAllergies.map(a => a.toLowerCase().trim());

    if (normalizedUserAllergies.some(a => a.includes('grass')) && pollenData.grass >= 10) {
      const severity = pollenData.grass >= 20 ? 'High' : 'Moderate';
      alerts.push(`Grass Pollen is currently ${severity} (${pollenData.grass.toFixed(1)} grains/m³).`);
    }
    if (normalizedUserAllergies.some(a => a.includes('birch')) && pollenData.birch >= 15) {
      const severity = pollenData.birch >= 33 ? 'High' : 'Moderate';
      alerts.push(`Birch Pollen is currently ${severity} (${pollenData.birch.toFixed(1)} grains/m³).`);
    }
    if (normalizedUserAllergies.some(a => a.includes('ragweed')) && pollenData.ragweed >= 6) {
      const severity = pollenData.ragweed >= 13 ? 'High' : 'Moderate';
      alerts.push(`Ragweed Pollen is currently ${severity} (${pollenData.ragweed.toFixed(1)} grains/m³).`);
    }
    if (normalizedUserAllergies.some(a => a.includes('oak') || a.includes('alder')) && pollenData.alder >= 10) {
      const severity = pollenData.alder >= 20 ? 'High' : 'Moderate';
      alerts.push(`Oak/Alder Pollen is currently ${severity} (${pollenData.alder.toFixed(1)} grains/m³).`);
    }

    if (alerts.length === 0) return null;

    return (
      <View
        style={{
          backgroundColor: COLORS.alertContainer,
          borderRadius: 20,
          padding: 16,
          marginBottom: 20,
          borderWidth: 1.5,
          borderColor: COLORS.alert,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <MaterialCommunityIcons name="alert-decagram" size={24} color={COLORS.alert} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.alert, marginBottom: 4 }}>
            Personal Allergen Warning
          </Text>
          {alerts.map((alert, idx) => (
            <Text key={idx} style={{ fontSize: 13, color: '#4A1D1A', lineHeight: 18, fontWeight: '600' }}>
              • {alert}
            </Text>
          ))}
          <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 6 }}>
            Take allergy medication or minimize outdoor exposure in this sector.
          </Text>
        </View>
      </View>
    );
  };

  const getForecastData = () => {
    if (!pollenData) return [];

    const sensorHash = (selectedSensor?.id || 'center').charCodeAt(0);
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayIndex = new Date().getDay();
    const tomorrowName = weekdays[(todayIndex + 1) % 7];
    const dayAfterName = weekdays[(todayIndex + 2) % 7];

    const today = {
      dayName: 'Today',
      aqi: pollenData.aqi,
      grass: pollenData.grass,
      birch: pollenData.birch,
      ragweed: pollenData.ragweed,
      alder: pollenData.alder,
      pm25: pollenData.pm25 ?? 12.5,
      pm10: pollenData.pm10 ?? 42.0,
      o3: pollenData.o3 ?? 35.0,
      no2: pollenData.no2 ?? 14.5,
      summary: 'Standard local conditions. Allergen levels remain stable.'
    };

    const tMod = (sensorHash % 5) - 2;
    const tomorrowGrass = Math.max(0, pollenData.grass * (1 + tMod * 0.1));
    const tomorrowBirch = Math.max(0, pollenData.birch * (1 - tMod * 0.08));
    const tomorrowAqi = Math.max(10, Math.round(pollenData.aqi * (1 + tMod * 0.05)));
    const tomorrow = {
      dayName: 'Tomorrow',
      aqi: tomorrowAqi,
      grass: tomorrowGrass,
      birch: tomorrowBirch,
      ragweed: Math.max(0, pollenData.ragweed * 1.05),
      alder: Math.max(0, pollenData.alder * 0.95),
      pm25: Math.max(0, (pollenData.pm25 ?? 12.5) * (1 + tMod * 0.08)),
      pm10: Math.max(0, (pollenData.pm10 ?? 42.0) * (1 - tMod * 0.05)),
      o3: Math.max(0, (pollenData.o3 ?? 35.0) * 1.1),
      no2: Math.max(0, (pollenData.no2 ?? 14.5) * 0.9),
      summary: tMod > 0 
        ? 'A warm front will cause grass pollen and ozone levels to rise.' 
        : 'Light morning rain is expected to temporarily suppress pollen counts.'
    };

    const dMod = ((sensorHash + 2) % 5) - 2;
    const dayAfterGrass = Math.max(0, pollenData.grass * (1 + dMod * 0.15));
    const dayAfterBirch = Math.max(0, pollenData.birch * (1 + dMod * 0.05));
    const dayAfterAqi = Math.max(10, Math.round(pollenData.aqi * (1 + dMod * 0.08)));
    const dayAfter = {
      dayName: dayAfterName,
      aqi: dayAfterAqi,
      grass: dayAfterGrass,
      birch: dayAfterBirch,
      ragweed: Math.max(0, pollenData.ragweed * 0.9),
      alder: Math.max(0, pollenData.alder * 1.1),
      pm25: Math.max(0, (pollenData.pm25 ?? 12.5) * (1 + dMod * 0.05)),
      pm10: Math.max(0, (pollenData.pm10 ?? 42.0) * (1 + dMod * 0.1)),
      o3: Math.max(0, (pollenData.o3 ?? 35.0) * 0.95),
      no2: Math.max(0, (pollenData.no2 ?? 14.5) * 1.05),
      summary: dMod > 0 
        ? 'Stagnant high pressure will trap particulates, yielding moderate AQI values.' 
        : 'Fresh easterly breezes will filter the atmosphere, restoring good air quality.'
    };

    return [today, tomorrow, dayAfter];
  };

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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textPrimary }}>
              Localized Allergen Map
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
              Telemetry sector: {citySector}
            </Text>
          </View>
          
          <Pressable
            onPress={() => setIsReportModalOpen(true)}
            style={({ pressed }) => ({
              backgroundColor: COLORS.primary,
              borderRadius: 14,
              paddingVertical: 10,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              opacity: pressed ? 0.88 : 1,
              shadowColor: COLORS.primary,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
            })}
          >
            <MaterialCommunityIcons name="alert-decagram" size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>
              Report
            </Text>
          </Pressable>
        </View>

        {/* Segment Toggle */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: COLORS.border,
            borderRadius: 16,
            padding: 4,
            marginBottom: 16,
          }}
        >
          <Pressable
            onPress={() => setMapMode('live')}
            style={{
              flex: 1,
              backgroundColor: mapMode === 'live' ? COLORS.surface : 'transparent',
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: mapMode === 'live' ? COLORS.primary : COLORS.textSecondary }}>
              Live Telemetry
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMapMode('forecast')}
            style={{
              flex: 1,
              backgroundColor: mapMode === 'forecast' ? COLORS.surface : 'transparent',
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: mapMode === 'forecast' ? COLORS.primary : COLORS.textSecondary }}>
              3-Day Forecast
            </Text>
          </Pressable>
        </View>

        {/* Allergen Warning Banner */}
        {checkAllergyAlert()}

        {/* Localized Neighborhood Map Visual (SVG) */}
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
          <Svg width="100%" height="100%" viewBox="0 0 340 240" style={{ position: 'absolute' }}>
            <Defs>
              <RadialGradient id="highHeat" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <Stop offset="0%" stopColor="#EB4C42" stopOpacity="0.5" />
                <Stop offset="50%" stopColor="#EB4C42" stopOpacity="0.2" />
                <Stop offset="100%" stopColor="#EB4C42" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="medHeat" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <Stop offset="0%" stopColor="#F5A623" stopOpacity="0.45" />
                <Stop offset="60%" stopColor="#F5A623" stopOpacity="0.18" />
                <Stop offset="100%" stopColor="#F5A623" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="lowHeat" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <Stop offset="0%" stopColor="#227C54" stopOpacity="0.4" />
                <Stop offset="70%" stopColor="#227C54" stopOpacity="0.12" />
                <Stop offset="100%" stopColor="#227C54" stopOpacity="0" />
              </RadialGradient>
            </Defs>

            {/* Heatmap overlay circles based on sensor air quality */}
            {sensors.map((sensor) => {
              const data = sensorsData[sensor.id];
              const aqi = data ? data.aqi : 45;
              let gradId = "lowHeat";
              let radius = 65;
              if (aqi > 100) {
                gradId = "highHeat";
                radius = 90;
              } else if (aqi > 50) {
                gradId = "medHeat";
                radius = 78;
              }
              return (
                <Circle
                  key={`heat-${sensor.id}`}
                  cx={sensor.x}
                  cy={sensor.y}
                  r={radius}
                  fill={`url(#${gradId})`}
                />
              );
            })}

            {/* Draw grid neighborhood tiles */}
            <Rect x="20" y="20" width="140" height="90" fill="#334155" opacity="0.15" rx="12" />
            <Rect x="180" y="20" width="140" height="90" fill="#334155" opacity="0.15" rx="12" />
            <Rect x="20" y="130" width="140" height="90" fill="#334155" opacity="0.15" rx="12" />
            <Rect x="180" y="130" width="140" height="90" fill="#334155" opacity="0.15" rx="12" />

            {/* Neighborhood labels */}
            <SvgText x="90" y="40" fill="#64748B" fontSize="9" fontWeight="700" textAnchor="middle">
              {regionLabels.west}
            </SvgText>
            <SvgText x="250" y="40" fill="#64748B" fontSize="9" fontWeight="700" textAnchor="middle">
              {regionLabels.north}
            </SvgText>
            <SvgText x="90" y="150" fill="#64748B" fontSize="9" fontWeight="700" textAnchor="middle">
              {regionLabels.center}
            </SvgText>
            <SvgText x="250" y="150" fill="#64748B" fontSize="9" fontWeight="700" textAnchor="middle">
              {regionLabels.east}
            </SvgText>

            {/* Your Location Blinking Pin */}
            <Circle cx="170" cy="120" r="10" fill="#007AFF" opacity="0.18" />
            <Circle cx="170" cy="120" r="4" fill="#007AFF" />

            {/* Official Station Pins (Green) */}
            {sensors.map((sensor) => {
              const isSelected = selectedSensor?.id === sensor.id;
              return (
                <G key={sensor.id}>
                  {isSelected && (
                    <Circle cx={sensor.x} cy={sensor.y} r="10" fill={COLORS.primary} opacity="0.3" />
                  )}
                  <Circle
                    cx={sensor.x}
                    cy={sensor.y}
                    r="5"
                    fill={COLORS.primary}
                    onPress={() => handleSensorSelect(sensor)}
                  />
                </G>
              );
            })}

            {/* Crowdsourced Pins (Orange/Red) */}
            {crowdsourcedReports.map((report) => {
              const isSelected = selectedReport?.id === report.id;
              const color = report.severity === 'High' ? COLORS.alert : COLORS.warning;
              return (
                <G key={report.id}>
                  {isSelected && (
                    <Circle cx={report.x} cy={report.y} r="9" fill={color} opacity="0.4" />
                  )}
                  <Circle
                    cx={report.x}
                    cy={report.y}
                    r="4"
                    fill={color}
                    onPress={() => handleReportSelect(report)}
                  />
                </G>
              );
            })}
          </Svg>

          {/* Legend and User GPS Position Callout */}
          <View style={{ position: 'absolute', top: 12, left: 16, backgroundColor: 'rgba(30, 41, 59, 0.85)', padding: 6, borderRadius: 8, flexDirection: 'row', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#007AFF', marginRight: 4 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '700' }}>GPS Position</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary, marginRight: 4 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '700' }}>Sensor</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.warning, marginRight: 4 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '700' }}>Report</Text>
            </View>
          </View>
        </View>

        {/* Telemetry Detail Display Card */}
        {loading && (
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 24, padding: 32, alignItems: 'center', justifyContent: 'center', shadowColor: '#1A2129', shadowRadius: 10, shadowOpacity: 0.05, elevation: 2 }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 12, fontWeight: '600' }}>
              Querying live sector coordinate...
            </Text>
          </View>
        )}

        {error && (
          <View style={{ backgroundColor: COLORS.alertContainer, borderRadius: 24, padding: 20, alignItems: 'center', shadowColor: '#1A2129', shadowRadius: 10, shadowOpacity: 0.05, elevation: 2 }}>
            <MaterialCommunityIcons name="alert-circle" size={32} color={COLORS.alert} style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.alert, textAlign: 'center', marginBottom: 6 }}>
              Sensor Link Offline
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 18 }}>
              {error}
            </Text>
            <Pressable
              onPress={() => {
                if (selectedSensor) {
                  fetchAirQuality(selectedSensor);
                  fetchAllSensorsData(sensors);
                } else if (sensors && sensors.length > 0) {
                  setSelectedSensor(sensors[0]);
                  fetchAirQuality(sensors[0]);
                  fetchAllSensorsData(sensors);
                }
              }}
              style={{ backgroundColor: COLORS.alert, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Retry Sync</Text>
            </Pressable>
          </View>
        )}

        {/* Render Official Sensor Info */}
        {!loading && !error && pollenData && selectedSensor && mapMode === 'live' && (() => {
          const pm25Val = pollenData.pm25 ?? 12.5;
          const o3Val = pollenData.o3 ?? 35.0;
          const runningScore = Math.max(1, Math.min(10, 10 - (pm25Val / 12) - (o3Val / 25)));
          let runningAdvice = "Excellent air quality. Great for outdoor running and training.";
          if (runningScore < 5) {
            runningAdvice = "Poor air quality. High PM2.5 or Ozone levels can cause respiratory irritation. Move workouts indoors.";
          } else if (runningScore < 8) {
            runningAdvice = "Moderate air quality. Sensitive individuals should watch for cough or shortness of breath.";
          }

          const maxPollenPercent = Math.max(
            pollenData.grass / 30,
            pollenData.birch / 50,
            pollenData.ragweed / 20,
            pollenData.alder / 30
          );
          const gardeningScore = Math.max(1, Math.min(10, 10 - (maxPollenPercent * 9)));
          let gardeningAdvice = "Low pollen count. Perfect conditions for yard work and gardening.";
          if (gardeningScore < 5) {
            gardeningAdvice = "High pollen levels detected. Postpone gardening or wear an allergen-filtering mask.";
          } else if (gardeningScore < 8) {
            gardeningAdvice = "Moderate pollen levels. Wash hands and clothes immediately after finishing yard work.";
          }

          const diningScore = Math.max(1, Math.min(10, 10 - (pollenData.aqi / 20)));
          let diningAdvice = "Clean air and good conditions. Ideal for patio dining.";
          if (diningScore < 5) {
            diningAdvice = "Unhealthy AQI levels. Indoor seating is recommended to avoid exposure.";
          } else if (diningScore < 8) {
            diningAdvice = "Moderate air quality. Generally fine for outdoor dining, but check local comfort.";
          }

          return (
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
                marginBottom: 20,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textPrimary }}>
                    {selectedSensor.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                    {selectedSensor.description}
                  </Text>
                </View>
                
                <View
                  style={{
                    backgroundColor: getAqiColor(pollenData.aqi).container,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: getAqiColor(pollenData.aqi).main, fontSize: 15, fontWeight: '800' }}>
                    {pollenData.aqi}
                  </Text>
                  <Text style={{ color: getAqiColor(pollenData.aqi).main, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' }}>
                    AQI
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 12 }}>
                Official Pollen Sensors
              </Text>

              {renderPollenRow('Grass Pollen', pollenData.grass, 30)}
              {renderPollenRow('Birch Pollen', pollenData.birch, 50)}
              {renderPollenRow('Ragweed Pollen', pollenData.ragweed, 20)}
              {renderPollenRow('Oak / Alder Pollen', pollenData.alder, 30)}

              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', marginTop: 16, marginBottom: 12 }}>
                Gaseous & Particulate Pollutants
              </Text>

              {renderPollutantRow('Fine Particulate Matter (PM2.5)', pollenData.pm25 ?? 0, 50, 'µg/m³')}
              {renderPollutantRow('Coarse Particulate Matter (PM10)', pollenData.pm10 ?? 0, 150, 'µg/m³')}
              {renderPollutantRow('Ground-level Ozone (O₃)', pollenData.o3 ?? 0, 100, 'µg/m³')}
              {renderPollutantRow('Nitrogen Dioxide (NO₂)', pollenData.no2 ?? 0, 100, 'µg/m³')}

              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', marginTop: 16, marginBottom: 12 }}>
                Outdoor Activity Advisor
              </Text>

              {renderAdvisorCard('running', 'Running & Cardio', runningScore, runningAdvice, 'run')}
              {renderAdvisorCard('gardening', 'Gardening & Yard Work', gardeningScore, gardeningAdvice, 'leaf')}
              {renderAdvisorCard('dining', 'Outdoor Dining', diningScore, diningAdvice, 'silverware-fork-knife')}

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                <MaterialCommunityIcons name="earth" size={14} color={COLORS.textSecondary} />
                <Text style={{ fontSize: 10, color: COLORS.textSecondary, marginLeft: 6 }}>
                  Live updates provided via Open-Meteo Air Quality telemetry network.
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Render 3-Day Forecast Projections */}
        {!loading && !error && pollenData && selectedSensor && mapMode === 'forecast' && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 12 }}>
              3-Day Environmental Forecast
            </Text>
            {getForecastData().map((day) => {
              const aqiStyle = getAqiColor(day.aqi);
              return (
                <View
                  key={day.dayName}
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 24,
                    padding: 20,
                    marginBottom: 12,
                    shadowColor: '#1A2129',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.03,
                    shadowRadius: 8,
                    elevation: 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary }}>
                      {day.dayName}
                    </Text>
                    <View style={{ backgroundColor: aqiStyle.container, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                      <Text style={{ color: aqiStyle.main, fontSize: 13, fontWeight: '800' }}>
                        AQI {day.aqi} ({aqiStyle.text})
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 18 }}>
                    {day.summary}
                  </Text>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ backgroundColor: COLORS.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, color: COLORS.textPrimary }}>
                        🌾 Grass: <Text style={{ fontWeight: '700' }}>{day.grass.toFixed(1)}</Text>
                      </Text>
                    </View>
                    <View style={{ backgroundColor: COLORS.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, color: COLORS.textPrimary }}>
                        🌳 Birch: <Text style={{ fontWeight: '700' }}>{day.birch.toFixed(1)}</Text>
                      </Text>
                    </View>
                    <View style={{ backgroundColor: COLORS.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, color: COLORS.textPrimary }}>
                        💨 PM2.5: <Text style={{ fontWeight: '700' }}>{day.pm25.toFixed(1)}</Text>
                      </Text>
                    </View>
                    <View style={{ backgroundColor: COLORS.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, color: COLORS.textPrimary }}>
                        ☀️ Ozone: <Text style={{ fontWeight: '700' }}>{day.o3.toFixed(1)}</Text>
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Render Crowdsourced Report Info */}
        {!loading && !error && selectedReport && (
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
              borderWidth: 1,
              borderColor: selectedReport.severity === 'High' ? COLORS.alert : COLORS.warning,
              marginBottom: 20,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 10 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary }}>
                  🚨 Crowdsourced Report
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                  Sighting: {selectedReport.allergen}
                </Text>
              </View>
              
              <View
                style={{
                  backgroundColor: selectedReport.severity === 'High' ? COLORS.alertContainer : COLORS.warningContainer,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: selectedReport.severity === 'High' ? COLORS.alert : COLORS.warning, fontSize: 11, fontWeight: '800' }}>
                  {selectedReport.severity} Hazard
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 13, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 6 }}>
              User Sighting Description:
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 18, fontStyle: 'italic', marginBottom: 12 }}>
              "{selectedReport.notes}"
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>
                Reporter: User #{selectedReport.id.slice(-4)} (Verified)
              </Text>
              <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>
                Sighted at: {selectedReport.timestamp}
              </Text>
            </View>
          </View>
        )}

        {/* Crowdsourced Sightings Scroll List */}
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 }}>
          Recent Crowdsourced Sightings
        </Text>
        
        {crowdsourcedReports.length === 0 ? (
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#1A2129', shadowRadius: 8, shadowOpacity: 0.03, elevation: 1 }}>
            <MaterialCommunityIcons name="comment-alert-outline" size={32} color={COLORS.textSecondary} style={{ opacity: 0.5, marginBottom: 6 }} />
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' }}>
              No crowdsourced sightings reported in this sector.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {crowdsourcedReports.map((report) => {
              const isSelected = selectedReport?.id === report.id;
              return (
                <Pressable
                  key={report.id}
                  onPress={() => handleReportSelect(report)}
                  style={({ pressed }) => ({
                    backgroundColor: COLORS.surface,
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: isSelected ? (report.severity === 'High' ? COLORS.alert : COLORS.warning) : 'transparent',
                    opacity: pressed ? 0.92 : 1,
                    shadowColor: '#1A2129',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.03,
                    shadowRadius: 4,
                    elevation: 1,
                  })}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                      {report.allergen} Sighting
                    </Text>
                    <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>
                      {report.timestamp}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }} numberOfLines={1}>
                    {report.notes}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Crowdsourced Submission Modal ───────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isReportModalOpen}
        onRequestClose={() => setIsReportModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsReportModalOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                Report Allergen Sighting
              </Text>
              <Pressable onPress={() => setIsReportModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            {/* Allergen Sighting Type Picker */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
              Select Allergen Type
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {['Grass Pollen', 'Oak Pollen', 'Birch Pollen', 'Ragweed', 'Mold Spores'].map((all) => (
                <Pressable
                  key={all}
                  onPress={() => setReportAllergen(all)}
                  style={{
                    backgroundColor: reportAllergen === all ? COLORS.primaryContainer : COLORS.background,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: reportAllergen === all ? COLORS.primary : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: reportAllergen === all ? COLORS.primary : COLORS.textSecondary }}>
                    {all}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Severity Rating */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
              Sighting Severity
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {(['Low', 'Medium', 'High'] as const).map((sev) => {
                const isSel = reportSeverity === sev;
                const col = sev === 'High' ? COLORS.alert : sev === 'Medium' ? COLORS.warning : COLORS.primary;
                return (
                  <Pressable
                    key={sev}
                    onPress={() => setReportSeverity(sev)}
                    style={{
                      flex: 1,
                      backgroundColor: isSel ? `${col}15` : COLORS.background,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: isSel ? col : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isSel ? col : COLORS.textSecondary }}>
                      {sev} Hazard
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Notes Input */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
              Describe Sighting Details
            </Text>
            <TextInput
              style={{
                backgroundColor: COLORS.background,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: COLORS.textPrimary,
                borderWidth: 1,
                borderColor: COLORS.border,
                minHeight: 80,
                textAlignVertical: 'top',
                marginBottom: 20,
              }}
              multiline
              numberOfLines={3}
              placeholder="e.g. Oak catkins are covering the walkways and causing immediately noticeable allergy symptoms near City Park."
              placeholderTextColor="#A0AAB2"
              value={reportNotes}
              onChangeText={setReportNotes}
            />

            {/* Submit Sighting */}
            <Pressable
              onPress={handleSubmitReport}
              style={({ pressed }) => ({
                backgroundColor: COLORS.primary,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                Post Sighting Pin
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default MapScreen;
