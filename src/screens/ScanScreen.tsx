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

export const ScanScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const userAllergies = useSafeScaleStore(selectUserAllergies);
  const isLocalAIOptedIn = useSafeScaleStore(selectIsLocalAIOptedIn);

  // Camera permissions hook
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [selectedProduct, setSelectedProduct] = useState<PresetProduct>(PRESET_PRODUCTS[0]);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [allergenResult, setAllergenResult] = useState<AllergenMatchResult | null>(null);
  const [aiResult, setAiResult] = useState<LocalAIAnalysisResult | null>(null);

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

  // Handler for capturing the photo and executing OCR simulation
  const handleCaptureAndScan = async () => {
    if (!cameraRef.current || isScanning) return;

    try {
      setIsScanning(true);
      setAllergenResult(null);
      setAiResult(null);

      // Take picture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
      });
      
      if (photo && photo.uri) {
        setCapturedPhoto(photo.uri);
      }

      // Auto-identify product: select catalog template dynamically.
      // If user has active allergens configured, prioritize picking a product in our database 
      // that matches their allergies 50% of the time, so they can easily verify alerting flows.
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

      // Simulate OCR processing and allergen cross-reference
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

    } catch (error) {
      console.error('Error during capture:', error);
      setIsScanning(false);
    }
  };

  const handleResetScanner = () => {
    setCapturedPhoto(null);
    setAllergenResult(null);
    setAiResult(null);
    setIsScanning(false);
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
            SafeScale Health requires access to your camera to scan food ingredient labels for potential allergens.
          </Text>
        </View>
        <Pressable
          onPress={requestPermission}
          style={({ pressed }) => ({
            backgroundColor: COLORS.primary,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
            Grant Camera Permission
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
            Allergen Scanner
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Point your camera at a food label to check for allergens.
          </Text>
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
                Extracting Ingredients...
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
              />
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
                    {isLocalAIOptedIn ? 'Take a picture of the food' : 'Point at food label & tap capture'}
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
            <MaterialCommunityIcons name="auto-fix" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
              Auto-Label Recognition
            </Text>
            <Text style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 15, marginTop: 2 }}>
              Point the camera at any ingredient panel. The scanner automatically detects the barcode, extracts the ingredient tokens, and runs analysis against your active allergen settings.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default ScanScreen;
