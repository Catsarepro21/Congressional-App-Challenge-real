import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  Pressable,
  Modal,
  Share,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line, Circle, Polyline, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeScaleStore, selectBiometricCore, selectIsTestMode, selectMoodLogs, selectVitalsLogs } from '../store/useSafeScaleStore';

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
  const weeklyHistory = useSafeScaleStore((state) => state.weeklyHistory);
  const medicalRecords = useSafeScaleStore((state) => state.medicalRecords) || [];
  const userAllergies = useSafeScaleStore((state) => state.userAllergies) || [];
  const medicationSchedule = useSafeScaleStore((state) => state.medicationSchedule) || [];
  const symptomLogs = useSafeScaleStore((state) => state.symptomLogs) || [];
  const profile = useSafeScaleStore((state) => state.profile);
  const moodLogs = useSafeScaleStore(selectMoodLogs) || [];
  const vitalsLogs = useSafeScaleStore(selectVitalsLogs) || [];
  const [activeSubTab, setActiveSubTab] = React.useState<'Biometrics' | 'Vitals'>('Biometrics');

  const [isReportOpen, setIsReportOpen] = React.useState(false);

  // Ungate: show data if either score > 0 or we have weekly history
  const hasData = biometricCore.dailyStabilityScore > 0 || (weeklyHistory && weeklyHistory.length > 0);

  // Helper to format date label
  const getDayName = (dateStr: string) => {
    try {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const d = new Date(dateStr + 'T00:00:00');
      return days[d.getDay()];
    } catch {
      return dateStr.substring(5);
    }
  };

  // 1. Stability Score Trend Chart
  const renderStabilityChart = () => {
    const data = weeklyHistory;
    if (!data || data.length === 0) return null;

    const width = Dimensions.get('window').width - 72;
    const height = 120;
    const padding = 15;

    const minVal = Math.min(...data.map(d => d.stabilityScore), 50) - 5;
    const maxVal = Math.max(...data.map(d => d.stabilityScore), 100);
    const range = Math.max(10, maxVal - minVal);

    const getX = (index: number) => padding + (index * (width - 2 * padding)) / (data.length - 1);
    const getY = (val: number) => height - padding - 8 - ((val - minVal) * (height - 2 * padding - 8)) / range;

    const points = data.map((entry, idx) => `${getX(idx)},${getY(entry.stabilityScore)}`).join(' ');

    return (
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="stabilityGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={COLORS.primary} />
              <Stop offset="100%" stopColor={COLORS.secondary} />
            </LinearGradient>
          </Defs>
          <Line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke={COLORS.border} strokeWidth={1} strokeDasharray="4 4" />
          
          <Polyline
            fill="none"
            stroke="url(#stabilityGrad)"
            strokeWidth={3}
            points={points}
          />

          {data.map((entry, idx) => (
            <React.Fragment key={idx}>
              <Circle
                cx={getX(idx)}
                cy={getY(entry.stabilityScore)}
                r={4}
                fill={COLORS.surface}
                stroke={COLORS.primary}
                strokeWidth={2}
              />
              <SvgText
                x={getX(idx)}
                y={getY(entry.stabilityScore) - 8}
                fontSize="8"
                fontWeight="700"
                fill={COLORS.textPrimary}
                textAnchor="middle"
              >
                {entry.stabilityScore}
              </SvgText>
              <SvgText
                x={getX(idx)}
                y={height - 2}
                fontSize="8"
                fontWeight="600"
                fill={COLORS.textSecondary}
                textAnchor="middle"
              >
                {getDayName(entry.date)}
              </SvgText>
            </React.Fragment>
          ))}
        </Svg>
      </View>
    );
  };

  // 2. Resting Heart Rate History Chart
  const renderRhrChart = () => {
    const data = biometricCore.historicalRHR;
    if (data.length === 0) return null;

    const width = Dimensions.get('window').width - 72;
    const height = 120;
    const padding = 15;
    
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
          <Line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke={COLORS.border} strokeWidth={1} strokeDasharray="4 4" />
          
          <Polyline
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth={3}
            points={points}
          />
          
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

  // 3. 7-Day Steps Chart
  const renderStepsChart = () => {
    const data = weeklyHistory;
    if (!data || data.length === 0) return null;

    const width = Dimensions.get('window').width - 72;
    const height = 120;
    const paddingBottom = 20;
    const paddingTop = 15;
    const paddingLeft = 10;
    const paddingRight = 10;

    const maxSteps = Math.max(...data.map(d => d.steps), 5000);
    const barWidth = (width - paddingLeft - paddingRight) / data.length - 8;

    return (
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <Svg width={width} height={height}>
          {data.map((entry, idx) => {
            const barHeight = ((entry.steps) / maxSteps) * (height - paddingTop - paddingBottom);
            const x = paddingLeft + idx * ((width - paddingLeft - paddingRight) / data.length) + 4;
            const y = height - paddingBottom - barHeight;

            return (
              <React.Fragment key={idx}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={4}
                  fill={COLORS.primary}
                />
                <SvgText
                  x={x + barWidth / 2}
                  y={height - 4}
                  fontSize="8"
                  fontWeight="600"
                  fill={COLORS.textSecondary}
                  textAnchor="middle"
                >
                  {getDayName(entry.date)}
                </SvgText>
                <SvgText
                  x={x + barWidth / 2}
                  y={y - 4}
                  fontSize="8"
                  fontWeight="700"
                  fill={COLORS.textPrimary}
                  textAnchor="middle"
                >
                  {entry.steps >= 1000 ? `${(entry.steps / 1000).toFixed(1)}k` : entry.steps}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  };

  // 4. 7-Day Active Calories Chart
  const renderCaloriesChart = () => {
    const data = weeklyHistory;
    if (!data || data.length === 0) return null;

    const width = Dimensions.get('window').width - 72;
    const height = 120;
    const paddingBottom = 20;
    const paddingTop = 15;
    const paddingLeft = 10;
    const paddingRight = 10;

    const maxCalories = Math.max(...data.map(d => d.activeCalories), 200);
    const barWidth = (width - paddingLeft - paddingRight) / data.length - 8;

    return (
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <Svg width={width} height={height}>
          {data.map((entry, idx) => {
            const barHeight = ((entry.activeCalories) / maxCalories) * (height - paddingTop - paddingBottom);
            const x = paddingLeft + idx * ((width - paddingLeft - paddingRight) / data.length) + 4;
            const y = height - paddingBottom - barHeight;

            return (
              <React.Fragment key={idx}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={4}
                  fill={COLORS.secondary}
                />
                <SvgText
                  x={x + barWidth / 2}
                  y={height - 4}
                  fontSize="8"
                  fontWeight="600"
                  fill={COLORS.textSecondary}
                  textAnchor="middle"
                >
                  {getDayName(entry.date)}
                </SvgText>
                <SvgText
                  x={x + barWidth / 2}
                  y={y - 4}
                  fontSize="8"
                  fontWeight="700"
                  fill={COLORS.textPrimary}
                  textAnchor="middle"
                >
                  {entry.activeCalories}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  };

  // 5. 7-Day Medication Adherence Chart
  const renderAdherenceChart = () => {
    const data = weeklyHistory;
    if (!data || data.length === 0) return null;

    const width = Dimensions.get('window').width - 72;
    const height = 120;
    const paddingBottom = 20;
    const paddingTop = 15;
    const paddingLeft = 10;
    const paddingRight = 10;

    const maxAdherence = 100;
    const barWidth = (width - paddingLeft - paddingRight) / data.length - 8;

    return (
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <Svg width={width} height={height}>
          <Line
            x1={paddingLeft}
            y1={height - paddingBottom - ((80 / 100) * (height - paddingTop - paddingBottom))}
            x2={width - paddingRight}
            y2={height - paddingBottom - ((80 / 100) * (height - paddingTop - paddingBottom))}
            stroke={COLORS.border}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {data.map((entry, idx) => {
            const adherence = entry.medicationAdherence !== undefined ? entry.medicationAdherence : 100;
            const barHeight = (adherence / maxAdherence) * (height - paddingTop - paddingBottom);
            const x = paddingLeft + idx * ((width - paddingLeft - paddingRight) / data.length) + 4;
            const y = height - paddingBottom - barHeight;

            return (
              <React.Fragment key={idx}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(2, barHeight)}
                  rx={4}
                  fill={adherence >= 80 ? COLORS.primary : adherence >= 50 ? COLORS.secondary : COLORS.alert}
                />
                <SvgText
                  x={x + barWidth / 2}
                  y={height - 4}
                  fontSize="8"
                  fontWeight="600"
                  fill={COLORS.textSecondary}
                  textAnchor="middle"
                >
                  {getDayName(entry.date)}
                </SvgText>
                <SvgText
                  x={x + barWidth / 2}
                  y={y - 4}
                  fontSize="8"
                  fontWeight="700"
                  fill={COLORS.textPrimary}
                  textAnchor="middle"
                >
                  {adherence}%
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  };

  const sleepHours = biometricCore.sleepMinutes / 60;
  const targetSleepHours = 8;
  const sleepPercentage = Math.min(100, Math.round((sleepHours / targetSleepHours) * 100));
  const goalMetPercentage = Math.round((sleepPercentage + biometricCore.sleepConsistency) / 2);

  const calculateCorrelations = (): { sleepCorrelation: string; medAdherenceCorrelation: string; hasWarnings: boolean; isSleepWarning?: boolean; isMedsWarning?: boolean } => {
    if (moodLogs.length === 0) {
      return {
        sleepCorrelation: 'No mood data logged to calculate correlation.',
        hrCorrelation: 'No mood data logged to calculate correlation.',
        medAdherenceCorrelation: 'No mood data logged to calculate correlation.',
        hasWarnings: false,
      } as any;
    }

    let highMoodSleepSum = 0;
    let highMoodSleepCount = 0;
    let lowMoodSleepSum = 0;
    let lowMoodSleepCount = 0;

    moodLogs.forEach(mood => {
      const historyDay = weeklyHistory.find(h => h.date === mood.timestamp);
      if (historyDay) {
        if (mood.rating >= 7) {
          highMoodSleepSum += historyDay.sleepMinutes;
          highMoodSleepCount++;
        } else {
          lowMoodSleepSum += historyDay.sleepMinutes;
          lowMoodSleepCount++;
        }
      }
    });

    const avgHighSleep = highMoodSleepCount > 0 ? (highMoodSleepSum / highMoodSleepCount / 60).toFixed(1) : '7.5';
    const avgLowSleep = lowMoodSleepCount > 0 ? (lowMoodSleepSum / lowMoodSleepCount / 60).toFixed(1) : '5.8';

    let highMoodMedsSum = 0;
    let highMoodMedsCount = 0;
    let lowMoodMedsSum = 0;
    let lowMoodMedsCount = 0;

    moodLogs.forEach(mood => {
      const historyDay = weeklyHistory.find(h => h.date === mood.timestamp);
      if (historyDay) {
        if (mood.rating >= 7) {
          highMoodMedsSum += historyDay.medicationAdherence;
          highMoodMedsCount++;
        } else {
          lowMoodMedsSum += historyDay.medicationAdherence;
          lowMoodMedsCount++;
        }
      }
    });

    const avgHighMeds = highMoodMedsCount > 0 ? Math.round(highMoodMedsSum / highMoodMedsCount) : 100;
    const avgLowMeds = lowMoodMedsCount > 0 ? Math.round(lowMoodMedsSum / lowMoodMedsCount) : 50;

    const isSleepWarning = parseFloat(avgLowSleep) < 6.5;
    const isMedsWarning = avgLowMeds < 80;

    return {
      sleepCorrelation: `Average sleep on high mood days (rating >= 7) is ${avgHighSleep} hours, compared to ${avgLowSleep} hours on low mood days.`,
      medAdherenceCorrelation: `Medication adherence is ${avgHighMeds}% on high mood days, compared to ${avgLowMeds}% on low mood days.`,
      hasWarnings: isSleepWarning || isMedsWarning,
      isSleepWarning,
      isMedsWarning,
    };
  };

  const generateDoctorReport = (): string => {
    const todayStr = new Date().toLocaleDateString();
    let report = `========================================\n`;
    report += `SAFESCALE HEALTH CLINICIAN SUMMARY REPORT\n`;
    report += `Generated on: ${todayStr}\n`;
    report += `========================================\n\n`;

    report += `[Patient Profile]\n`;
    report += `Name: ${profile.name}\n`;
    report += `DOB: ${profile.dob}\n`;
    report += `Blood Type: ${profile.bloodType}\n`;
    report += `Height: ${profile.height} cm · Weight: ${profile.weight} kg\n`;
    report += `Organ Donor: ${profile.organDonor ? 'YES' : 'NO'}\n`;
    report += `Active Allergens: ${userAllergies.length > 0 ? userAllergies.join(', ') : 'None registered'}\n\n`;

    report += `[Recent Biometric Averages]\n`;
    report += `Resting Heart Rate: ${biometricCore.restingHeartRate > 0 ? `${biometricCore.restingHeartRate} bpm` : 'N/A'}\n`;
    report += `Average Steps: ${biometricCore.steps > 0 ? `${biometricCore.steps} steps` : 'N/A'}\n`;
    report += `Calorie Output: ${biometricCore.activeCalories > 0 ? `${biometricCore.activeCalories} kcal` : 'N/A'}\n`;
    report += `Health Stability Index: ${biometricCore.dailyStabilityScore > 0 ? `${biometricCore.dailyStabilityScore}%` : 'N/A'}\n\n`;

    report += `[Logged Vital Signs]\n`;
    if (vitalsLogs.length === 0) {
      report += `No vitals logs recorded.\n\n`;
    } else {
      vitalsLogs.slice(0, 5).forEach((v) => {
        report += `- ${v.timestamp}: BP ${v.systolicBP || '--'}/${v.diastolicBP || '--'} mmHg, Glucose ${v.bloodGlucose || '--'} mg/dL (${v.glucoseContext || 'General'}), SpO2 ${v.spo2 || '--'}%, Temp ${v.temperature || '--'}°F\n`;
      });
      report += `\n`;
    }

    report += `[Mental Health & Paced Breathing Logs]\n`;
    if (moodLogs.length === 0) {
      report += `No mood logs recorded.\n\n`;
    } else {
      moodLogs.slice(0, 5).forEach((m) => {
        report += `- ${m.timestamp}: Rating ${m.rating}/10, Stress: ${m.stressLevel}, Feelings: [${m.feelings.join(', ')}]\n`;
      });
      const corr = calculateCorrelations();
      report += `Correlation Insight: ${corr.sleepCorrelation}\n`;
      report += `Correlation Insight: ${corr.medAdherenceCorrelation}\n\n`;
    }

    report += `[Active Medication Schedule]\n`;
    if (medicationSchedule.length === 0) {
      report += `No medications scheduled.\n`;
    } else {
      medicationSchedule.forEach((med) => {
        report += `- ${med.name} (${med.dosage}) at ${med.time} (Stock remaining: ${med.stock !== undefined ? med.stock : 'N/A'})\n`;
      });
    }
    report += `\n`;

    report += `[Symptoms Logged Today]\n`;
    if (symptomLogs.length === 0) {
      report += `No symptoms logged today.\n`;
    } else {
      symptomLogs.forEach((log) => {
        report += `- ${log.type} (Severity: ${log.severity}/10) at ${log.timestamp}\n`;
      });
    }
    report += `\n`;

    report += `[Official Medical Records Vault]\n`;
    const immunizations = medicalRecords.filter(r => r.type === 'Immunization');
    const labResults = medicalRecords.filter(r => r.type === 'LabResult');
    const conditions = medicalRecords.filter(r => r.type === 'Condition');

    report += `Active Diagnoses:\n`;
    if (conditions.length === 0) {
      report += `  No clinical diagnoses imported.\n`;
    } else {
      conditions.forEach(c => report += `  - ${c.title} (${c.value}) · ${c.provider}\n`);
    }

    report += `Vaccination History:\n`;
    if (immunizations.length === 0) {
      report += `  No vaccination records imported.\n`;
    } else {
      immunizations.forEach(i => report += `  - ${i.title} (${i.value}) on ${i.date} · ${i.provider}\n`);
    }

    report += `Recent Lab Result Panels:\n`;
    if (labResults.length === 0) {
      report += `  No lab result panels imported.\n`;
    } else {
      labResults.forEach(l => report += `  - ${l.title} (${l.value}) · ${l.provider}\n`);
    }
    
    report += `\n========================================\n`;
    report += `End of Health Summary Report. SafeScale Health Inc.\n`;
    return report;
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
              No active health data was found. Use the **Home Tab** to sync health data, or enable Test Mode to load mock data.
            </Text>
          </View>
        ) : (
          /* Analytics Dashboard */
          <View style={{ gap: 16 }}>
            {/* Segmented SubTab Control */}
            <View style={{ flexDirection: 'row', backgroundColor: '#E8EDF0', borderRadius: 12, padding: 4 }}>
              <Pressable
                onPress={() => setActiveSubTab('Biometrics')}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: activeSubTab === 'Biometrics' ? COLORS.surface : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: activeSubTab === 'Biometrics' ? COLORS.primary : COLORS.textSecondary }}>
                  Biometrics Trend
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveSubTab('Vitals')}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: activeSubTab === 'Vitals' ? COLORS.surface : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: activeSubTab === 'Vitals' ? COLORS.primary : COLORS.textSecondary }}>
                  Vitals & Wellness
                </Text>
              </Pressable>
            </View>

            {activeSubTab === 'Biometrics' ? (
              <>
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
                  {biometricCore.dailyStabilityScore || 85}
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
                    {biometricCore.dailyStabilityScore >= 80 ? 'Excellent Index' : 'Active Tracking'}
                  </Text>
                </View>
              </View>
            </View>

            {/* 7-Day Stability Trend */}
            {weeklyHistory && weeklyHistory.length > 0 && (
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
                  Stability Trend (7 Days)
                </Text>
                {renderStabilityChart()}
              </View>
            )}

            {/* Resting Heart Rate Chart */}
            {biometricCore.historicalRHR && biometricCore.historicalRHR.length > 0 && (
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
            )}

            {/* 7-Day Steps Chart */}
            {weeklyHistory && weeklyHistory.length > 0 && (
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
                  Steps Progression
                </Text>
                {renderStepsChart()}
              </View>
            )}

            {/* 7-Day Active Calories Chart */}
            {weeklyHistory && weeklyHistory.length > 0 && (
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
                  Active Calories (kcal)
                </Text>
                {renderCaloriesChart()}
              </View>
            )}

            {/* Medication Adherence Chart */}
            {weeklyHistory && weeklyHistory.length > 0 && (
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
                  Medication Adherence Trend
                </Text>
                {renderAdherenceChart()}
              </View>
            )}

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
                    {biometricCore.sleepConsistency || 80}%
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Last Sleep</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginTop: 4 }}>
                    {biometricCore.sleepMinutes ? (biometricCore.sleepMinutes / 60).toFixed(1) : '7.5'} hrs
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Goal Met</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary, marginTop: 4 }}>
                    {goalMetPercentage || 85}%
                  </Text>
                </View>
              </View>
              </View>
            ) : (
              <>
                {/* ── Vitals & Trends View ── */}
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginTop: 4 }}>
                  Recorded Vital Signs
                </Text>
                
                {(() => {
                  if (vitalsLogs.length === 0) {
                    return (
                      <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: 24, borderStyle: 'dashed', borderWidth: 1.5, borderColor: COLORS.border }}>
                        <MaterialCommunityIcons name="heart-pulse" size={32} color={COLORS.textSecondary} style={{ marginBottom: 8 }} />
                        <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' }}>
                          No vitals recorded yet. Log blood pressure, glucose, and oxygen metrics on the Home tab.
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View style={{ gap: 12 }}>
                      {vitalsLogs.map((log) => {
                        let bpStatus = 'Normal';
                        let bpColor = COLORS.primary;
                        if (log.systolicBP && log.diastolicBP) {
                          if (log.systolicBP >= 140 || log.diastolicBP >= 90) {
                            bpStatus = 'Hypertension Stage 2';
                            bpColor = COLORS.alert;
                          } else if (log.systolicBP >= 130 || log.diastolicBP >= 80) {
                            bpStatus = 'Hypertension Stage 1';
                            bpColor = '#E88C30';
                          } else if (log.systolicBP >= 120) {
                            bpStatus = 'Elevated';
                            bpColor = '#F4C842';
                          }
                        }

                        let glucoseStatus = 'Normal';
                        let glucoseColor = COLORS.primary;
                        if (log.bloodGlucose) {
                          if (log.bloodGlucose > 140) {
                            glucoseStatus = 'High';
                            glucoseColor = COLORS.alert;
                          } else if (log.bloodGlucose < 70) {
                            glucoseStatus = 'Low (Hypo)';
                            glucoseColor = '#E88C30';
                          }
                        }

                        return (
                          <View key={log.id} style={{ backgroundColor: COLORS.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 5, borderLeftColor: bpColor }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: '700' }}>
                                {log.timestamp}
                              </Text>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <View style={{ backgroundColor: bpColor + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: bpColor }}>
                                    BP: {bpStatus}
                                  </Text>
                                </View>
                                {log.bloodGlucose && (
                                  <View style={{ backgroundColor: glucoseColor + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: glucoseColor }}>
                                      Sugar: {glucoseStatus}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                              {log.systolicBP && (
                                <View style={{ minWidth: 100 }}>
                                  <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Blood Pressure</Text>
                                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                                    {log.systolicBP}/{log.diastolicBP} <Text style={{ fontSize: 10, fontWeight: '500', color: COLORS.textSecondary }}>mmHg</Text>
                                  </Text>
                                </View>
                              )}
                              {log.bloodGlucose && (
                                <View style={{ minWidth: 100 }}>
                                  <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Glucose ({log.glucoseContext})</Text>
                                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                                    {log.bloodGlucose} <Text style={{ fontSize: 10, fontWeight: '500', color: COLORS.textSecondary }}>mg/dL</Text>
                                  </Text>
                                </View>
                              )}
                              {log.spo2 && (
                                <View style={{ minWidth: 60 }}>
                                  <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Oxygen (SpO2)</Text>
                                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                                    {log.spo2}%
                                  </Text>
                                </View>
                              )}
                              {log.temperature && (
                                <View style={{ minWidth: 60 }}>
                                  <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Temp</Text>
                                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                                    {log.temperature}°F
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                {/* ── Mood & Biometric Correlation Card ── */}
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
                    marginTop: 16,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                    Mood-Biometric Correlations
                  </Text>
                  
                  {moodLogs.length === 0 ? (
                    <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' }}>
                      No mood logs recorded yet. Add mood entries on the Home tab to calculate correlations.
                    </Text>
                  ) : (() => {
                    const corr = calculateCorrelations();
                    return (
                      <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#D6EFF4', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name="sleep" size={18} color={COLORS.secondary} />
                          </View>
                          <Text style={{ fontSize: 12, color: COLORS.textPrimary, flex: 1, lineHeight: 18, fontWeight: '600' }}>
                            {corr.sleepCorrelation}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#D5F1E2', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name="pill" size={18} color={COLORS.primary} />
                          </View>
                          <Text style={{ fontSize: 12, color: COLORS.textPrimary, flex: 1, lineHeight: 18, fontWeight: '600' }}>
                            {corr.medAdherenceCorrelation}
                          </Text>
                        </View>

                        {corr.hasWarnings && (
                          <View
                            style={{
                              backgroundColor: COLORS.alertContainer,
                              borderWidth: 1.5,
                              borderColor: COLORS.alert,
                              borderRadius: 16,
                              padding: 12,
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginTop: 8,
                            }}
                          >
                            <MaterialCommunityIcons name="alert-decagram" size={22} color={COLORS.alert} style={{ marginRight: 8 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.alert}>
                                Negative Correlation Detected
                              </Text>
                              <Text style={{ fontSize: 11, color: COLORS.textPrimary, marginTop: 2, lineHeight: 15 }}>
                                {corr.isSleepWarning ? "Short sleep cycles (<6.5 hrs) correlate strongly with low mood ratings. " : ""}
                                {corr.isMedsWarning ? "Missed medication doses correspond to lower stability scores and mood drops." : ""}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })()}
                </View>
              </>
            )}

            {/* Generate Report Card */}
            <Pressable
              onPress={() => setIsReportOpen(true)}
              style={({ pressed }) => ({
                backgroundColor: COLORS.primary,
                borderRadius: 24,
                padding: 20,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                shadowColor: '#1A2129',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 3,
                opacity: pressed ? 0.9 : 1,
                marginTop: 16,
              })}
            >
              <MaterialCommunityIcons name="file-chart" size={22} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', marginLeft: 8, fontSize: 15 }}>
                Generate Clinician Health Report
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Clinician Health Report Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isReportOpen}
        onRequestClose={() => setIsReportOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsReportOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '90%',
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                Clinician Health Summary
              </Text>
              <Pressable onPress={() => setIsReportOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 }}>
                Verify the generated report information below. Tapping share allows sending this summary to your doctor or care team.
              </Text>

              <View
                style={{
                  backgroundColor: COLORS.background,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                    color: COLORS.textPrimary,
                    lineHeight: 16,
                  }}
                >
                  {generateDoctorReport()}
                </Text>
              </View>

              <Pressable
                onPress={async () => {
                  try {
                    const reportText = generateDoctorReport();
                    await Share.share({
                      message: reportText,
                    });
                  } catch (e) {
                    Alert.alert('Sharing Failed', 'Could not open share menu.');
                  }
                }}
                style={({ pressed }) => ({
                  backgroundColor: COLORS.primary,
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <MaterialCommunityIcons name="share-variant" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                  Share Report Document
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default AnalyticsScreen;
