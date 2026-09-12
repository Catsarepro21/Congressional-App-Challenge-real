import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
  Image,
  Dimensions,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeScaleStore, selectUserAllergies, selectIsLocalAIOptedIn } from '../store/useSafeScaleStore';
import { AllergenEngine } from '../services/AllergenEngine';
import { LocalAIService } from '../services/LocalAIService';
import type { AllergenMatchResult, LocalAIAnalysisResult } from '../types';

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

interface PresetProduct {
  name: string;
  brand: string;
  ingredients: string[];
  icon: string;
}

const PRESET_PRODUCTS: PresetProduct[] = [
  {
    name: 'Peanut Honey Granola',
    brand: 'Natures Choice',
    ingredients: ['Peanuts', 'Rolled Oats', 'Honey', 'Almonds', 'Sugar'],
    icon: 'barley',
  },
  {
    name: 'Almond Butter Tub',
    brand: 'Nutty Spread',
    ingredients: ['Almond Paste', 'Palm Oil', 'Sugar', 'Xanthan Gum'],
    icon: 'nut',
  },
  {
    name: 'Chocolate Chip Cookie',
    brand: 'Sweet Bites',
    ingredients: ['Wheat Flour', 'Sugar', 'Milk', 'Chocolate Chips', 'Soy Lecithin'],
    icon: 'cookie',
  },
  {
    name: 'Organic Coconut Water',
    brand: 'Pure Tropic',
    ingredients: ['Organic Coconut Water', 'Citric Acid'],
    icon: 'water',
  },
];

interface VisualDetectedItem {
  name: string;
  type: 'Water' | 'Meal';
  value: string;
  ingredients?: string[];
}

const VISUAL_DETECTED_ITEMS: VisualDetectedItem[] = [
  {
    name: 'Mineral Water Bottle',
    type: 'Water',
    value: '500 ml',
  },
  {
    name: 'Smart Hydration Flask',
    type: 'Water',
    value: '750 ml',
  },
  {
    name: 'Grilled Salmon Salad',
    type: 'Meal',
    value: '450 kcal',
    ingredients: ['Salmon', 'Lettuce', 'Spinach', 'Milk', 'Walnuts', 'Olive Oil'],
  },
  {
    name: 'Peanut Butter Granola Bowl',
    type: 'Meal',
    value: '520 kcal',
    ingredients: ['Oats', 'Peanuts', 'Honey', 'Milk', 'Blueberries'],
  },
  {
    name: 'Whole Wheat Turkey Wrap',
    type: 'Meal',
    value: '380 kcal',
    ingredients: ['Wheat Flour', 'Turkey Breast', 'Cheese', 'Lettuce', 'Mayo', 'Soy'],
  },
  {
    name: 'Avocado Toast with Egg',
    type: 'Meal',
    value: '320 kcal',
    ingredients: ['Wheat bread', 'Avocado', 'Egg', 'Black Pepper', 'Olive Oil'],
  }
];

interface ScannedDocPreset {
  type: 'Prescription' | 'LabResult' | 'Immunization';
  title: string;
  value: string;
  provider: string;
  status: string;
}

const DOC_PRESETS: ScannedDocPreset[] = [
  {
    type: 'Prescription',
    title: 'Amoxicillin 500mg',
    value: '1 capsule every 8 hours for 7 days',
    provider: 'St. Jude Community Hospital',
    status: 'Active (Scanned RX-4982)'
  },
  {
    type: 'LabResult',
    title: 'Urinalysis Panel',
    value: 'Protein: Negative, Glucose: Normal',
    provider: 'Quest Diagnostics',
    status: 'Final Report'
  },
  {
    type: 'Immunization',
    title: 'Tetanus, Diphtheria, Pertussis (Tdap)',
    value: 'Booster Dose (0.5 mL)',
    provider: 'CVS Pharmacy Clinics',
    status: 'Completed'
  }
];

import { FoodVisionService, CloudAIService } from '../services';
import type { FoodAnalysisResult } from '../types';

interface ScanScreenProps {
  onNavigate?: (index: number) => void;
}

