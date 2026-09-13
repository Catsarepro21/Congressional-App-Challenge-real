/**
 * @file src/components/care/FoodNutritionModal.tsx
 * @description Comprehensive multi-tier nutrition logging modal.
 *
 * Integrates:
 *   1. Offline USDA database search with real-time autocomplete
 *   2. Barcode scanner & UPC resolver
 *   3. Photo analysis (Gemini Cloud or on-device keyword heuristic)
 *   4. Allergen safety cross-checking
 *   5. Accurate macronutrient and calorie tracking
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Alert,
  Animated,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { FoodVisionService } from '../../services/FoodVisionService';
import { AllergenEngine } from '../../services/AllergenEngine';
import { USDALookupService } from '../../services/USDALookupService';
import { NaturalLanguageMealParser } from '../../services/NaturalLanguageMealParser';
import BarcodeScannerModal from './BarcodeScannerModal';
import type { FoodAnalysisResult, AIIntelligenceProvider, USDAFoodEntry } from '../../types';
import { Button, Field, Sheet, s, C } from './UI';

const AI_LABELS: Record<AIIntelligenceProvider, string> = {
  'on-device': 'On-Device AI & Offline USDA DB',
  'cloud': 'Cloud AI (Gemini)',
  'opt-out': 'Offline USDA Heuristics',
};

interface FoodNutritionModalProps {
  visible: boolean;
  onClose: () => void;
  photoUri?: string;
  initialResult?: FoodAnalysisResult | null;
}

export default function FoodNutritionModal({
  visible,
  onClose,
  photoUri,
  initialResult,
}: FoodNutritionModalProps) {
  const addLoggedItem = useSafeScaleStore(s => s.addLoggedItem);
  const aiPreference = useSafeScaleStore(s => s.aiPreference);
  const profile = useSafeScaleStore(s => s.profile);
  const allergies = useSafeScaleStore(s => s.userAllergies);
  const apiKey = (profile.geminiApiKey && profile.geminiApiKey.trim())
    || (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<FoodAnalysisResult | null>(initialResult || null);
  const [allergenWarnings, setAllergenWarnings] = useState<string[]>([]);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);

  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // Real-time USDA search suggestions as the user types
  const suggestions = useMemo(() => {
    if (!manualName.trim() || manualName.trim().length < 2 || result) {
      return [];
    }
    return USDALookupService.searchFoods(manualName.trim(), { limit: 5 });
  }, [manualName, result]);

  useEffect(() => {
    if (analyzing) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [analyzing, pulseAnim]);

  useEffect(() => {
    if (!visible) {
      requestId.current += 1;
      setAnalyzing(false);
      setManualName('');
      setManualCalories('');
      setResult(null);
      setAllergenWarnings([]);
      setLogged(false);
      setError('');
      setAutocompleteVisible(false);
    } else if (initialResult) {
      setResult(initialResult);
    }
  }, [visible, photoUri, initialResult]);

  // Run allergen check whenever result changes
  useEffect(() => {
    if (result && result.ingredients && result.ingredients.length > 0 && allergies.length > 0) {
      const match = AllergenEngine.analyzeIngredients(result.ingredients, allergies, result.foodName);
      if (match.matchFound) {
        setAllergenWarnings(match.flaggedIngredients);
      } else {
        setAllergenWarnings([]);
      }
    } else {
      setAllergenWarnings([]);
    }
  }, [result, allergies]);

  const handleSelectUSDAFood = (food: USDAFoodEntry) => {
    const res = USDALookupService.toFoodAnalysisResult(food);
    setResult(res);
    setManualName(res.foodName);
    setManualCalories(String(res.calories));
    setAutocompleteVisible(false);
  };

  const analyzePhoto = async (uri: string) => {
    const id = ++requestId.current;
    setAnalyzing(true);
    setError('');
    try {
      const foodResult = await FoodVisionService.analyzeImage(uri, aiPreference, apiKey, manualName);
      if (id !== requestId.current) return;
      setResult(foodResult);
    } catch (e) {
      if (id === requestId.current) {
        setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Photo analysis timed out. Please try again.');
      }
      console.warn('[FoodNutritionModal] Analysis failed:', e);
    } finally {
      if (id === requestId.current) setAnalyzing(false);
    }
  };

  const handleParseNLP = () => {
    if (!manualName.trim()) return;
    try {
      const parsed = NaturalLanguageMealParser.parseMealText(manualName.trim());
      setResult(parsed);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not parse meal description.');
    }
  };

  const handleLog = () => {
    if (!result || logged) return;
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
      photoUri: photoUri,
      allergenWarnings: allergenWarnings.length > 0 ? allergenWarnings : undefined,
      source: result.source,
      upcBarcode: result.barcode,
    });
    setLogged(true);
    Alert.alert('✅ Logged!', `${result.foodName} has been added to your daily log.`);
  };

  const handleManualSave = () => {
    const calories = manualCalories.trim() ? Number(manualCalories) : undefined;
    if (!manualName.trim() || (calories !== undefined && (!Number.isFinite(calories) || calories < 0))) {
      setError('Enter a meal name and a valid nonnegative calorie value, or leave calories blank.');
      return;
    }
    addLoggedItem({
      type: 'Meal',
      name: manualName.trim(),
      value: calories === undefined ? 'Calories not recorded' : `${calories} kcal`,
      calories,
      photoUri,
      source: 'manual',
    });
    setLogged(true);
    setError('');
  };

  if (!visible) return null;

  const sourceLabel =
    result?.source === 'usda'
      ? '📚 USDA Database'
      : result?.source === 'openfoodfacts'
      ? '🌐 Open Food Facts'
      : result?.source === 'cloud-gemini'
      ? '☁️ Cloud Gemini Vision'
      : result?.source === 'on-device'
      ? '⚡ On-Device Food AI'
      : '✏️ Manual Entry';

  return (
    <Sheet title="Nutrition Analysis & Meal Log" onClose={onClose}>
      {/* Photo preview */}
      {photoUri ? (
        <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: 200, borderRadius: 16 }} resizeMode="cover" />
        </View>
      ) : null}

      {/* AI tier indicator */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: aiPreference === 'cloud' ? '#3B82F6' : aiPreference === 'on-device' ? C.green : C.amber,
            }}
          />
          <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600', letterSpacing: 0.5 }}>
            {AI_LABELS[aiPreference]}
          </Text>
        </View>
        <Pressable
          onPress={() => setBarcodeModalOpen(true)}
          style={localStyles.barcodeHeaderBtn}
        >
          <MaterialCommunityIcons name="barcode-scan" size={15} color={C.green} />
          <Text style={localStyles.barcodeHeaderBtnText}>Scan Barcode</Text>
        </Pressable>
      </View>

      {!analyzing && !result && !logged ? (
        <View style={{ gap: 12 }}>
          {aiPreference === 'cloud' && photoUri ? (
            <>
              <Text style={s.body}>
                Send this photo to Google Gemini for a nutrition estimate. A photo cannot rule out hidden ingredients or allergens.
              </Text>
              <Button label="Send photo for analysis" onPress={() => { if (photoUri) analyzePhoto(photoUri); }} />
            </>
          ) : photoUri ? (
            <>
              <Text style={s.body}>
                On-device Visual Intelligence identifies foods locally using the Apple Neural Engine and the offline USDA database. 100% private.
              </Text>
              <Button label="⚡ Identify photo with On-Device AI" onPress={() => { if (photoUri) analyzePhoto(photoUri); }} />
            </>
          ) : null}

          {/* Meal Name Input with real-time offline autocomplete */}
          <View style={{ position: 'relative' }}>
            <Field
              label="Search food or enter meal name"
              value={manualName}
              onChangeText={(text) => {
                setManualName(text);
                setAutocompleteVisible(true);
              }}
              placeholder="e.g. Apple, Chicken breast, Brown rice..."
            />

            {/* Offline USDA Autocomplete Suggestions */}
            {autocompleteVisible && suggestions.length > 0 && (
              <View style={localStyles.suggestionsBox}>
                <View style={localStyles.suggestionsHeader}>
                  <Text style={localStyles.suggestionsHeaderText}>⚡ OFFLINE USDA MATCHES</Text>
                  <Pressable onPress={() => setAutocompleteVisible(false)}>
                    <MaterialCommunityIcons name="close" size={16} color={C.muted} />
                  </Pressable>
                </View>
                {suggestions.map(({ food }) => (
                  <Pressable
                    key={food.fdcId}
                    onPress={() => handleSelectUSDAFood(food)}
                    style={localStyles.suggestionItem}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={localStyles.suggestionName}>{food.name}</Text>
                      <Text style={localStyles.suggestionDetail}>
                        {food.servingUnit} · {food.category}
                      </Text>
                    </View>
                    <View style={localStyles.suggestionCalorieBadge}>
                      <Text style={localStyles.suggestionCalorieText}>{food.calories} kcal</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Field
            label="Calories (optional, kcal)"
            value={manualCalories}
            onChangeText={setManualCalories}
            keyboardType="decimal-pad"
            placeholder="e.g. 350"
          />

          {manualName.trim().length > 2 && (
            <Button
              label="⚡ Parse meal with On-Device AI"
              secondary
              onPress={handleParseNLP}
            />
          )}

          <Button label="Save manual meal" onPress={handleManualSave} />
        </View>
      ) : null}

      {logged && !result ? (
        <View style={{ paddingVertical: 12, gap: 12 }}>
          <Text style={s.body}>Meal saved to your journal and timeline.</Text>
          <Button label="Done" onPress={onClose} />
        </View>
      ) : null}

      {/* Analyzing state */}
      {analyzing ? (
        <Animated.View style={{ opacity: pulseAnim, paddingVertical: 32, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, color: C.ink, fontWeight: '600' }}>Analyzing nutrition & allergens…</Text>
          <Text style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Using {AI_LABELS[aiPreference]}</Text>
        </Animated.View>
      ) : null}

      {/* Error */}
      {error ? <Text style={[s.error, { marginBottom: 12 }]}>{error}</Text> : null}

      {/* Results Card */}
      {result && !analyzing ? (
        <View style={{ gap: 16 }}>
          {/* Source origin banner */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={localStyles.sourceOriginPill}>
              <Text style={localStyles.sourceOriginText}>{sourceLabel}</Text>
            </View>
            <Pressable
              onPress={() => {
                setResult(null);
                setLogged(false);
                setManualName('');
                setManualCalories('');
              }}
            >
              <Text style={{ fontSize: 12, color: C.green, fontWeight: '600' }}>Change food</Text>
            </Pressable>
          </View>

          {/* Food name and portion */}
          <View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{result.foodName}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Portion: {result.portionEstimate}</Text>
            <Text style={{ fontSize: 10, color: C.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
              {result.confidence === 'high' ? 'High confidence match' : result.confidence === 'medium' ? 'Medium confidence' : 'Estimated values'}
            </Text>
          </View>

          {/* Calorie banner */}
          <View style={{ backgroundColor: C.pale, borderRadius: 16, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 36, fontWeight: '800', color: C.green }}>{result.calories}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.muted, letterSpacing: 1 }}>CALORIES</Text>
          </View>

          {/* Macro pills */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: 'Protein', value: `${result.protein}g`, color: '#3B82F6' },
              { label: 'Carbs', value: `${result.carbs}g`, color: '#F59E0B' },
              { label: 'Fat', value: `${result.fat}g`, color: '#EF4444' },
            ].map(macro => (
              <View key={macro.label} style={{ flex: 1, backgroundColor: `${macro.color}12`, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: macro.color }}>{macro.value}</Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: C.muted, marginTop: 2 }}>{macro.label}</Text>
              </View>
            ))}
          </View>

          {/* Micronutrients */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: 'Fiber', value: `${result.fiber}g` },
              { label: 'Sugar', value: `${result.sugar}g` },
              { label: 'Sodium', value: `${result.sodium}mg` },
            ].map(micro => (
              <View key={micro.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.ink }}>{micro.value}</Text>
                <Text style={{ fontSize: 10, color: C.muted }}>{micro.label}</Text>
              </View>
            ))}
          </View>

          {/* Allergen warning or safe badge */}
          {allergenWarnings.length > 0 ? (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 14, gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.red }}>⚠️ Allergen Alert</Text>
              <Text style={{ fontSize: 12, color: C.red }}>
                Detected allergens: {allergenWarnings.join(', ')}
              </Text>
            </View>
          ) : allergies.length > 0 ? (
            <View style={{ backgroundColor: '#DCFCE7', borderRadius: 12, padding: 14, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>✓ No known allergens detected</Text>
              <Text style={{ fontSize: 11, color: '#166534' }}>Checked against: {allergies.join(', ')}</Text>
            </View>
          ) : null}

          {/* Log button */}
          <Button
            label={logged ? '✓ Logged to journal' : 'Log to daily journal'}
            onPress={handleLog}
            disabled={logged}
            icon={logged ? 'check' : 'plus'}
          />
        </View>
      ) : null}

      {/* Retry if photo analysis failed */}
      {error && photoUri ? (
        <Button label="Retry analysis" secondary onPress={() => analyzePhoto(photoUri)} />
      ) : null}

      {/* Submodal: Barcode Scanner */}
      <BarcodeScannerModal
        visible={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        onScanned={(scannedFood) => {
          setResult(scannedFood);
          setBarcodeModalOpen(false);
        }}
      />
    </Sheet>
  );
}

const localStyles = StyleSheet.create({
  barcodeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.pale,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  barcodeHeaderBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.green,
  },
  suggestionsBox: {
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  suggestionsHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.green,
    letterSpacing: 0.5,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  suggestionName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  suggestionDetail: {
    fontSize: 11,
    color: C.muted,
    marginTop: 1,
  },
  suggestionCalorieBadge: {
    backgroundColor: C.pale,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  suggestionCalorieText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.green,
  },
  sourceOriginPill: {
    backgroundColor: C.bg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  sourceOriginText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
  },
});
