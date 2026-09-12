import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Alert, Animated, Image, Platform } from 'react-native';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { FoodVisionService } from '../../services/FoodVisionService';
import { AllergenEngine } from '../../services/AllergenEngine';
import type { FoodAnalysisResult, AIIntelligenceProvider } from '../../types';
import { Button, Heading, Sheet, s, C } from './UI';

const AI_LABELS: Record<AIIntelligenceProvider, string> = {
  'on-device': 'On-Device AI',
  'cloud': 'Cloud AI (Gemini)',
  'opt-out': 'Offline Database',
};

interface FoodNutritionModalProps {
  visible: boolean;
  onClose: () => void;
  photoUri?: string;
}

export default function FoodNutritionModal({ visible, onClose, photoUri }: FoodNutritionModalProps) {
  const addLoggedItem = useSafeScaleStore(s => s.addLoggedItem);
  const aiPreference = useSafeScaleStore(s => s.aiPreference);
  const profile = useSafeScaleStore(s => s.profile);
  const allergies = useSafeScaleStore(s => s.userAllergies);
  const apiKey = (profile.geminiApiKey && profile.geminiApiKey.trim())
    || (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [allergenWarnings, setAllergenWarnings] = useState<string[]>([]);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState('');
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (analyzing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [analyzing, pulseAnim]);

  useEffect(() => {
    if (visible && photoUri && !result && !analyzing) {
      analyzePhoto(photoUri);
    }
    if (!visible) {
      setResult(null);
      setAllergenWarnings([]);
      setLogged(false);
      setError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, photoUri]);

  async function analyzePhoto(uri: string) {
    setAnalyzing(true);
    setError('');
    try {
      const foodResult = await FoodVisionService.analyzeImage(uri, aiPreference, apiKey);
      setResult(foodResult);
      // Cross-check ingredients for allergens if available
      if (foodResult.ingredients && foodResult.ingredients.length > 0 && allergies.length > 0) {
        const match = AllergenEngine.analyzeIngredients(foodResult.ingredients, allergies, foodResult.foodName);
        if (match.matchFound) {
          setAllergenWarnings(match.flaggedIngredients);
        }
      }
    } catch (e) {
      setError('Could not analyze the food photo. Please try again.');
      console.warn('[FoodNutritionModal] Analysis failed:', e);
    } finally {
      setAnalyzing(false);
    }
  }

  function handleLog() {
    if (!result) return;
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
    });
    setLogged(true);
    Alert.alert('✅ Logged!', `${result.foodName} has been added to your daily log.`);
  }

  if (!visible) return null;

  return (
    <Sheet title="Nutrition analysis" onClose={onClose}>
      {/* Photo preview */}
      {photoUri ? (
        <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: 200, borderRadius: 16 }} resizeMode="cover" />
        </View>
      ) : null}

      {/* AI tier indicator */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: aiPreference === 'cloud' ? '#3B82F6' : aiPreference === 'on-device' ? C.green : C.muted }} />
        <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600', letterSpacing: 0.5 }}>
          {AI_LABELS[aiPreference]}
        </Text>
      </View>

      {/* Analyzing state */}
      {analyzing ? (
        <Animated.View style={{ opacity: pulseAnim, paddingVertical: 32, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, color: C.ink, fontWeight: '600' }}>Analyzing nutrition & allergens…</Text>
          <Text style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Using {AI_LABELS[aiPreference]}</Text>
        </Animated.View>
      ) : null}

      {/* Error */}
      {error ? <Text style={[s.error, { marginBottom: 12 }]}>{error}</Text> : null}

      {/* Results */}
      {result && !analyzing ? (
        <View style={{ gap: 16 }}>
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

      {/* Retry */}
      {error && photoUri ? (
        <Button label="Retry analysis" secondary onPress={() => analyzePhoto(photoUri)} />
      ) : null}
    </Sheet>
  );
}
