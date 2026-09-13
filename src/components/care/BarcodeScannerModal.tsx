/**
 * @file src/components/care/BarcodeScannerModal.tsx
 * @description Real-time barcode scanner and UPC resolver for nutrition facts.
 *
 * Sourcing pipeline:
 *   1. Local USDA offline database (zero latency, zero network)
 *   2. Open Food Facts free public database (fallback for branded packaged goods)
 *
 * Includes camera viewfinder with barcode detection, manual numeric entry,
 * and quick-sample barcodes for web/simulator testing.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { BarcodeLookupService } from '../../services/BarcodeLookupService';
import { AllergenEngine } from '../../services/AllergenEngine';
import type { FoodAnalysisResult } from '../../types';
import { Sheet, Button, C, s } from './UI';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned?: (result: FoodAnalysisResult) => void;
}

const SAMPLE_BARCODES = [
  { label: 'Chobani Greek Yogurt', code: '894700010045' },
  { label: 'Quaker Oats', code: '030000010402' },
  { label: 'Jif Peanut Butter', code: '051500255162' },
  { label: 'Coca-Cola', code: '049000028904' },
  { label: 'Nature Valley Bar', code: '016000264600' },
  { label: 'Barilla Spaghetti', code: '076808510065' },
  { label: 'Heinz Ketchup', code: '013000006408' },
];

export default function BarcodeScannerModal({ visible, onClose, onScanned }: BarcodeScannerModalProps) {
  const addLoggedItem = useSafeScaleStore(state => state.addLoggedItem);
  const allergies = useSafeScaleStore(state => state.userAllergies);

  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [allergenWarnings, setAllergenWarnings] = useState<string[]>([]);
  const [logged, setLogged] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);

  // Scanner laser line animation
  const laserAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && cameraActive && !result && !loading) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(laserAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    }
  }, [visible, cameraActive, result, loading, laserAnim]);

  useEffect(() => {
    if (!visible) {
      setResult(null);
      setError('');
      setManualCode('');
      setLogged(false);
      setAllergenWarnings([]);
    }
  }, [visible]);

  const handleResolveBarcode = async (barcode: string) => {
    const trimmed = barcode.trim();
    if (!trimmed) {
      setError('Please enter or scan a barcode.');
      return;
    }

    setLoading(true);
    setError('');
    setCameraActive(false);

    try {
      const foodResult = await BarcodeLookupService.lookupBarcode(trimmed);
      setResult(foodResult);

      // Allergen cross-check
      if (foodResult.ingredients && foodResult.ingredients.length > 0 && allergies.length > 0) {
        const check = AllergenEngine.analyzeIngredients(
          foodResult.ingredients,
          allergies,
          foodResult.foodName,
        );
        if (check.matchFound) {
          setAllergenWarnings(check.flaggedIngredients);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setCameraActive(true);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (loading || result) return;
    handleResolveBarcode(data);
  };

  const handleLog = () => {
    if (!result || logged) return;

    if (onScanned) {
      onScanned(result);
      onClose();
      return;
    }

    addLoggedItem({
      type: 'Meal',
      name: result.foodName,
      value: `${result.calories} kcal`,
      calories: result.calories,
      macros: {
        carbs: result.carbs,
        protein: result.protein,
        fat: result.fat,
        fiber: result.fiber,
        sugar: result.sugar,
        sodium: result.sodium,
      },
      portion: result.portionEstimate,
      allergenWarnings: allergenWarnings.length > 0 ? allergenWarnings : undefined,
      source: result.source,
      upcBarcode: result.barcode,
    });

    setLogged(true);
    Alert.alert('✅ Logged!', `${result.foodName} has been added to your journal.`);
  };

  const handleScanAgain = () => {
    setResult(null);
    setError('');
    setManualCode('');
    setLogged(false);
    setCameraActive(true);
  };

  if (!visible) return null;

  const laserTranslateY = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 170],
  });

  return (
    <Sheet title="Barcode Nutrition Scanner" onClose={onClose}>
      {/* Viewfinder View / Camera */}
      {!result && (
        <View style={localStyles.cameraContainer}>
          {Platform.OS !== 'web' && permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
              }}
              onBarcodeScanned={cameraActive && !loading ? handleBarcodeScanned : undefined}
            />
          ) : (
            <View style={localStyles.simulatedCamera}>
              <MaterialCommunityIcons name="barcode-scan" size={48} color={C.green} />
              <Text style={localStyles.simulatedCameraText}>
                {Platform.OS === 'web'
                  ? 'Camera scanning active on mobile. Enter UPC or pick sample below.'
                  : !permission?.granted
                  ? 'Camera permission needed for live scanning.'
                  : 'Point camera at barcode'}
              </Text>
              {!permission?.granted && Platform.OS !== 'web' && (
                <Pressable
                  style={localStyles.permissionBtn}
                  onPress={() => requestPermission()}
                >
                  <Text style={localStyles.permissionBtnText}>Enable Camera</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Scanner Reticle Overlay */}
          <View style={localStyles.reticleFrame}>
            <Animated.View
              style={[
                localStyles.laserLine,
                { transform: [{ translateY: laserTranslateY }] },
              ]}
            />
          </View>

          {loading && (
            <View style={localStyles.loadingOverlay}>
              <ActivityIndicator size="large" color={C.green} />
              <Text style={localStyles.loadingText}>Looking up product...</Text>
            </View>
          )}
        </View>
      )}

      {/* Error Banner */}
      {error ? (
        <View style={localStyles.errorCard}>
          <MaterialCommunityIcons name="alert-circle" size={18} color={C.red} />
          <Text style={localStyles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Resolved Product Nutrition View */}
      {result ? (
        <View style={localStyles.resultCard}>
          {/* Source origin badge */}
          <View style={localStyles.badgeRow}>
            <View
              style={[
                localStyles.sourceBadge,
                result.source === 'usda'
                  ? { backgroundColor: '#DCFCE7' }
                  : { backgroundColor: '#E0F2FE' },
              ]}
            >
              <Text
                style={[
                  localStyles.sourceBadgeText,
                  result.source === 'usda' ? { color: '#166534' } : { color: '#0369A1' },
                ]}
              >
                {result.source === 'usda' ? '📚 Offline USDA Verified' : '🌐 Open Food Facts'}
              </Text>
            </View>
            {result.barcode ? (
              <Text style={localStyles.barcodeLabel}>UPC: {result.barcode}</Text>
            ) : null}
          </View>

          {/* Food Title & Serving */}
          <View>
            <Text style={localStyles.productName}>{result.foodName}</Text>
            <Text style={localStyles.servingText}>Serving: {result.portionEstimate}</Text>
          </View>

          {/* Big Calorie Box */}
          <View style={localStyles.calorieBanner}>
            <Text style={localStyles.calorieVal}>{result.calories}</Text>
            <Text style={localStyles.calorieUnit}>CALORIES</Text>
          </View>

          {/* Macros */}
          <View style={localStyles.macroRow}>
            <View style={[localStyles.macroBox, { backgroundColor: '#3B82F614' }]}>
              <Text style={[localStyles.macroBoxVal, { color: '#1D4ED8' }]}>{result.protein}g</Text>
              <Text style={localStyles.macroBoxLabel}>Protein</Text>
            </View>
            <View style={[localStyles.macroBox, { backgroundColor: '#F59E0B14' }]}>
              <Text style={[localStyles.macroBoxVal, { color: '#B45309' }]}>{result.carbs}g</Text>
              <Text style={localStyles.macroBoxLabel}>Carbs</Text>
            </View>
            <View style={[localStyles.macroBox, { backgroundColor: '#EF444414' }]}>
              <Text style={[localStyles.macroBoxVal, { color: '#B91C1C' }]}>{result.fat}g</Text>
              <Text style={localStyles.macroBoxLabel}>Fat</Text>
            </View>
          </View>

          {/* Micro details */}
          <View style={localStyles.microDetails}>
            <Text style={localStyles.microItem}>Fiber: {result.fiber}g</Text>
            <Text style={localStyles.microItem}>Sugar: {result.sugar}g</Text>
            <Text style={localStyles.microItem}>Sodium: {result.sodium}mg</Text>
          </View>

          {/* Allergen Alerts */}
          {allergenWarnings.length > 0 ? (
            <View style={localStyles.allergenBannerWarning}>
              <MaterialCommunityIcons name="alert" size={18} color={C.red} />
              <Text style={localStyles.allergenBannerTextWarning}>
                Allergen detected: {allergenWarnings.join(', ')}
              </Text>
            </View>
          ) : allergies.length > 0 ? (
            <View style={localStyles.allergenBannerSafe}>
              <MaterialCommunityIcons name="shield-check" size={18} color="#166534" />
              <Text style={localStyles.allergenBannerTextSafe}>
                Safe from your allergies ({allergies.join(', ')})
              </Text>
            </View>
          ) : null}

          {/* Action buttons */}
          <Button
            label={logged ? '✓ Logged to Journal' : 'Log to Daily Journal'}
            onPress={handleLog}
            icon={logged ? 'check' : 'plus'}
            disabled={logged}
          />
          <Button label="Scan Another Item" secondary onPress={handleScanAgain} />
        </View>
      ) : (
        /* Manual Barcode Entry & Samples */
        <View style={{ gap: 14 }}>
          <View style={localStyles.manualRow}>
            <TextInput
              style={localStyles.manualInput}
              placeholder="Or enter barcode numbers (e.g. 030000010402)..."
              placeholderTextColor={C.muted}
              value={manualCode}
              onChangeText={setManualCode}
              keyboardType="numeric"
              returnKeyType="search"
              onSubmitEditing={() => handleResolveBarcode(manualCode)}
            />
            <Pressable
              style={localStyles.lookupBtn}
              onPress={() => handleResolveBarcode(manualCode)}
            >
              <Text style={localStyles.lookupBtnText}>Lookup</Text>
            </Pressable>
          </View>

          {/* Fast Samples Carousel for Easy Testing */}
          <View style={{ gap: 6 }}>
            <Text style={localStyles.samplesTitle}>Try sample barcodes:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {SAMPLE_BARCODES.map(item => (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    setManualCode(item.code);
                    handleResolveBarcode(item.code);
                  }}
                  style={localStyles.samplePill}
                >
                  <Text style={localStyles.samplePillText}>{item.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </Sheet>
  );
}

const localStyles = StyleSheet.create({
  cameraContainer: {
    height: 190,
    backgroundColor: '#0F172A',
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  simulatedCamera: {
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  simulatedCameraText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 240,
  },
  permissionBtn: {
    backgroundColor: C.green,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  permissionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  reticleFrame: {
    position: 'absolute',
    width: '75%',
    height: 140,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
  },
  laserLine: {
    width: '100%',
    height: 2,
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowRadius: 6,
    shadowOpacity: 0.9,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: C.red,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    gap: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  barcodeLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
  },
  productName: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  servingText: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  calorieBanner: {
    backgroundColor: C.pale,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  calorieVal: {
    fontSize: 32,
    fontWeight: '800',
    color: C.green,
  },
  calorieUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 1,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  macroBox: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  macroBoxVal: {
    fontSize: 16,
    fontWeight: '700',
  },
  macroBoxLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.muted,
    marginTop: 2,
  },
  microDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 2,
  },
  microItem: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '500',
  },
  allergenBannerWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  allergenBannerTextWarning: {
    flex: 1,
    fontSize: 12,
    color: C.red,
    fontWeight: '600',
  },
  allergenBannerSafe: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  allergenBannerTextSafe: {
    flex: 1,
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
    fontSize: 13,
    color: C.ink,
    height: 44,
  },
  lookupBtn: {
    backgroundColor: C.green,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupBtnText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 13,
  },
  samplesTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
  },
  samplePill: {
    backgroundColor: C.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  samplePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.ink,
  },
});
