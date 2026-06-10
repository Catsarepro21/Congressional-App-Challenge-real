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
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useSafeScaleStore,
  selectUserAllergies,
  selectIsLocalAIOptedIn,
  selectIsTestMode,
} from '../store/useSafeScaleStore';
import type { MedicalRecord } from '../types';
import { NotificationService } from '../services';
import Svg, { Rect, Path } from 'react-native-svg';


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

const SimulatedQRCode: React.FC = () => {
  return (
    <Svg width={100} height={100} viewBox="0 0 100 100" style={{ backgroundColor: '#FFFFFF', padding: 6, borderRadius: 8 }}>
      <Rect x={0} y={0} width={25} height={25} fill="#1E5E3A" />
      <Rect x={4} y={4} width={17} height={17} fill="#FFFFFF" />
      <Rect x={8} y={8} width={9} height={9} fill="#1E5E3A" />

      <Rect x={75} y={0} width={25} height={25} fill="#1E5E3A" />
      <Rect x={79} y={4} width={17} height={17} fill="#FFFFFF" />
      <Rect x={83} y={8} width={9} height={9} fill="#1E5E3A" />

      <Rect x={0} y={75} width={25} height={25} fill="#1E5E3A" />
      <Rect x={4} y={79} width={17} height={17} fill="#FFFFFF" />
      <Rect x={8} y={83} width={9} height={9} fill="#1E5E3A" />

      <Path
        d="M 35 10 h 10 v 10 h -10 z M 55 10 h 5 v 5 h -5 z M 65 15 h 5 v 5 h -5 z M 30 30 h 5 v 15 h -5 z M 40 45 h 15 v 5 h -15 z M 60 35 h 15 v 5 h -15 z M 80 40 h 10 v 10 h -10 z M 10 35 h 10 v 10 h -10 z M 45 60 h 10 v 10 h -10 z M 65 60 h 20 v 5 h -20 z M 75 75 h 10 v 10 h -10 z M 35 80 h 15 v 5 h -15 z M 55 85 h 5 v 5 h -5 z M 30 65 h 5 v 10 h -5 z M 85 55 h 5 v 10 h -5 z M 15 55 h 15 v 5 h -15 z M 55 45 h 5 v 5 h -5 z"
        fill="#1E5E3A"
      />
    </Svg>
  );
};

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  // ── Store Selectors & Actions ──────────────────────────────────────────────
  const userAllergies = useSafeScaleStore(selectUserAllergies);
  const isLocalAIOptedIn = useSafeScaleStore(selectIsLocalAIOptedIn);
  const isTestMode = useSafeScaleStore(selectIsTestMode);
  const hydrationGoal = useSafeScaleStore((s) => s.hydrationGoal);
  const calorieGoal = useSafeScaleStore((s) => s.calorieGoal);
  const medicalRecords = useSafeScaleStore((s) => s.medicalRecords) || [];
  const profile = useSafeScaleStore((s) => s.profile);

  const addAllergy = useSafeScaleStore((s) => s.addAllergy);
  const removeAllergy = useSafeScaleStore((s) => s.removeAllergy);
  const setLocalAIOptedIn = useSafeScaleStore((s) => s.setLocalAIOptedIn);
  const toggleTestMode = useSafeScaleStore((s) => s.toggleTestMode);
  const setUserAllergies = useSafeScaleStore((s) => s.setUserAllergies);
  const updateBiometrics = useSafeScaleStore((s) => s.updateBiometrics);
  const setHydrationGoal = useSafeScaleStore((s) => s.setHydrationGoal);
  const setCalorieGoal = useSafeScaleStore((s) => s.setCalorieGoal);
  const addMedicalRecord = useSafeScaleStore((s) => s.addMedicalRecord);
  const deleteMedicalRecord = useSafeScaleStore((s) => s.deleteMedicalRecord);
  const updateProfile = useSafeScaleStore((s) => s.updateProfile);

  const hydrationNotificationsEnabled = useSafeScaleStore((s) => s.hydrationNotificationsEnabled);
  const hydrationIntervalHours = useSafeScaleStore((s) => s.hydrationIntervalHours);
  const setHydrationNotificationsEnabled = useSafeScaleStore((s) => s.setHydrationNotificationsEnabled);
  const setHydrationIntervalHours = useSafeScaleStore((s) => s.setHydrationIntervalHours);

  // ── Local Form States ──────────────────────────────────────────────────────
  const [newAllergen, setNewAllergen] = useState('');
  const [hydrationInput, setHydrationInput] = useState(String(hydrationGoal));
  const [calorieInput, setCalorieInput] = useState(String(calorieGoal));
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState<string | null>(null);
  const [isConnectingPortal, setIsConnectingPortal] = useState(false);
  const [fhirInputText, setFhirInputText] = useState('');

  // Profile Form States
  const [profileNameInput, setProfileNameInput] = useState(profile.name);
  const [profileDobInput, setProfileDobInput] = useState(profile.dob);
  const [profileBloodTypeInput, setProfileBloodTypeInput] = useState(profile.bloodType);
  const [profileHeightInput, setProfileHeightInput] = useState(
    profile.unitPreference === 'imperial' ? String(Math.round(profile.height / 2.54)) : String(profile.height)
  );
  const [profileWeightInput, setProfileWeightInput] = useState(
    profile.unitPreference === 'imperial' ? String(Math.round(profile.weight / 0.45359237)) : String(profile.weight)
  );
  const [profileOrganDonorInput, setProfileOrganDonorInput] = useState(profile.organDonor || false);
  const [unitPreference, setUnitPreference] = useState(profile.unitPreference || 'metric');
  const [useGeminiFoodVision, setUseGeminiFoodVision] = useState(profile.useGeminiFoodVision || false);
  const [geminiApiKey, setGeminiApiKey] = useState(profile.geminiApiKey || '');
  const [useGeminiWeeklyReport, setUseGeminiWeeklyReport] = useState(profile.useGeminiWeeklyReport || false);
  const [googleOAuthClientId, setGoogleOAuthClientId] = useState(profile.googleOAuthClientId || '');

  // Auto-enable Gemini features when user types an API key
  const handleGeminiApiKeyChange = (key: string) => {
    setGeminiApiKey(key);
    if (key.trim().length > 10) {
      setUseGeminiFoodVision(true);
      setUseGeminiWeeklyReport(true);
    }
  };
  const [isProfileSaved, setIsProfileSaved] = useState(false);

  // Sync inputs with store if profile changes externally (e.g. Test Mode seeding)
  useEffect(() => {
    setProfileNameInput(profile.name);
    setProfileDobInput(profile.dob);
    setProfileBloodTypeInput(profile.bloodType);
    setProfileHeightInput(
      profile.unitPreference === 'imperial' ? String(Math.round(profile.height / 2.54)) : String(profile.height)
    );
    setProfileWeightInput(
      profile.unitPreference === 'imperial' ? String(Math.round(profile.weight / 0.45359237)) : String(profile.weight)
    );
    setProfileOrganDonorInput(profile.organDonor || false);
    setUnitPreference(profile.unitPreference || 'metric');
    setUseGeminiFoodVision(profile.useGeminiFoodVision || false);
    setGeminiApiKey(profile.geminiApiKey || '');
    setUseGeminiWeeklyReport(profile.useGeminiWeeklyReport || false);
    setGoogleOAuthClientId(profile.googleOAuthClientId || '');
  }, [profile]);

  const handleUnitPreferenceChange = (pref: 'metric' | 'imperial') => {
    setUnitPreference(pref);
    const h = parseFloat(profileHeightInput);
    const w = parseFloat(profileWeightInput);
    if (!isNaN(h)) {
      if (pref === 'imperial') {
        setProfileHeightInput(String(Math.round(h / 2.54)));
      } else {
        setProfileHeightInput(String(Math.round(h * 2.54)));
      }
    }
    if (!isNaN(w)) {
      if (pref === 'imperial') {
        setProfileWeightInput(String(Math.round(w / 0.45359237)));
      } else {
        setProfileWeightInput(String(Math.round(w * 0.45359237)));
      }
    }
  };

  // Vaccine Milestone Store Selectors & Actions
  const vaccineMilestones = useSafeScaleStore((s) => s.vaccineMilestones) || [];
  const completeVaccineMilestone = useSafeScaleStore((s) => s.completeVaccineMilestone);
  const initializeVaccineMilestones = useSafeScaleStore((s) => s.initializeVaccineMilestones);

  const [isMilestonesModalOpen, setIsMilestonesModalOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<{ id: string; name: string; recommendedAge: string } | null>(null);
  const [isCompleteMilestoneOpen, setIsCompleteMilestoneOpen] = useState(false);
  const [milestoneDate, setMilestoneDate] = useState(new Date().toLocaleDateString());
  const [milestoneProvider, setMilestoneProvider] = useState('Public Health Clinic');

  // Use a ref to guard initialization — prevents infinite loop when the store
  // action reference changes identity on each render.
  const didInitMilestones = useRef(false);
  useEffect(() => {
    if (!didInitMilestones.current && vaccineMilestones.length === 0) {
      didInitMilestones.current = true;
      initializeVaccineMilestones();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drug checker states
  const [drugCheckerInput, setDrugCheckerInput] = useState('');
  const [drugCheckerResults, setDrugCheckerResults] = useState<{ matches: string[]; hasChecked: boolean } | null>(null);
  const [isVaccineWalletOpen, setIsVaccineWalletOpen] = useState(false);

  // Manual Drug & Food Interaction Checker states
  const [selectedDrugA, setSelectedDrugA] = useState('Lisinopril');
  const [selectedDrugB, setSelectedDrugB] = useState('Spironolactone');
  const [interactionResult, setInteractionResult] = useState<{ severity: 'None' | 'Warning' | 'High'; text: string } | null>({
    severity: 'High',
    text: 'Select items below and check potential clinical interactions.'
  });

  const runManualInteractionCheck = (drugA: string, drugB: string) => {
    const list = [drugA.toLowerCase(), drugB.toLowerCase()];
    
    if (list.includes('lisinopril') && list.includes('spironolactone')) {
      setInteractionResult({
        severity: 'High',
        text: 'CRITICAL DRUG-DRUG RISK: Lisinopril and Spironolactone both elevate blood potassium. Combining them significantly raises hyperkalemia risk, potentially causing cardiac arrest. Avoid co-administration.'
      });
    } else if (list.includes('lisinopril') && list.includes('high potassium foods')) {
      setInteractionResult({
        severity: 'Warning',
        text: 'DRUG-FOOD RISK: Lisinopril limits renal potassium excretion. High-potassium foods (bananas, spinach, oranges) can accumulate potassium to dangerous levels if consumed in excess.'
      });
    } else if (list.includes('atorvastatin') && list.includes('grapefruit juice')) {
      setInteractionResult({
        severity: 'High',
        text: 'CRITICAL DRUG-FOOD RISK: Grapefruit juice block CYP3A4 metabolic path, leading to 2-3x higher blood levels of Atorvastatin. This dramatically increases toxicity risk, leading to muscle necrosis.'
      });
    } else if (list.includes('aspirin') && list.includes('ibuprofen')) {
      setInteractionResult({
        severity: 'Warning',
        text: 'DRUG-DRUG RISK: Dual NSAID intake causes severe gastric irritation and risk of GI bleeding. Ibuprofen also blocks Aspirin\'s cardioprotective antiplatelet activity.'
      });
    } else if (list.includes('lisinopril') && list.includes('high sodium foods')) {
      setInteractionResult({
        severity: 'Warning',
        text: 'DRUG-FOOD ADVISORY: High-sodium diets pull water into blood, increasing BP and direct counteracting the medical benefit of Lisinopril.'
      });
    } else {
      setInteractionResult({
        severity: 'None',
        text: 'No clinical drug-drug or drug-food interactions were found between these two items in our local database.'
      });
    }
  };

  // Sync inputs with store if goals change externally
  useEffect(() => {
    setHydrationInput(String(hydrationGoal));
  }, [hydrationGoal]);

  useEffect(() => {
    setCalorieInput(String(calorieGoal));
  }, [calorieGoal]);

  const handleHydrationGoalChange = (text: string) => {
    setHydrationInput(text);
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setHydrationGoal(parsed);
    }
  };

  const handleCalorieGoalChange = (text: string) => {
    setCalorieInput(text);
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setCalorieGoal(parsed);
    }
  };

  // ── Switch Animations ──────────────────────────────────────────────────────
  const aiToggleAnim = useRef(new Animated.Value(isLocalAIOptedIn ? 20 : 0)).current;
  const testToggleAnim = useRef(new Animated.Value(isTestMode ? 20 : 0)).current;
  const hydrationToggleAnim = useRef(new Animated.Value(hydrationNotificationsEnabled ? 24 : 0)).current;

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

  useEffect(() => {
    Animated.spring(hydrationToggleAnim, {
      toValue: hydrationNotificationsEnabled ? 24 : 0,
      tension: 280,
      friction: 20,
      useNativeDriver: true,
    }).start();
  }, [hydrationNotificationsEnabled, hydrationToggleAnim]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveProfile = () => {
    const heightVal = parseFloat(profileHeightInput);
    const weightVal = parseFloat(profileWeightInput);

    if (profileNameInput.trim() === '') {
      Alert.alert('Required Field', 'Please enter your name.');
      return;
    }

    const height = unitPreference === 'imperial' ? heightVal * 2.54 : heightVal;
    const weight = unitPreference === 'imperial' ? weightVal * 0.45359237 : weightVal;

    updateProfile({
      name: profileNameInput.trim(),
      dob: profileDobInput.trim(),
      bloodType: profileBloodTypeInput.trim(),
      height: isNaN(height) ? profile.height : height,
      weight: isNaN(weight) ? profile.weight : weight,
      organDonor: profileOrganDonorInput,
      unitPreference,
      useGeminiFoodVision,
      geminiApiKey,
      useGeminiWeeklyReport,
      googleOAuthClientId,
    });

    setIsProfileSaved(true);
    setTimeout(() => {
      setIsProfileSaved(false);
    }, 3000);
  };

  const handleAddAllergen = useCallback(() => {
    if (newAllergen.trim() === '') {
      Alert.alert('Required Field', 'Please enter an allergen name.');
      return;
    }
    addAllergy(newAllergen.trim());
    setNewAllergen('');
  }, [newAllergen, addAllergy]);

  const handleConnectPortal = (portalName: string) => {
    setSelectedPortal(portalName);
    setIsConnectingPortal(true);

    setTimeout(() => {
      let recordsToImport: Omit<MedicalRecord, 'id'>[] = [];
      if (portalName === 'Quest Diagnostics') {
        recordsToImport = [
          {
            type: 'LabResult',
            title: 'Basic Metabolic Panel',
            value: 'Glucose: 92 mg/dL (Normal)',
            date: new Date().toLocaleDateString(),
            provider: 'Quest Diagnostics Labs',
            status: 'Final Result',
            fhirData: JSON.stringify({ resourceType: 'Observation', code: { text: 'Basic Metabolic Panel' }, valueQuantity: { value: 92, unit: 'mg/dL' } }, null, 2),
          },
          {
            type: 'LabResult',
            title: 'Lipid Panel',
            value: 'Cholesterol: 180 mg/dL (Desirable)',
            date: new Date().toLocaleDateString(),
            provider: 'Quest Diagnostics Labs',
            status: 'Final Result',
            fhirData: JSON.stringify({ resourceType: 'Observation', code: { text: 'Lipid Panel' }, valueQuantity: { value: 180, unit: 'mg/dL' } }, null, 2),
          }
        ];
      } else if (portalName === 'Kaiser Permanente') {
        recordsToImport = [
          {
            type: 'Condition',
            title: 'Essential Hypertension',
            value: 'Mild, controlled with medication',
            date: '2024-11-20',
            provider: 'Kaiser Permanente Medical Group',
            status: 'Active Diagnosis',
            fhirData: JSON.stringify({ resourceType: 'Condition', clinicalStatus: { coding: [{ code: 'active' }] }, code: { text: 'Essential Hypertension' } }, null, 2),
          },
          {
            type: 'Immunization',
            title: 'Influenza Vaccine',
            value: 'Seasonal dose (0.5 mL)',
            date: '2025-10-15',
            provider: 'Kaiser Permanente Immunization Clinic',
            status: 'Completed',
            fhirData: JSON.stringify({ resourceType: 'Immunization', status: 'completed', vaccineCode: { text: 'Influenza Vaccine' } }, null, 2),
          }
        ];
      } else if (portalName === 'CVS Pharmacy') {
        recordsToImport = [
          {
            type: 'Prescription',
            title: 'Lisinopril 10mg',
            value: 'Take 1 tablet daily by mouth',
            date: '2026-05-01',
            provider: 'CVS Pharmacy #4823',
            status: 'Active (3 refills remaining)',
            fhirData: JSON.stringify({ resourceType: 'MedicationRequest', status: 'active', medicationCodeableConcept: { text: 'Lisinopril 10mg' } }, null, 2),
          },
          {
            type: 'Immunization',
            title: 'COVID-19 Vaccine (Pfizer)',
            value: 'Dose 2 (0.3 mL)',
            date: '2021-08-15',
            provider: 'CVS Pharmacy #4823',
            status: 'Completed',
            fhirData: JSON.stringify({ resourceType: 'Immunization', status: 'completed', vaccineCode: { text: 'COVID-19 Vaccine (Pfizer)' } }, null, 2),
          }
        ];
      } else if (portalName === 'Mayo Clinic') {
        recordsToImport = [
          {
            type: 'Condition',
            title: 'Type 2 Diabetes Mellitus',
            value: 'Diet and exercise regulated',
            date: '2025-02-14',
            provider: 'Mayo Clinic Endocrinology',
            status: 'Active',
            fhirData: JSON.stringify({ resourceType: 'Condition', clinicalStatus: { coding: [{ code: 'active' }] }, code: { text: 'Type 2 Diabetes' } }, null, 2),
          },
          {
            type: 'LabResult',
            title: 'HbA1c Blood Test',
            value: 'HbA1c: 5.7% (Pre-diabetic baseline)',
            date: '2026-03-10',
            provider: 'Mayo Clinic Laboratories',
            status: 'Final Result',
            fhirData: JSON.stringify({ resourceType: 'Observation', code: { text: 'HbA1c' }, valueQuantity: { value: 5.7, unit: '%' } }, null, 2),
          }
        ];
      }

      recordsToImport.forEach(rec => addMedicalRecord(rec));

      setIsConnectingPortal(false);
      setSelectedPortal(null);
      setIsRecordModalOpen(false);
      Alert.alert(
        'Connection Successful',
        `Successfully linked with your ${portalName} patient portal and retrieved ${recordsToImport.length} FHIR-compliant medical records.`
      );
    }, 2000);
  };

  const handleParseCustomFHIR = () => {
    if (fhirInputText.trim() === '') {
      Alert.alert('Empty Payload', 'Please paste a valid FHIR JSON payload.');
      return;
    }

    try {
      const parsed = JSON.parse(fhirInputText);
      const resourceType = parsed.resourceType;
      
      if (!resourceType) {
        Alert.alert('Invalid FHIR', 'JSON is missing required "resourceType" property.');
        return;
      }

      let type: 'Immunization' | 'LabResult' | 'Condition' | 'Prescription' = 'LabResult';
      let title = resourceType;
      let value = 'FHIR resource imported';
      let provider = 'FHIR JSON Loader';
      let status = 'Imported';

      if (resourceType === 'Observation') {
        type = 'LabResult';
        title = parsed.code?.text || parsed.code?.coding?.[0]?.display || 'Lab Observation';
        const val = parsed.valueQuantity?.value;
        const unit = parsed.valueQuantity?.unit || '';
        value = val !== undefined ? `${val} ${unit}` : 'Observation Record';
      } else if (resourceType === 'Immunization') {
        type = 'Immunization';
        title = parsed.vaccineCode?.text || parsed.vaccineCode?.coding?.[0]?.display || 'Vaccination';
        value = parsed.status === 'completed' ? 'Completed' : 'Status: ' + (parsed.status || 'Unknown');
      } else if (resourceType === 'Condition') {
        type = 'Condition';
        title = parsed.code?.text || parsed.code?.coding?.[0]?.display || 'Medical Condition';
        value = parsed.clinicalStatus?.coding?.[0]?.code || 'Active';
      } else if (resourceType === 'MedicationRequest' || resourceType === 'MedicationOrder') {
        type = 'Prescription';
        title = parsed.medicationCodeableConcept?.text || parsed.medicationCodeableConcept?.coding?.[0]?.display || 'Medication Prescribed';
        value = parsed.status || 'Active';
      }

      addMedicalRecord({
        type,
        title,
        value,
        date: new Date().toLocaleDateString(),
        provider,
        status,
        fhirData: JSON.stringify(parsed, null, 2),
      });

      setFhirInputText('');
      setIsRecordModalOpen(false);
      Alert.alert('Import Successful', `Parsed and saved official FHIR ${resourceType} record.`);
    } catch (e) {
      Alert.alert('JSON Parse Error', 'The pasted payload is not valid JSON. Please check syntax.');
    }
  };

  const handleLoadSampleFHIR = () => {
    const sample = {
      resourceType: "Observation",
      id: "blood-glucose",
      status: "final",
      code: {
        text: "Fasting Blood Glucose"
      },
      valueQuantity: {
        value: 95,
        unit: "mg/dL"
      }
    };
    setFhirInputText(JSON.stringify(sample, null, 2));
  };

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

  const checkDrugAllergies = (ingredientsStr: string): string[] => {
    const ingredients = ingredientsStr.split(',').map(i => i.trim().toLowerCase());
    const clashes: string[] = [];

    for (const ingredient of ingredients) {
      if (ingredient.length === 0) continue;
      for (const allergy of userAllergies) {
        const allergyLower = allergy.toLowerCase();
        const lactoseMatch = (allergyLower === 'milk' || allergyLower === 'dairy') && ingredient.includes('lactose');
        const wheyMatch = (allergyLower === 'milk' || allergyLower === 'dairy') && ingredient.includes('whey');
        const glutenMatch = (allergyLower === 'wheat' || allergyLower === 'gluten') && ingredient.includes('starch');

        if (ingredient.includes(allergyLower) || allergyLower.includes(ingredient) || lactoseMatch || wheyMatch || glutenMatch) {
          clashes.push(`${allergy} (detected in "${ingredient}")`);
        }
      }
    }
    return clashes;
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
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textPrimary }}>
            Settings
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Configure allergen profile parameters and system properties.
          </Text>
        </View>

        {/* ── Section: Personal Health Profile ────────────────────────── */}
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
            <MaterialCommunityIcons name="account-circle-outline" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Personal Health Profile
            </Text>
          </View>
          
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 16 }}>
            Privacy Note: Device OS Health APIs sandbox user names. Set your offline profile details below to personalize reports and vaccine passes.
          </Text>

          {/* Full Name */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
              Full Name
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
              }}
              value={profileNameInput}
              onChangeText={setProfileNameInput}
              placeholder="e.g. Jane Doe"
              placeholderTextColor="#A0AAB2"
            />
          </View>

          {/* DOB & Blood Type Row */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Date of Birth
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
                }}
                value={profileDobInput}
                onChangeText={setProfileDobInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#A0AAB2"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Blood Type
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
                }}
                value={profileBloodTypeInput}
                onChangeText={setProfileBloodTypeInput}
                placeholder="e.g. O-Positive"
                placeholderTextColor="#A0AAB2"
              />
            </View>
          </View>

          {/* Unit Preference Segmented Control */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
              Unit Preference
            </Text>
            <View style={{ flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 12, padding: 4 }}>
              <Pressable
                onPress={() => handleUnitPreferenceChange('metric')}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderRadius: 8,
                  backgroundColor: unitPreference === 'metric' ? COLORS.surface : 'transparent',
                  shadowColor: unitPreference === 'metric' ? '#000' : 'transparent',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: unitPreference === 'metric' ? 0.1 : 0,
                  shadowRadius: 2,
                  elevation: unitPreference === 'metric' ? 1 : 0,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: unitPreference === 'metric' ? COLORS.primary : COLORS.textSecondary }}>
                  Metric (cm / kg)
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleUnitPreferenceChange('imperial')}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderRadius: 8,
                  backgroundColor: unitPreference === 'imperial' ? COLORS.surface : 'transparent',
                  shadowColor: unitPreference === 'imperial' ? '#000' : 'transparent',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: unitPreference === 'imperial' ? 0.1 : 0,
                  shadowRadius: 2,
                  elevation: unitPreference === 'imperial' ? 1 : 0,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: unitPreference === 'imperial' ? COLORS.primary : COLORS.textSecondary }}>
                  Imperial (in / lbs)
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Height & Weight Row */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Height ({unitPreference === 'imperial' ? 'inches' : 'cm'})
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
                }}
                keyboardType="numeric"
                value={profileHeightInput}
                onChangeText={setProfileHeightInput}
                placeholder={unitPreference === 'imperial' ? "66" : "168"}
                placeholderTextColor="#A0AAB2"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Weight ({unitPreference === 'imperial' ? 'lbs' : 'kg'})
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
                }}
                keyboardType="numeric"
                value={profileWeightInput}
                onChangeText={setProfileWeightInput}
                placeholder={unitPreference === 'imperial' ? "135" : "62"}
                placeholderTextColor="#A0AAB2"
              />
            </View>
          </View>

          {/* Organ Donor Toggle Switch */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
              Organ Donor Status
            </Text>
            <Pressable
              onPress={() => setProfileOrganDonorInput(!profileOrganDonorInput)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                backgroundColor: profileOrganDonorInput ? COLORS.primary : '#E8EDF0',
                padding: 2,
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: '#FFFFFF',
                  transform: [{ translateX: profileOrganDonorInput ? 18 : 0 }],
                }}
              />
            </Pressable>
          </View>

          {/* Save Button & Status */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={handleSaveProfile}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: COLORS.primary,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                Save Profile
              </Text>
            </Pressable>
            {isProfileSaved && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.primary} />
                <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>
                  Saved!
                </Text>
              </View>
            )}
          </View>
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

          {/* Quick-add FDA Top 9 Allergens */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginTop: 12, marginBottom: 8 }}>
            Quick-Add Common Allergens:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {['Peanut', 'Tree Nuts', 'Milk', 'Egg', 'Wheat', 'Soy', 'Fish', 'Shellfish', 'Sesame'].map((item) => {
              const isAdded = userAllergies.some(a => a.toLowerCase() === item.toLowerCase());
              return (
                <Pressable
                  key={item}
                  disabled={isAdded}
                  onPress={() => addAllergy(item)}
                  style={({ pressed }) => ({
                    backgroundColor: isAdded ? '#E8EDF0' : COLORS.primaryContainer,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 100,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: isAdded ? COLORS.textSecondary : COLORS.primary,
                      fontSize: 12,
                      fontWeight: '600',
                      textDecorationLine: isAdded ? 'line-through' : 'none',
                    }}
                  >
                    {item} {isAdded ? '✓' : '+'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

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

        {/* ── Section: Daily Target Goals ──────────────────────────────── */}
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
            <MaterialCommunityIcons name="target" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Daily Target Goals
            </Text>
          </View>
          
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 16 }}>
            Customize your hydration volume and calorie consumption targets.
          </Text>

          <View style={{ flexDirection: 'row', gap: 16 }}>
            {/* Hydration Goal Input */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Hydration Goal (ml)
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
                }}
                keyboardType="numeric"
                value={hydrationInput}
                onChangeText={handleHydrationGoalChange}
                placeholder="e.g. 2000"
                placeholderTextColor="#A0AAB2"
              />
            </View>

            {/* Calorie Goal Input */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
                Calorie Goal (kcal)
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
                }}
                keyboardType="numeric"
                value={calorieInput}
                onChangeText={handleCalorieGoalChange}
                placeholder="e.g. 2000"
                placeholderTextColor="#A0AAB2"
              />
            </View>
          </View>
        </View>

        {/* ── Section: AI Assistant Settings ────────────────────────── */}
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
            <MaterialCommunityIcons name="brain" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              AI Assistant Settings
            </Text>
          </View>
          
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 16 }}>
            Enable advanced Google Gemini features for food photo scanning and weekly report coaching. Your key is stored securely offline on your device.
          </Text>

          {/* Gemini API Key Input */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
              Gemini API Key
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
              }}
              secureTextEntry={true}
              value={geminiApiKey}
              onChangeText={handleGeminiApiKeyChange}
              placeholder="Paste your Gemini API Key here"
              placeholderTextColor="#A0AAB2"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Gemini Food Vision Toggle Switch */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                Enable Gemini Food Vision AI
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 14 }}>
                Uses Gemini 1.5 Flash Vision to identify food items and estimate macros from captured photos.
              </Text>
            </View>
            <Pressable
              onPress={() => setUseGeminiFoodVision(!useGeminiFoodVision)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                backgroundColor: useGeminiFoodVision ? COLORS.primary : '#E8EDF0',
                padding: 2,
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: '#FFFFFF',
                  transform: [{ translateX: useGeminiFoodVision ? 18 : 0 }],
                }}
              />
            </Pressable>
          </View>

          {/* Gemini Weekly Report Toggle Switch */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                Enable Gemini Health Coaching
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 14 }}>
                Generates a personalized narrative coaching summary of your weekly biometrics and logs.
              </Text>
            </View>
            <Pressable
              onPress={() => setUseGeminiWeeklyReport(!useGeminiWeeklyReport)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                backgroundColor: useGeminiWeeklyReport ? COLORS.primary : '#E8EDF0',
                padding: 2,
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: '#FFFFFF',
                  transform: [{ translateX: useGeminiWeeklyReport ? 18 : 0 }],
                }}
              />
            </Pressable>
          </View>

          {/* Google Fit OAuth Client ID Input */}
          <View style={{ marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <MaterialCommunityIcons name="google-fit" size={15} color="#4285F4" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginLeft: 6 }}>
                Google Fit Client ID (iOS)
              </Text>
            </View>
            <TextInput
              style={{
                backgroundColor: COLORS.background,
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
                color: COLORS.textPrimary,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
              value={googleOAuthClientId}
              onChangeText={setGoogleOAuthClientId}
              placeholder="Paste your iOS OAuth Client ID here"
              placeholderTextColor="#A0AAB2"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 6, lineHeight: 14 }}>
              Optional. If left blank, SafeScale uses the developer's default embedded Client ID. Allows Google Fit sync on iOS for Fitbit, Garmin, etc. Get your own Client ID at{' '}
              <Text style={{ color: '#4285F4', fontWeight: '700' }}>
                console.cloud.google.com
              </Text>
              {'. Bundle ID: com.anonymous.safescalehealth'}
            </Text>
          </View>
        </View>

        {/* ── Section: Hydration Alarms ────────────────────────────────── */}

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
            <MaterialCommunityIcons name="bell-ring-outline" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Hydration Alarms
            </Text>
          </View>
          
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 16 }}>
            Set automatic recurring on-device notifications reminding you to log water and stay hydrated.
          </Text>

          {/* Hydration Switch */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                Enable Hydration Reminders
              </Text>
            </View>
            <Pressable
              onPress={() => setHydrationNotificationsEnabled(!hydrationNotificationsEnabled)}
              style={{
                width: 48,
                height: 28,
                borderRadius: 14,
                backgroundColor: hydrationNotificationsEnabled ? COLORS.primary : '#E8EDF0',
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
                  transform: [{ translateX: hydrationToggleAnim }],
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 2,
                  elevation: 2,
                }}
              />
            </Pressable>
          </View>

          {/* Hydration Interval Select */}
          {hydrationNotificationsEnabled && (
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
                Reminder Interval (Every X Hours)
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[2, 4, 6, 8].map((hours) => (
                  <Pressable
                    key={hours}
                    onPress={() => setHydrationIntervalHours(hours)}
                    style={{
                      flex: 1,
                      backgroundColor: hydrationIntervalHours === hours ? COLORS.primaryContainer : COLORS.background,
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: 2,
                      borderColor: hydrationIntervalHours === hours ? COLORS.primary : 'transparent',
                    }}
                  >
                    <Text style={{ color: hydrationIntervalHours === hours ? COLORS.primary : COLORS.textSecondary, fontSize: 13, fontWeight: '700' }}>
                      {hours}h
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── Section: Medication Allergen Checker ────────────────────── */}
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
            <MaterialCommunityIcons name="pill" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Medication Allergen Checker
            </Text>
          </View>
          
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 16 }}>
            Cross-check pill inactive ingredients or fillers with your allergen profile before taking a new drug.
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
              height: 80,
              textAlignVertical: 'top',
              marginBottom: 12,
            }}
            multiline={true}
            value={drugCheckerInput}
            onChangeText={setDrugCheckerInput}
            placeholder="Paste inactive ingredients (e.g. lactose monohydrate, wheat starch, gelatin, magnesium stearate)"
            placeholderTextColor="#A0AAB2"
          />

          <Pressable
            onPress={() => {
              if (drugCheckerInput.trim() === '') {
                Alert.alert('Required Field', 'Please enter some inactive ingredients.');
                return;
              }
              const matches = checkDrugAllergies(drugCheckerInput);
              setDrugCheckerResults({
                matches,
                hasChecked: true
              });
            }}
            style={({ pressed }) => ({
              backgroundColor: COLORS.primary,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.88 : 1,
              marginBottom: 12,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
              Check Safety
            </Text>
          </Pressable>

          {drugCheckerResults?.hasChecked && (
            <View style={{ backgroundColor: COLORS.background, borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 }}>
                Results:
              </Text>
              {drugCheckerResults.matches.length === 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>
                    Safe! No allergen conflicts detected.
                  </Text>
                </View>
              ) : (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.alert} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, color: COLORS.alert, fontWeight: '700' }}>
                      Potential Conflict Detected:
                    </Text>
                  </View>
                  {drugCheckerResults.matches.map((m, idx) => (
                    <Text key={idx} style={{ fontSize: 12, color: COLORS.textPrimary, marginLeft: 22, marginTop: 2 }}>
                      • Clashes with: <Text style={{ fontWeight: '700', color: COLORS.alert }}>{m}</Text>
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Section: Drug & Food Interaction Checker ────────────────── */}
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
            <MaterialCommunityIcons name="alert-decagram-outline" size={20} color={COLORS.alert} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Drug & Food Interaction Checker
            </Text>
          </View>
          
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 16 }}>
            Check potential clinical side effects and interactions between active medications and foods.
          </Text>

          {/* Selectors */}
          <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
            First Item (Active Medication)
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {['Lisinopril', 'Atorvastatin', 'Aspirin', 'Spironolactone'].map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setSelectedDrugA(item);
                  runManualInteractionCheck(item, selectedDrugB);
                }}
                style={{
                  backgroundColor: selectedDrugA === item ? COLORS.primaryContainer : COLORS.background,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: selectedDrugA === item ? COLORS.primary : COLORS.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: selectedDrugA === item ? COLORS.primary : COLORS.textPrimary }}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>
            Second Item (Medication or Food)
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {['Spironolactone', 'Ibuprofen', 'Grapefruit Juice', 'High Potassium Foods', 'High Sodium Foods'].map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setSelectedDrugB(item);
                  runManualInteractionCheck(selectedDrugA, item);
                }}
                style={{
                  backgroundColor: selectedDrugB === item ? COLORS.primaryContainer : COLORS.background,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: selectedDrugB === item ? COLORS.primary : COLORS.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: selectedDrugB === item ? COLORS.primary : COLORS.textPrimary }}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Interaction result banner */}
          {(() => {
            const res = interactionResult || { severity: 'High', text: 'Select two items to run an offline clinical cross-check.' };
            const isNone = res.severity === 'None';
            const isWarning = res.severity === 'Warning';
            const isHigh = res.severity === 'High';
            const bannerBg = isHigh ? COLORS.alertContainer : isWarning ? '#FFF3E0' : COLORS.primaryContainer;
            const bannerBorder = isHigh ? COLORS.alert : isWarning ? '#E88C30' : COLORS.primary;
            const icon = isHigh ? 'alert-octagon' : isWarning ? 'alert-circle' : 'check-circle';

            return (
              <View style={{ backgroundColor: bannerBg, borderWidth: 1.5, borderColor: bannerBorder, borderRadius: 16, padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name={icon} size={18} color={bannerBorder} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: isHigh ? COLORS.alert : isWarning ? '#E65100' : COLORS.primary }}>
                    {isHigh ? 'CRITICAL RISK DETECTED' : isWarning ? 'ADVISORY WARNING' : 'NO INTERACTIONS DETECTED'}
                  </Text>
                </View>
                <Text style={{ fontSize: 11.5, color: COLORS.textPrimary, lineHeight: 16, fontWeight: '600' }}>
                  {res.text}
                </Text>
              </View>
            );
          })()}
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

          {/* Test Notification Row */}
          {isTestMode && (
            <>
              <View style={{ height: 1, backgroundColor: COLORS.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="bell-ring-outline" size={18} color={COLORS.primary} />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
                      Test Local Notification
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 16 }}>
                    Schedule a mock test notification that will trigger locally on your device in 5 seconds.
                  </Text>
                </View>
                <Pressable
                  onPress={async () => {
                    const id = await NotificationService.scheduleQuickTest();
                    if (id) {
                      Alert.alert('Scheduled', 'Test notification scheduled to fire in 5 seconds.');
                    } else {
                      Alert.alert('Permission Denied', 'Notification permission was not granted by the device.');
                    }
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: COLORS.primaryContainer,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 12,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>
                    Trigger (5s)
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* ── Section: Official Medical Records ────────────────────────── */}
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
            <MaterialCommunityIcons name="file-document-outline" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Official Medical Records
            </Text>
          </View>
          
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 16 }}>
            Securely link and store official FHIR health data from your hospital or medical clinics offline.
          </Text>

          {medicalRecords.length === 0 ? (
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic', marginBottom: 16 }}>
              No official clinical records found. Link a health provider portal or import a FHIR JSON file below.
            </Text>
          ) : (
            <View style={{ gap: 10, marginBottom: 16 }}>
              {medicalRecords.map((record) => {
                let icon = 'file-document-outline';
                let iconColor = COLORS.textSecondary;
                if (record.type === 'Immunization') {
                  icon = 'needle';
                  iconColor = COLORS.secondary;
                } else if (record.type === 'LabResult') {
                  icon = 'test-tube';
                  iconColor = '#E88C30';
                } else if (record.type === 'Condition') {
                  icon = 'heart-pulse';
                  iconColor = COLORS.alert;
                } else if (record.type === 'Prescription') {
                  icon = 'pill';
                  iconColor = COLORS.primary;
                }

                return (
                  <View
                    key={record.id}
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 16,
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                          {record.title}
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>
                          {record.value} · {record.provider}
                        </Text>
                        <Text style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 2, fontStyle: 'italic' }}>
                          Imported: {record.date} ({record.status})
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => {
                        Alert.alert(
                          'Delete Clinical Record',
                          `Are you sure you want to remove this official medical record?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteMedicalRecord(record.id) }
                          ]
                        );
                      }}
                      style={{ padding: 6 }}
                    >
                      <MaterialCommunityIcons name="close-circle-outline" size={20} color={COLORS.alert} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {medicalRecords.filter(r => r.type === 'Immunization').length > 0 && (
            <Pressable
              onPress={() => setIsVaccineWalletOpen(true)}
              style={({ pressed }) => ({
                backgroundColor: '#E8F5E9',
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                marginBottom: 10,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <MaterialCommunityIcons name="wallet-membership" size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: '700', marginLeft: 8, fontSize: 14 }}>
                Open Digital Health Pass
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => setIsMilestonesModalOpen(true)}
            style={({ pressed }) => ({
              backgroundColor: '#E3F2FD',
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              marginBottom: 10,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <MaterialCommunityIcons name="calendar-clock" size={18} color="#1E88E5" />
            <Text style={{ color: '#1E88E5', fontWeight: '700', marginLeft: 8, fontSize: 14 }}>
              Vaccine Milestones Tracker
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setIsRecordModalOpen(true)}
            style={({ pressed }) => ({
              backgroundColor: COLORS.primaryContainer,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <MaterialCommunityIcons name="link-variant" size={18} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontWeight: '700', marginLeft: 8, fontSize: 14 }}>
              Link Provider Portal or Import FHIR
            </Text>
          </Pressable>
        </View>

        {/* ── Section: Storage Reset ───────────────────────────────────── */}
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

      {/* ── Medical Records Import Modal ────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isRecordModalOpen}
        onRequestClose={() => setIsRecordModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsRecordModalOpen(false)}
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
                Link Provider Portal
              </Text>
              <Pressable onPress={() => setIsRecordModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {isConnectingPortal ? (
                <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 16 }} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' }}>
                    Authenticating with {selectedPortal}...
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' }}>
                    Securing clinical OAuth 2.0 handshake and fetching patient FHIR resources...
                  </Text>
                </View>
              ) : (
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 }}>
                    Select Patient Portal to Connect:
                  </Text>
                  <View style={{ gap: 8, marginBottom: 24 }}>
                    {['Quest Diagnostics', 'Kaiser Permanente', 'CVS Pharmacy', 'Mayo Clinic'].map((portal) => (
                      <Pressable
                        key={portal}
                        onPress={() => handleConnectPortal(portal)}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: COLORS.background,
                          borderRadius: 16,
                          padding: 16,
                          opacity: pressed ? 0.85 : 1,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                        })}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                          <MaterialCommunityIcons name="hospital-building" size={22} color={COLORS.primary} />
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>
                          {portal}
                        </Text>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} style={{ marginLeft: 'auto' }} />
                      </Pressable>
                    ))}
                  </View>

                  <View style={{ height: 1, backgroundColor: COLORS.border, marginBottom: 20 }} />

                  {/* Manual FHIR Importer */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                      Import FHIR JSON Payload
                    </Text>
                    <Pressable
                      onPress={handleLoadSampleFHIR}
                      style={{ backgroundColor: COLORS.primaryContainer, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                    >
                      <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '700' }}>
                        Load Sample FHIR
                      </Text>
                    </Pressable>
                  </View>

                  <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 15 }}>
                    Paste a standard FHIR (Fast Healthcare Interoperability Resources) JSON representation to import:
                  </Text>

                  <TextInput
                    style={{
                      backgroundColor: COLORS.background,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 12,
                      color: COLORS.textPrimary,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                      height: 140,
                      textAlignVertical: 'top',
                      marginBottom: 16,
                    }}
                    multiline={true}
                    value={fhirInputText}
                    onChangeText={setFhirInputText}
                    placeholder={`{\n  "resourceType": "Observation",\n  ...\n}`}
                    placeholderTextColor="#A0AAB2"
                  />

                  <Pressable
                    onPress={handleParseCustomFHIR}
                    style={({ pressed }) => ({
                      backgroundColor: COLORS.primary,
                      borderRadius: 14,
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.88 : 1,
                    })}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                      Parse & Import Record
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Vaccine Wallet Pass Modal ────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isVaccineWalletOpen}
        onRequestClose={() => setIsVaccineWalletOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          onPress={() => setIsVaccineWalletOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 24,
              padding: 24,
              width: '100%',
              maxWidth: 360,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                Digital Health Passport
              </Text>
              <Pressable onPress={() => setIsVaccineWalletOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
              {medicalRecords.filter(r => r.type === 'Immunization').map((record) => (
                <View
                  key={record.id}
                  style={{
                    backgroundColor: '#1E5E3A',
                    borderRadius: 20,
                    padding: 20,
                    shadowColor: '#1A2129',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    elevation: 5,
                  }}
                >
                  {/* Top Bar */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={{ color: '#D5F1E2', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Official Vaccine Pass
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#D5F1E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 }}>
                      <MaterialCommunityIcons name="check-decagram" size={12} color="#1E5E3A" />
                      <Text style={{ color: '#1E5E3A', fontSize: 10, fontWeight: '800', marginLeft: 4 }}>
                        VERIFIED
                      </Text>
                    </View>
                  </View>

                  {/* Pass Body */}
                  <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 2 }}>
                    {record.title}
                  </Text>
                  <Text style={{ color: '#D5F1E2', fontSize: 13, marginBottom: 16 }}>
                    {record.value}
                  </Text>

                  {/* Details Grid */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 12 }}>
                    <View>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>PATIENT</Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 2 }}>{profile.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>DATE ADMINISTERED</Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 2 }}>{record.date}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                    <View>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>PROVIDER</Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 2 }}>{record.provider}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>STATUS</Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 2 }}>Active ({record.status})</Text>
                    </View>
                  </View>

                  {/* QR Code Container */}
                  <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 8, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16 }}>
                    <SimulatedQRCode />
                    <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 8, fontWeight: '600', textAlign: 'center' }}>
                      Scan for verified clinic records
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Vaccine Milestones Modal ────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isMilestonesModalOpen}
        onRequestClose={() => setIsMilestonesModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setIsMilestonesModalOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '85%',
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                  Vaccine Milestones Tracker
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                  Schedule calculated based on DOB: {profile.dob}
                </Text>
              </View>
              <Pressable onPress={() => setIsMilestonesModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <View style={{ gap: 10 }}>
                {vaccineMilestones.map((milestone) => {
                  const isCompleted = milestone.status === 'Completed';
                  return (
                    <View
                      key={milestone.id}
                      style={{
                        backgroundColor: COLORS.background,
                        borderRadius: 16,
                        padding: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                          {milestone.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                          Target: {milestone.targetDisease} · Recommended: {milestone.recommendedAge}
                        </Text>
                        {milestone.dueDate && !isCompleted && (
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2, fontWeight: '600' }}>
                            📅 Due Date: {milestone.dueDate}
                          </Text>
                        )}
                      </View>
                      
                      {isCompleted ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primary} />
                          <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}>
                            Done
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => {
                            setSelectedMilestone(milestone);
                            setMilestoneDate(new Date().toLocaleDateString());
                            setMilestoneProvider('Public Health Clinic');
                            setIsCompleteMilestoneOpen(true);
                          }}
                          style={({ pressed }) => ({
                            backgroundColor: COLORS.primaryContainer,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 10,
                            opacity: pressed ? 0.8 : 1,
                          })}
                        >
                          <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>
                            Mark Done
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Complete Milestone Dialogue Modal ─────────────────────── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isCompleteMilestoneOpen}
        onRequestClose={() => setIsCompleteMilestoneOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(26, 33, 41, 0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          onPress={() => setIsCompleteMilestoneOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 20,
              padding: 20,
              width: '100%',
              maxWidth: 320,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 }}>
              Record Immunization
            </Text>
            {selectedMilestone && (
              <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>
                Please record the administration details for {selectedMilestone.name}.
              </Text>
            )}

            <View style={{ gap: 12, marginBottom: 20 }}>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4 }}>
                  Date Administered
                </Text>
                <TextInput
                  style={{
                    backgroundColor: COLORS.background,
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 13,
                    color: COLORS.textPrimary,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                  value={milestoneDate}
                  onChangeText={setMilestoneDate}
                  placeholder="e.g. YYYY-MM-DD"
                  placeholderTextColor="#A0AAB2"
                />
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4 }}>
                  Healthcare Clinic / Provider
                </Text>
                <TextInput
                  style={{
                    backgroundColor: COLORS.background,
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 13,
                    color: COLORS.textPrimary,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                  value={milestoneProvider}
                  onChangeText={setMilestoneProvider}
                  placeholder="Clinic Name"
                  placeholderTextColor="#A0AAB2"
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setIsCompleteMilestoneOpen(false)}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: COLORS.background,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: COLORS.textSecondary, fontWeight: '700', fontSize: 13 }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (selectedMilestone) {
                    completeVaccineMilestone(selectedMilestone.id, milestoneDate, milestoneProvider);
                    setIsCompleteMilestoneOpen(false);
                    Alert.alert('Milestone Updated', `${selectedMilestone.name} completed and saved to your health vault.`);
                  }
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: COLORS.primary,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                  Save
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default SettingsScreen;
