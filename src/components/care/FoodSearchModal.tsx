/**
 * @file src/components/care/FoodSearchModal.tsx
 * @description Offline-first searchable food database browser powered by USDA FoodData Central.
 *
 * Allows users to search, filter by category, adjust portions, inspect macros,
 * verify allergen safety, and log meals to their daily journal with zero network latency.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { USDALookupService } from '../../services/USDALookupService';
import { AllergenEngine } from '../../services/AllergenEngine';
import type { USDAFoodEntry, FoodCategory, FoodAnalysisResult } from '../../types';
import { Sheet, Button, C, s } from './UI';

interface FoodSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectFood?: (result: FoodAnalysisResult) => void;
}

const CATEGORIES: ('All' | FoodCategory)[] = [
  'All',
  'Fruits',
  'Vegetables',
  'Poultry & Meat',
  'Fish & Seafood',
  'Dairy & Eggs',
  'Grains & Pasta',
  'Legumes & Beans',
  'Nuts & Seeds',
  'Beverages',
  'Snacks & Sweets',
  'Fast Food',
  'Condiments & Sauces',
  'Prepared Meals',
];

const MULTIPLIERS = [0.5, 1, 1.5, 2];

export default function FoodSearchModal({ visible, onClose, onSelectFood }: FoodSearchModalProps) {
  const addLoggedItem = useSafeScaleStore(state => state.addLoggedItem);
  const allergies = useSafeScaleStore(state => state.userAllergies);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | FoodCategory>('All');
  const [selectedFood, setSelectedFood] = useState<USDAFoodEntry | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [loggedNotification, setLoggedNotification] = useState<string | null>(null);

  // Search and filter results
  const searchResults = useMemo(() => {
    const categoryFilter = selectedCategory === 'All' ? undefined : selectedCategory;
    return USDALookupService.searchFoods(searchQuery, {
      category: categoryFilter,
      limit: 40,
    });
  }, [searchQuery, selectedCategory]);

  // Derived FoodAnalysisResult for the currently selected food
  const analysisResult = useMemo(() => {
    if (!selectedFood) return null;
    return USDALookupService.toFoodAnalysisResult(selectedFood, multiplier);
  }, [selectedFood, multiplier]);

  // Allergen cross-check
  const allergenWarnings = useMemo(() => {
    if (!analysisResult || !allergies.length) return [];
    if (!analysisResult.ingredients || !analysisResult.ingredients.length) return [];
    const check = AllergenEngine.analyzeIngredients(
      analysisResult.ingredients,
      allergies,
      analysisResult.foodName,
    );
    return check.matchFound ? check.flaggedIngredients : [];
  }, [analysisResult, allergies]);

  const handleSelectFood = (food: USDAFoodEntry) => {
    setSelectedFood(food);
    setMultiplier(1);
    setLoggedNotification(null);
  };

  const handleLogFood = () => {
    if (!analysisResult) return;

    if (onSelectFood) {
      onSelectFood(analysisResult);
      onClose();
      return;
    }

    addLoggedItem({
      type: 'Meal',
      name: analysisResult.foodName,
      value: `${analysisResult.calories} kcal`,
      calories: analysisResult.calories,
      macros: {
        carbs: analysisResult.carbs,
        protein: analysisResult.protein,
        fat: analysisResult.fat,
        fiber: analysisResult.fiber,
        sugar: analysisResult.sugar,
        sodium: analysisResult.sodium,
      },
      portion: analysisResult.portionEstimate,
      allergenWarnings: allergenWarnings.length > 0 ? allergenWarnings : undefined,
      source: 'usda',
      upcBarcode: analysisResult.barcode,
    });

    setLoggedNotification(`✓ Logged ${analysisResult.foodName} (${analysisResult.calories} kcal)`);
    Alert.alert('✅ Logged!', `${analysisResult.foodName} has been added to your journal.`);
  };

  if (!visible) return null;

  return (
    <Sheet title="Search USDA Food Database" onClose={onClose}>
      {/* Search Input Bar */}
      <View style={localStyles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={22} color={C.muted} />
        <TextInput
          style={localStyles.searchInput}
          placeholder="Search 500+ foods (e.g. apple, salmon, rice)..."
          placeholderTextColor={C.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus={false}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={C.muted} />
          </Pressable>
        )}
      </View>

      {/* Category Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={localStyles.categoryScroll}
      >
        {CATEGORIES.map(cat => (
          <Pressable
            key={cat}
            onPress={() => setSelectedCategory(cat)}
            style={[
              localStyles.categoryPill,
              selectedCategory === cat && localStyles.categoryPillActive,
            ]}
          >
            <Text
              style={[
                localStyles.categoryPillText,
                selectedCategory === cat && localStyles.categoryPillTextActive,
              ]}
            >
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Selected Food Detail Card */}
      {selectedFood && analysisResult ? (
        <View style={localStyles.detailCard}>
          <View style={localStyles.detailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={localStyles.detailCategory}>{selectedFood.category.toUpperCase()}</Text>
              <Text style={localStyles.detailTitle}>{selectedFood.name}</Text>
              <Text style={localStyles.detailServing}>Base serving: {selectedFood.servingUnit}</Text>
            </View>
            <Pressable onPress={() => setSelectedFood(null)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={20} color={C.muted} />
            </Pressable>
          </View>

          {/* Portion Multiplier Selector */}
          <View style={localStyles.portionRow}>
            <Text style={localStyles.portionLabel}>Portion:</Text>
            <View style={localStyles.multiplierButtons}>
              {MULTIPLIERS.map(m => (
                <Pressable
                  key={m}
                  onPress={() => setMultiplier(m)}
                  style={[
                    localStyles.multiplierBtn,
                    multiplier === m && localStyles.multiplierBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      localStyles.multiplierText,
                      multiplier === m && localStyles.multiplierTextActive,
                    ]}
                  >
                    {m}x
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Calorie & Macro Banner */}
          <View style={localStyles.macroBanner}>
            <View style={localStyles.calorieBlock}>
              <Text style={localStyles.calorieNumber}>{analysisResult.calories}</Text>
              <Text style={localStyles.calorieLabel}>CALORIES</Text>
            </View>
            <View style={localStyles.macroColumns}>
              <View style={localStyles.macroCol}>
                <Text style={[localStyles.macroVal, { color: '#3B82F6' }]}>
                  {analysisResult.protein}g
                </Text>
                <Text style={localStyles.macroName}>Protein</Text>
              </View>
              <View style={localStyles.macroCol}>
                <Text style={[localStyles.macroVal, { color: '#F59E0B' }]}>
                  {analysisResult.carbs}g
                </Text>
                <Text style={localStyles.macroName}>Carbs</Text>
              </View>
              <View style={localStyles.macroCol}>
                <Text style={[localStyles.macroVal, { color: '#EF4444' }]}>
                  {analysisResult.fat}g
                </Text>
                <Text style={localStyles.macroName}>Fat</Text>
              </View>
            </View>
          </View>

          {/* Micronutrient Details */}
          <View style={localStyles.microRow}>
            <Text style={localStyles.microText}>Fiber: {analysisResult.fiber}g</Text>
            <Text style={localStyles.microText}>Sugar: {analysisResult.sugar}g</Text>
            <Text style={localStyles.microText}>Sodium: {analysisResult.sodium}mg</Text>
          </View>

          {/* Allergen Warning or Safe Pill */}
          {allergenWarnings.length > 0 ? (
            <View style={localStyles.allergenAlert}>
              <MaterialCommunityIcons name="alert" size={18} color={C.red} />
              <Text style={localStyles.allergenAlertText}>
                Contains potential allergen: {allergenWarnings.join(', ')}
              </Text>
            </View>
          ) : allergies.length > 0 ? (
            <View style={localStyles.allergenSafe}>
              <MaterialCommunityIcons name="shield-check" size={16} color="#166534" />
              <Text style={localStyles.allergenSafeText}>
                No allergens detected ({allergies.join(', ')})
              </Text>
            </View>
          ) : null}

          {/* Log button */}
          <Button
            label={loggedNotification ? '✓ Saved to Journal' : 'Log to Journal'}
            onPress={handleLogFood}
            icon={loggedNotification ? 'check' : 'plus'}
          />
        </View>
      ) : null}

      {/* Results Header / Count */}
      <View style={localStyles.resultsHeader}>
        <Text style={localStyles.resultsCount}>
          {searchResults.length} {searchResults.length === 1 ? 'food' : 'foods'} found
        </Text>
        <Text style={localStyles.offlineBadge}>⚡ 100% Offline USDA</Text>
      </View>

      {/* Results List */}
      <View style={{ gap: 8, paddingBottom: 24 }}>
        {searchResults.map(({ food, matchedAlias }) => {
          const isSelected = selectedFood?.fdcId === food.fdcId;
          return (
            <Pressable
              key={food.fdcId}
              onPress={() => handleSelectFood(food)}
              style={[
                localStyles.foodCard,
                isSelected && localStyles.foodCardSelected,
              ]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={localStyles.foodName}>{food.name}</Text>
                <Text style={localStyles.foodUnit}>{food.servingUnit}</Text>
                {matchedAlias && (
                  <Text style={localStyles.matchedAlias}>Matched alias: {matchedAlias}</Text>
                )}
                <View style={localStyles.cardPills}>
                  <Text style={[localStyles.cardPill, { backgroundColor: '#3B82F614', color: '#1D4ED8' }]}>
                    P: {food.protein}g
                  </Text>
                  <Text style={[localStyles.cardPill, { backgroundColor: '#F59E0B14', color: '#B45309' }]}>
                    C: {food.carbs}g
                  </Text>
                  <Text style={[localStyles.cardPill, { backgroundColor: '#EF444414', color: '#B91C1C' }]}>
                    F: {food.fat}g
                  </Text>
                </View>
              </View>

              <View style={localStyles.calorieBadge}>
                <Text style={localStyles.calorieBadgeNumber}>{food.calories}</Text>
                <Text style={localStyles.calorieBadgeUnit}>kcal</Text>
              </View>
            </Pressable>
          );
        })}

        {searchResults.length === 0 && (
          <View style={localStyles.emptyState}>
            <MaterialCommunityIcons name="food-off" size={40} color={C.muted} />
            <Text style={localStyles.emptyTitle}>No matching foods found</Text>
            <Text style={localStyles.emptyDetail}>
              Try searching with common food names (e.g. &quot;chicken&quot;, &quot;egg&quot;, &quot;banana&quot;) or browse categories above.
            </Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}

const localStyles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: C.ink,
    paddingVertical: 8,
  },
  categoryScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  categoryPillActive: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
  },
  categoryPillTextActive: {
    color: C.white,
  },
  detailCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    gap: 14,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: C.green,
    letterSpacing: 1,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.ink,
    marginTop: 2,
  },
  detailServing: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  portionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  multiplierButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  multiplierBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  multiplierBtnActive: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  multiplierText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.ink,
  },
  multiplierTextActive: {
    color: C.white,
  },
  macroBanner: {
    flexDirection: 'row',
    backgroundColor: C.pale,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  calorieBlock: {
    alignItems: 'center',
    paddingRight: 16,
    borderRightWidth: 1,
    borderColor: C.line,
    minWidth: 85,
  },
  calorieNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: C.green,
  },
  calorieLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 0.5,
  },
  macroColumns: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingLeft: 8,
  },
  macroCol: {
    alignItems: 'center',
  },
  macroVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  macroName: {
    fontSize: 10,
    fontWeight: '600',
    color: C.muted,
    marginTop: 2,
  },
  microRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  microText: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '500',
  },
  allergenAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  allergenAlertText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: C.red,
  },
  allergenSafe: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  allergenSafeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  resultsCount: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
  },
  offlineBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: C.green,
  },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    gap: 12,
  },
  foodCardSelected: {
    borderColor: C.green,
    backgroundColor: '#F7FAF8',
  },
  foodName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  foodUnit: {
    fontSize: 11,
    color: C.muted,
  },
  matchedAlias: {
    fontSize: 10,
    fontStyle: 'italic',
    color: C.green,
  },
  cardPills: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  cardPill: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  calorieBadge: {
    alignItems: 'center',
    backgroundColor: C.pale,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 54,
  },
  calorieBadgeNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: C.green,
  },
  calorieBadgeUnit: {
    fontSize: 9,
    fontWeight: '600',
    color: C.muted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  emptyDetail: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