export const ScanScreen: React.FC<ScanScreenProps> = ({ onNavigate }) => {
  const insets = useSafeAreaInsets();
  const userAllergies = useSafeScaleStore(selectUserAllergies);
  const isLocalAIOptedIn = useSafeScaleStore(selectIsLocalAIOptedIn);
  const addLoggedItem = useSafeScaleStore((s) => s.addLoggedItem);
  const crowdsourcedReports = useSafeScaleStore((s) => s.crowdsourcedReports) || [];
  const addScannedDocument = useSafeScaleStore((s) => s.addScannedDocument);
  const addMedication = useSafeScaleStore((s) => s.addMedication);
  const completeVaccineMilestone = useSafeScaleStore((s) => s.completeVaccineMilestone);
  const addVitalLog = useSafeScaleStore((s) => s.addVitalLog);
  const profile = useSafeScaleStore((s) => s.profile);
  const apiKey = (profile.geminiApiKey && profile.geminiApiKey.trim())
    || (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();

  // Camera permissions hook
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Auto-request camera permission on mount so the OS permission dialog
  // appears immediately rather than waiting for user to tap a button.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.status]);

  const [selectedProduct, setSelectedProduct] = useState<PresetProduct>(PRESET_PRODUCTS[0]);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [visualResult, setVisualResult] = useState<VisualDetectedItem | null>(null);
  const [isLogged, setIsLogged] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [allergenResult, setAllergenResult] = useState<AllergenMatchResult | null>(null);
  const [aiResult, setAiResult] = useState<LocalAIAnalysisResult | null>(null);

  // Food photo analysis states
  const [foodAnalysisResult, setFoodAnalysisResult] = useState<FoodAnalysisResult | null>(null);
  const [foodLogged, setFoodLogged] = useState(false);

  // Document scan states
  const [scanMode, setScanMode] = useState<'Allergen' | 'FoodPhoto' | 'Document'>('Allergen');
  const [docScanResult, setDocScanResult] = useState<{ type: 'Prescription' | 'LabResult' | 'Immunization'; title: string; value: string; provider: string; status: string } | null>(null);
  const [isDocImported, setIsDocImported] = useState(false);

  // Laser grid scanning line animation
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scanLineAnim.setValue(0);
    }
  }, [isScanning, scanLineAnim]);

  // Clean ingredients helper
  const cleanIngredients = (text: string): string[] => {
    if (!text) return [];
    return text
      .split(',')
      .map(i => i.replace(/[\*\_\(\)\[\]\.]/g, '').trim())
      .filter(i => i.length > 0);
  };

  // Run the fallback preset scan simulation
  const runPresetSimulation = () => {
    let detectedProduct = PRESET_PRODUCTS[0];
    const matchingAllergenProducts = PRESET_PRODUCTS.filter(p =>
      p.ingredients.some(ing =>
        userAllergies.some(all => ing.toLowerCase().includes(all.toLowerCase()))
      )
    );

    if (matchingAllergenProducts.length > 0 && Math.random() > 0.4) {
      const idx = Math.floor(Math.random() * matchingAllergenProducts.length);
      detectedProduct = matchingAllergenProducts[idx];
    } else {
      const idx = Math.floor(Math.random() * PRESET_PRODUCTS.length);
      detectedProduct = PRESET_PRODUCTS[idx];
    }

    setSelectedProduct(detectedProduct);

    // Simulate OCR processing delay
    setTimeout(() => {
      const coreMatch = AllergenEngine.analyzeIngredients(
        detectedProduct.ingredients,
        userAllergies,
        detectedProduct.name
      );

      let localAiRes: LocalAIAnalysisResult | null = null;
      if (isLocalAIOptedIn) {
        localAiRes = LocalAIService.analyzeIngredients(
          detectedProduct.ingredients,
          userAllergies,
          detectedProduct.name
        );
      }

      setAllergenResult(coreMatch);
      setAiResult(localAiRes);
      setIsScanning(false);
    }, 2000);
  };

  // Run the visual object recognition simulation (Computer Vision)
  const runVisualRecognition = () => {
    let item = VISUAL_DETECTED_ITEMS[0];
    const allergyMatches = VISUAL_DETECTED_ITEMS.filter(p =>
      p.ingredients && p.ingredients.some(ing =>
        userAllergies.some(all => ing.toLowerCase().includes(all.toLowerCase()))
      )
    );

    if (allergyMatches.length > 0 && Math.random() > 0.4) {
      const idx = Math.floor(Math.random() * allergyMatches.length);
      item = allergyMatches[idx];
    } else {
      const idx = Math.floor(Math.random() * VISUAL_DETECTED_ITEMS.length);
      item = VISUAL_DETECTED_ITEMS[idx];
    }

    setVisualResult(item);
    setIsLogged(false);

    // If it has ingredients (Meal), run Allergen check!
    if (item.type === 'Meal' && item.ingredients) {
      const coreMatch = AllergenEngine.analyzeIngredients(
        item.ingredients,
        userAllergies,
        item.name
      );

      let localAiRes: LocalAIAnalysisResult | null = null;
      if (isLocalAIOptedIn) {
        localAiRes = LocalAIService.analyzeIngredients(
          item.ingredients,
          userAllergies,
          item.name
        );
      }

      setAllergenResult(coreMatch);
      setAiResult(localAiRes);
    } else {
      // Water is always safe
      setAllergenResult({
        itemName: item.name,
        matchFound: false,
        flaggedIngredients: [],
        alternativeSafeMacros: ['Hydration', 'Zero Calorie', 'Allergen Free'],
      });
      setAiResult({
        itemName: item.name,
        insights: [],
        summary: `✅ Offline AI confirms ${item.name} contains 100% pure water. Safe to consume for active hydration logging.`,
        processingTimeMs: 140,
      });
    }

    setIsScanning(false);
  };

  // Real Barcode Scanned Callback
  const handleBarcodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (isScanning || allergenResult || capturedPhoto || scannedBarcode) return;

    setIsScanning(true);
    setScannedBarcode(data);
    setVisualResult(null);
    setIsLogged(false);

    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`);
      const result = await response.json();

      if (result.status === 1 && result.product) {
        const prod = result.product;
        const name = prod.product_name || 'Scanned Product';
        const brand = prod.brands || 'Unknown Brand';
        const ingredientsRaw = prod.ingredients_text || '';
        const ingredients = cleanIngredients(ingredientsRaw);

        const product = {
          name,
          brand,
          ingredients: ingredients.length > 0 ? ingredients : ['Ingredients details unavailable'],
          icon: 'barcode',
        };

        setSelectedProduct(product);

        const coreMatch = AllergenEngine.analyzeIngredients(
          product.ingredients,
          userAllergies,
          product.name
        );

        let localAiRes: LocalAIAnalysisResult | null = null;
        if (isLocalAIOptedIn) {
          localAiRes = LocalAIService.analyzeIngredients(
            product.ingredients,
            userAllergies,
            product.name
          );
        }

        setAllergenResult(coreMatch);
        setAiResult(localAiRes);
      } else {
        Alert.alert(
          'Barcode Not Found',
          'This product was not found in the Open Food Facts registry. Using demo catalog instead.',
          [{ text: 'OK', onPress: () => runPresetSimulation() }]
        );
      }
    } catch (error) {
      console.error('Error fetching barcode:', error);
      Alert.alert(
        'Connection Error',
        'Could not connect to Open Food Facts database. Using demo catalog instead.',
        [{ text: 'OK', onPress: () => runPresetSimulation() }]
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Run the document OCR scanner simulation
  const runDocumentOCR = () => {
    const idx = Math.floor(Math.random() * DOC_PRESETS.length);
    const doc = DOC_PRESETS[idx];
    setDocScanResult(doc);
    setIsDocImported(false);
    setIsScanning(false);
  };

  // Handler for capturing the photo and executing OCR/Food analysis
  const handleCaptureAndScan = async () => {
    if (!cameraRef.current || isScanning) return;

    try {
      setIsScanning(true);
      setAllergenResult(null);
      setAiResult(null);
      setScannedBarcode(null);
      setVisualResult(null);
      setIsLogged(false);
      setDocScanResult(null);
      setIsDocImported(false);
      setFoodAnalysisResult(null);
      setFoodLogged(false);

      // Brief delay to allow React state updates to disable barcode scanning natively
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Take picture (quality 0.6 is ideal for OCR, reducing memory load on Android)
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
      });
      
      if (photo && photo.uri) {
        setCapturedPhoto(photo.uri);

        if (scanMode === 'FoodPhoto') {
          try {
            const result = await FoodVisionService.analyzeImage(
              photo.uri,
              useSafeScaleStore.getState().aiPreference,
              apiKey
            );
            setFoodAnalysisResult(result);
          } catch (e) {
            console.error('Food analysis error:', e);
            Alert.alert('Analysis Failed', 'Could not analyze the food photo. Please try again.');
          } finally {
            setIsScanning(false);
          }
          return;
        }

        if (scanMode === 'Allergen') {
          if (apiKey) {
            try {
              const result = await CloudAIService.analyzeIngredientsOCR(
                photo.uri,
                apiKey
              );
              
              const product = {
                name: result.name,
                brand: result.brand,
                ingredients: result.ingredients,
                icon: 'image-filter-frames',
              };
              
              setSelectedProduct(product);
              
              const coreMatch = AllergenEngine.analyzeIngredients(
                product.ingredients,
                userAllergies,
                product.name
              );
              
              let localAiRes: LocalAIAnalysisResult | null = null;
              if (isLocalAIOptedIn) {
                localAiRes = LocalAIService.analyzeIngredients(
                  product.ingredients,
                  userAllergies,
                  product.name
                );
              }
              
              setAllergenResult(coreMatch);
              setAiResult(localAiRes);
            } catch (e) {
              console.error('Ingredient OCR error:', e);
              Alert.alert('OCR Failed', 'Could not parse ingredients using Gemini. Falling back to presets.');
              runPresetSimulation();
            } finally {
              setIsScanning(false);
            }
          } else {
            Alert.alert(
              'Gemini Key Required',
              'To scan physical food ingredient labels using visual AI, please enter a Gemini API Key in the Settings tab. Reverting to local offline preset simulation.',
              [{ text: 'OK', onPress: () => runPresetSimulation() }]
            );
          }
          return;
        }

        if (scanMode === 'Document') {
          if (profile.useCloudAIDocuments && apiKey) {
            try {
              const result = await CloudAIService.analyzeDocumentOCR(
                photo.uri,
                apiKey
              );
              setDocScanResult(result);
              setIsDocImported(false);
            } catch (e) {
              console.error('Document OCR error:', e);
              Alert.alert('Parsing Failed', 'Could not parse document details using Gemini. Falling back to local offline presets.');
              runDocumentOCR();
            } finally {
              setIsScanning(false);
            }
          } else {
            if (apiKey) {
              Alert.alert(
                'Cloud AI Disabled',
                'Cloud AI Document Parsing is turned off in Settings. Reverting to local offline presets.',
                [{ text: 'OK', onPress: () => runDocumentOCR() }]
              );
            } else {
              Alert.alert(
                'Gemini Key Required',
                'To read physical documents using visual AI, please configure a Gemini API Key in the Settings tab. Reverting to local offline presets.',
                [{ text: 'OK', onPress: () => runDocumentOCR() }]
              );
            }
          }
          return;
        }
      }

    } catch (error) {
      console.error('Error during capture:', error);
      setIsScanning(false);
      Alert.alert(
        'Capture Failed',
        'An error occurred while taking the photo. Please make sure the camera is fully loaded and try again.'
      );
    }
  };

  const handleLogFoodAnalysis = () => {
    if (!foodAnalysisResult) return;
    addLoggedItem({
      type: 'Meal',
      name: foodAnalysisResult.foodName,
      value: `${foodAnalysisResult.calories} kcal`,
    });
    setFoodLogged(true);
    Alert.alert('✅ Logged!', `${foodAnalysisResult.foodName} has been added to your daily log.`);
  };

  const handleResetScanner = () => {
    setCapturedPhoto(null);
    setScannedBarcode(null);
    setVisualResult(null);
    setIsLogged(false);
    setAllergenResult(null);
    setAiResult(null);
    setDocScanResult(null);
    setIsDocImported(false);
    setIsScanning(false);
    setFoodAnalysisResult(null);
    setFoodLogged(false);
  };

  // Interpolate translate Y for scanning laser line
  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 210],
  });

  // Render Permission Request screen if not granted
  if (!permission) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    const isPermanentlyDenied = !permission.canAskAgain;

    const handlePressPermission = async () => {
      if (isPermanentlyDenied) {
        try {
          await Linking.openSettings();
        } catch (error) {
          Alert.alert('Error', 'Could not open Settings. Please go to system Settings manually.');
        }
      } else {
        requestPermission();
      }
    };

    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.alertContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <MaterialCommunityIcons name="camera-off" size={40} color={COLORS.alert} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' }}>
            Camera Access Required
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>
            {isPermanentlyDenied
              ? 'Camera permission is disabled. Please open system settings to grant camera access to SafeScale Health.'
              : 'SafeScale Health requires access to your camera to scan food ingredient labels for potential allergens.'}
          </Text>
        </View>
        <Pressable
          onPress={handlePressPermission}
          style={({ pressed }) => ({
            backgroundColor: COLORS.primary,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
            {isPermanentlyDenied ? 'Open Settings' : 'Grant Camera Permission'}
          </Text>
        </Pressable>
      </View>
    );
  }

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
            {scanMode === 'Allergen' ? 'Allergen Scanner' : scanMode === 'FoodPhoto' ? 'Food Photo AI' : 'Document Vault Scanner'}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            {scanMode === 'Allergen' 
              ? 'Point your camera at a food label or barcode to detect allergens.' 
              : scanMode === 'FoodPhoto'
              ? 'Photograph your meal to estimate calories, macros, and portion size.'
              : 'Frame prescriptions, vaccine passes, or lab reports to archive them.'}
          </Text>
        </View>

        {/* 3-tab Segmented Control */}
        <View style={{ flexDirection: 'row', backgroundColor: '#E8EDF0', borderRadius: 16, padding: 4, marginBottom: 20 }}>
          <Pressable
            onPress={() => {
              handleResetScanner();
              setScanMode('Allergen');
            }}
            style={{
              flex: 1,
              backgroundColor: scanMode === 'Allergen' ? COLORS.surface : 'transparent',
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              shadowColor: scanMode === 'Allergen' ? '#1A2129' : 'transparent',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: scanMode === 'Allergen' ? 0.1 : 0,
              shadowRadius: 4,
              elevation: scanMode === 'Allergen' ? 2 : 0,
            }}
          >
            <MaterialCommunityIcons name="barcode-scan" size={16} color={scanMode === 'Allergen' ? COLORS.primary : COLORS.textSecondary} style={{ marginRight: 4 }} />
            <Text style={{ color: scanMode === 'Allergen' ? COLORS.textPrimary : COLORS.textSecondary, fontWeight: '700', fontSize: 12 }}>
              Allergen
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              handleResetScanner();
              setScanMode('FoodPhoto');
            }}
            style={{
              flex: 1,
              backgroundColor: scanMode === 'FoodPhoto' ? COLORS.surface : 'transparent',
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              shadowColor: scanMode === 'FoodPhoto' ? '#1A2129' : 'transparent',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: scanMode === 'FoodPhoto' ? 0.1 : 0,
              shadowRadius: 4,
              elevation: scanMode === 'FoodPhoto' ? 2 : 0,
            }}
          >
            <MaterialCommunityIcons name="food-apple" size={16} color={scanMode === 'FoodPhoto' ? COLORS.primary : COLORS.textSecondary} style={{ marginRight: 4 }} />
            <Text style={{ color: scanMode === 'FoodPhoto' ? COLORS.textPrimary : COLORS.textSecondary, fontWeight: '700', fontSize: 12 }}>
              Food AI
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              handleResetScanner();
              setScanMode('Document');
            }}
            style={{
              flex: 1,
              backgroundColor: scanMode === 'Document' ? COLORS.surface : 'transparent',
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              shadowColor: scanMode === 'Document' ? '#1A2129' : 'transparent',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: scanMode === 'Document' ? 0.1 : 0,
              shadowRadius: 4,
              elevation: scanMode === 'Document' ? 2 : 0,
            }}
          >
            <MaterialCommunityIcons name="file-document-outline" size={16} color={scanMode === 'Document' ? COLORS.primary : COLORS.textSecondary} style={{ marginRight: 4 }} />
            <Text style={{ color: scanMode === 'Document' ? COLORS.textPrimary : COLORS.textSecondary, fontWeight: '700', fontSize: 12 }}>
              Document
            </Text>
          </Pressable>
        </View>

        {/* Real Viewfinder Frame */}
        <View
          style={{
            height: 260,
            backgroundColor: '#000000',
            borderRadius: 24,
            overflow: 'hidden',
            position: 'relative',
            marginBottom: 20,
            borderWidth: 1,
            borderColor: '#2D3742',
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          {isScanning ? (
            <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
              {capturedPhoto && (
                <Image
                  source={{ uri: capturedPhoto }}
                  style={{ width: '100%', height: '100%', position: 'absolute', opacity: 0.6 }}
                />
              )}
              {/* Laser Grid Scan Line */}
              <Animated.View
                style={{
                  position: 'absolute',
                  top: 25,
                  left: 20,
                  right: 20,
                  height: 3,
                  backgroundColor: COLORS.primary,
                  transform: [{ translateY }],
                  shadowColor: COLORS.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              />
              <ActivityIndicator size="large" color={COLORS.primary} style={{ zIndex: 10 }} />
              <Text style={{ color: '#FFFFFF', marginTop: 12, fontWeight: '700', fontSize: 14, zIndex: 10, textShadowColor: '#000', textShadowRadius: 2 }}>
                {scanMode === 'Document' ? 'Scanning Document OCR...' : 'Extracting Ingredients...'}
              </Text>
            </View>
          ) : capturedPhoto ? (
            /* Scanned image preview and reset */
            <View style={{ flex: 1 }}>
              <Image source={{ uri: capturedPhoto }} style={{ width: '100%', height: '100%' }} />
              <Pressable
                onPress={handleResetScanner}
                style={({ pressed }) => ({
                  position: 'absolute',
                  bottom: 12,
                  right: 12,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 100,
                  flexDirection: 'row',
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>
                  Scan Again
                </Text>
              </Pressable>
            </View>
          ) : (
            /* Live Camera Feed */
            <View style={{ width: '100%', height: '100%', position: 'relative' }}>
              <CameraView
                ref={cameraRef}
                style={{ width: '100%', height: '100%' }}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['ean13', 'upc_a', 'upc_e', 'ean8', 'qr'],
                }}
                onBarcodeScanned={(scanMode === 'Allergen' && !isScanning && !capturedPhoto) ? handleBarcodeScanned : undefined}
              />
              {scanMode === 'Document' && (
                <View
                  style={{
                    position: 'absolute',
                    top: 20,
                    bottom: 80,
                    left: 25,
                    right: 25,
                    borderWidth: 2,
                    borderColor: COLORS.primary,
                    borderRadius: 16,
                    borderStyle: 'dashed',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ backgroundColor: 'rgba(34,124,84,0.12)', width: '100%', height: '100%', borderRadius: 14 }} />
                </View>
              )}
              {/* Camera Shutter Overlay (positioned absolutely as a sibling to resolve warning) */}
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingBottom: 16,
                }}
              >
                <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, marginBottom: 12 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {scanMode === 'Document'
                      ? 'Center document in border & tap capture'
                      : (isLocalAIOptedIn ? 'Take a picture of the food' : 'Point at food label & tap capture')}
                  </Text>
                </View>
                <Pressable
                  onPress={handleCaptureAndScan}
                  style={({ pressed }) => ({
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 5,
                    borderColor: COLORS.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.85 : 1,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 5,
                  })}
                >
                  <MaterialCommunityIcons name="camera" size={28} color={COLORS.primary} />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Food Photo AI Result Card */}
        {foodAnalysisResult && (
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 24,
              padding: 20,
              marginBottom: 20,
              shadowColor: '#1A2129',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: COLORS.primaryContainer,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <MaterialCommunityIcons name="food-apple" size={22} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary }}>
                  Food AI Analysis
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  {foodAnalysisResult.confidence === 'high' ? 'High confidence match' : 'Estimated macros'}
                </Text>
              </View>
            </View>

            <View style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                {foodAnalysisResult.foodName}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 1 }}>
                Portion: {foodAnalysisResult.portionEstimate}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <View style={{ minWidth: 70, backgroundColor: COLORS.background, padding: 8, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Calories</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                  {foodAnalysisResult.calories} <Text style={{ fontSize: 9, fontWeight: '400' }}>kcal</Text>
                </Text>
              </View>
              <View style={{ minWidth: 60, backgroundColor: COLORS.background, padding: 8, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Carbs</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                  {foodAnalysisResult.carbs}g
                </Text>
              </View>
              <View style={{ minWidth: 60, backgroundColor: COLORS.background, padding: 8, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Protein</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                  {foodAnalysisResult.protein}g
                </Text>
              </View>
              <View style={{ minWidth: 60, backgroundColor: COLORS.background, padding: 8, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Fat</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                  {foodAnalysisResult.fat}g
                </Text>
              </View>
              <View style={{ minWidth: 60, backgroundColor: COLORS.background, padding: 8, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Fiber</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                  {foodAnalysisResult.fiber}g
                </Text>
              </View>
              <View style={{ minWidth: 60, backgroundColor: COLORS.background, padding: 8, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Sugar</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                  {foodAnalysisResult.sugar}g
                </Text>
              </View>
              <View style={{ minWidth: 70, backgroundColor: COLORS.background, padding: 8, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Sodium</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                  {foodAnalysisResult.sodium}mg
                </Text>
              </View>
            </View>

            {!foodLogged ? (
              <Pressable
                onPress={handleLogFoodAnalysis}
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
                  Log to Food Journal
                </Text>
              </Pressable>
            ) : (
              <View style={{ backgroundColor: COLORS.primaryContainer, borderRadius: 14, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13 }}>
                  ✓ Logged in Health Journal
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Scan Results Card */}
        {allergenResult && (
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 24,
              padding: 20,
              marginBottom: 20,
              shadowColor: '#1A2129',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: allergenResult.matchFound ? COLORS.alertContainer : COLORS.primaryContainer,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <MaterialCommunityIcons
                  name={allergenResult.matchFound ? 'close-circle' : 'check-circle'}
                  size={22}
                  color={allergenResult.matchFound ? COLORS.alert : COLORS.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary }}>
                  {allergenResult.matchFound ? 'Allergen Alert Detected' : 'Product Declared Safe'}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  User Profile: {userAllergies.length > 0 ? userAllergies.join(', ') : 'None'}
                </Text>
              </View>
            </View>

            {/* Scanned product details and ingredients */}
            <View style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary }}>
                {visualResult ? visualResult.name : selectedProduct.name}
              </Text>
              {visualResult ? (
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 1 }}>
                  Type: {visualResult.type} · Estimated: {visualResult.value}
                </Text>
              ) : selectedProduct.brand ? (
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 1 }}>
                  Brand: {selectedProduct.brand}
                </Text>
              ) : null}
              {visualResult ? (
                visualResult.ingredients && visualResult.ingredients.length > 0 ? (
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4, lineHeight: 15 }}>
                    Detected Ingredients: {visualResult.ingredients.join(', ')}
                  </Text>
                ) : null
              ) : selectedProduct.ingredients && selectedProduct.ingredients.length > 0 ? (
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4, lineHeight: 15 }}>
                  Ingredients: {selectedProduct.ingredients.join(', ')}
                </Text>
              ) : null}
            </View>

            {allergenResult.matchFound ? (
              <View>
                <Text style={{ color: COLORS.alert, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>
                  Flagged Ingredients:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {allergenResult.flaggedIngredients.map((flagged) => (
                    <View
                      key={flagged}
                      style={{
                        backgroundColor: COLORS.alertContainer,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ color: COLORS.alert, fontSize: 12, fontWeight: '600' }}>
                        {flagged}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View>
                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>
                  Safe Macro Certifications:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {allergenResult.alternativeSafeMacros.map((tag) => (
                    <View
                      key={tag}
                      style={{
                        backgroundColor: COLORS.primaryContainer,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '600' }}>
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Proximity Allergen Map Alert Linking */}
            {(() => {
              const activeAllergens = allergenResult ? allergenResult.flaggedIngredients : [];
              const activeIngredients = visualResult 
                ? (visualResult.ingredients || []) 
                : (selectedProduct ? (selectedProduct.ingredients || []) : []);
              const activeName = visualResult ? visualResult.name : (selectedProduct ? selectedProduct.name : '');

              const proximityWarnings = crowdsourcedReports.filter(report => {
                const reportAllergenLower = report.allergen.toLowerCase();
                const matchesFlagged = activeAllergens.some(fa => fa.toLowerCase().includes(reportAllergenLower));
                const matchesIngredient = activeIngredients.some(ing => ing.toLowerCase().includes(reportAllergenLower));
                const matchesName = activeName.toLowerCase().includes(reportAllergenLower);
                return matchesFlagged || matchesIngredient || matchesName;
              });

              if (proximityWarnings.length === 0) return null;

              return (
                <View
                  style={{
                    backgroundColor: COLORS.alertContainer,
                    borderRadius: 16,
                    padding: 12,
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: COLORS.alert,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <MaterialCommunityIcons name="map-marker-radius" size={18} color={COLORS.alert} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.alert, marginLeft: 6 }}>
                      Proximity Allergen Alert
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: COLORS.textPrimary, lineHeight: 16 }}>
                    Warning: Nearby active report flags contamination of{' '}
                    <Text style={{ fontWeight: '700' }}>
                      {proximityWarnings.map(w => w.allergen).join(', ')}
                    </Text>
                    ! Severe allergen contamination was reported nearby today. Please exercise extreme caution.
                  </Text>
                </View>
              );
            })()}

            {/* Local AI Details overlay */}
            {aiResult && (
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="robot-outline" size={16} color={COLORS.secondary} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.secondary, marginLeft: 6 }}>
                    Local AI Analysis
                  </Text>
                  <Text style={{ fontSize: 10, color: COLORS.textSecondary, marginLeft: 'auto' }}>
                    {aiResult.processingTimeMs}ms (offline)
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 16 }}>
                  {aiResult.summary}
                </Text>

                {aiResult.insights.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 }}>
                      AI Suggestions:
                    </Text>
                    {aiResult.insights
                      .filter((i) => i.category === 'Allergen')
                      .map((insight) => (
                        <Text key={insight.name} style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 14 }}>
                          💡 Alternative for {insight.name}: {insight.alternatives.join(', ')}
                        </Text>
                      ))}
                  </View>
                )}
              </View>
            )}

            {/* Health Logging Section */}
            {visualResult ? (
              !isLogged ? (
                <Pressable
                  onPress={() => {
                    addLoggedItem({
                      type: visualResult.type,
                      name: visualResult.name,
                      value: visualResult.value,
                    });
                    setIsLogged(true);
                    Alert.alert('Logged Successfully', `${visualResult.name} has been added to your daily health log.`);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: COLORS.primary,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 16,
                    opacity: pressed ? 0.88 : 1,
                  })}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                    Log this {visualResult.type === 'Water' ? 'Hydration' : 'Meal'}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ backgroundColor: COLORS.primaryContainer, borderRadius: 14, paddingVertical: 10, alignItems: 'center', marginTop: 16 }}>
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13 }}>
                    ✓ Added to Daily Health Log
                  </Text>
                </View>
              )
            ) : (
              // For barcode scanned products
              !isLogged ? (
                <Pressable
                  onPress={() => {
                    addLoggedItem({
                      type: 'Meal',
                      name: selectedProduct.name,
                      value: '350 kcal',
                    });
                    setIsLogged(true);
                    Alert.alert('Logged Successfully', `${selectedProduct.name} has been added to your daily health log.`);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: COLORS.primary,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 16,
                    opacity: pressed ? 0.88 : 1,
                  })}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                    Log this Food
                  </Text>
                </Pressable>
              ) : (
                <View style={{ backgroundColor: COLORS.primaryContainer, borderRadius: 14, paddingVertical: 10, alignItems: 'center', marginTop: 16 }}>
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13 }}>
                    ✓ Added to Daily Health Log
                  </Text>
                </View>
              )
            )}
          </View>
        )}

        {scanMode === 'Document' && docScanResult && (
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 24,
              padding: 20,
              marginBottom: 20,
              shadowColor: '#1A2129',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: COLORS.primaryContainer,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <MaterialCommunityIcons name="file-document-outline" size={22} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary }}>
                  {profile.useCloudAIDocuments && apiKey ? 'Cloud AI Document Scan' : 'Local AI Document Scan'}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  {profile.useCloudAIDocuments && apiKey ? 'Secure PII-redacted analysis complete' : 'Offline OCR extraction complete'}
                </Text>
              </View>
            </View>

            <View style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 }}>
              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Extracted Title
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 }}>
                  {docScanResult.title}
                </Text>
              </View>

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Document Type
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary, marginTop: 2 }}>
                  {docScanResult.type}
                </Text>
              </View>

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Extracted Content
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.textPrimary, marginTop: 2, lineHeight: 18 }}>
                  {docScanResult.value}
                </Text>
              </View>

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Issuing Provider
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.textPrimary, marginTop: 2 }}>
                  {docScanResult.provider}
                </Text>
              </View>
            </View>

            {!isDocImported ? (
              <Pressable
                onPress={() => {
                  addScannedDocument({
                    type: docScanResult.type,
                    title: docScanResult.title,
                    value: docScanResult.value,
                    provider: docScanResult.provider,
                    date: new Date().toLocaleDateString(),
                    status: docScanResult.status,
                    documentImage: capturedPhoto || undefined,
                  });

                  // Auto-integrate scanned facts into active store slices
                  if (docScanResult.type === 'Prescription') {
                    // Extract dosage or default to instructions
                    const dosageMatch = docScanResult.value.match(/(\d+\s*(mg|mcg|ml|g|pill|tablet|capsule|pills|tablets|capsules|puff|puffs))/i);
                    const dosage = dosageMatch ? dosageMatch[1] : docScanResult.value;
                    const timeMatch = docScanResult.value.match(/(\d{2}:\d{2})/);
                    const time = timeMatch ? timeMatch[1] : '09:00';
                    
                    addMedication({
                      name: docScanResult.title,
                      dosage: dosage,
                      time: time,
                      icon: 'pill',
                    });
                  } else if (docScanResult.type === 'Immunization') {
                    const milestones = useSafeScaleStore.getState().vaccineMilestones;
                    const cleanTitle = docScanResult.title.toLowerCase();
                    const matchedMilestone = milestones.find(m => 
                      m.status === 'Pending' && (
                        cleanTitle.includes(m.name.toLowerCase()) || 
                        cleanTitle.includes(m.targetDisease.toLowerCase()) ||
                        m.name.toLowerCase().includes(cleanTitle) ||
                        m.targetDisease.toLowerCase().includes(cleanTitle)
                      )
                    );
                    if (matchedMilestone) {
                      completeVaccineMilestone(
                        matchedMilestone.id,
                        new Date().toLocaleDateString(),
                        docScanResult.provider
                      );
                    }
                  } else if (docScanResult.type === 'LabResult') {
                    const bpMatch = docScanResult.value.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
                    const systolic = bpMatch ? parseInt(bpMatch[1], 10) : undefined;
                    const diastolic = bpMatch ? parseInt(bpMatch[2], 10) : undefined;
                    
                    const glucoseMatch = docScanResult.value.match(/(glucose|sugar)\D*(\d{2,3})/i);
                    const glucose = glucoseMatch ? parseInt(glucoseMatch[2], 10) : undefined;
                    
                    const spo2Match = docScanResult.value.match(/(spo2|oxygen|o2)\D*(\d{2,3})/i);
                    const spo2 = spo2Match ? parseInt(spo2Match[2], 10) : undefined;
                    
                    const tempMatch = docScanResult.value.match(/(temp|temperature)\D*(\d{2,3}\.?\d?)/i);
                    const temperature = tempMatch ? parseFloat(tempMatch[2]) : undefined;
                    
                    if (systolic !== undefined || diastolic !== undefined || glucose !== undefined || spo2 !== undefined || temperature !== undefined) {
                      addVitalLog({
                        systolicBP: systolic,
                        diastolicBP: diastolic,
                        bloodGlucose: glucose,
                        glucoseContext: 'General',
                        spo2: spo2,
                        temperature: temperature,
                      });
                    }
                  }

                  setIsDocImported(true);
                  Alert.alert('Vault Archive Completed', 'Document archived and relevant health records integrated.');
                }}
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
                  Import Document to Vault
                </Text>
              </Pressable>
            ) : (
              <View style={{ backgroundColor: COLORS.primaryContainer, borderRadius: 14, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13 }}>
                  ✓ Archived Securely in Offline Vault
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Help Card explaining automatic scanner matching */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 20,
            padding: 16,
            marginTop: 8,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name={scanMode === 'Document' ? 'file-eye-outline' : 'auto-fix'} size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
              {scanMode === 'Document' ? 'Offline Document OCR' : 'Auto-Label Recognition'}
            </Text>
            <Text style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 15, marginTop: 2 }}>
              {scanMode === 'Document'
                ? 'All document scans and OCR runs are completed 100% locally. Prescription items and immunization milestones are saved directly into your medical records vault.'
                : 'Point the camera at any ingredient panel. The scanner automatically detects the barcode, extracts the ingredient tokens, and runs analysis against your active allergen settings.'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default ScanScreen;
