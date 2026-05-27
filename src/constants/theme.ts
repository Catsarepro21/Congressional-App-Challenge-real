/**
 * @file theme.ts
 * @description Material 3 Design System token constants for SafeScale Health.
 *
 * Cross-referenced against Stitch Design System Screen ID:
 *   asset-stub-assets-92e53d5e4f4743dba630e7a393eda643-1779903855787
 *
 * These values are the single source of truth for:
 *   - Color palette (M3 tonal system)
 *   - Spacing / padding grid
 *   - Border radius scale
 *   - Typography scale
 *   - Shadow elevations
 *
 * NativeWind (Tailwind v4) equivalents are annotated inline so component
 * authors can use either the constant (for StyleSheet) or the utility class
 * string (for className prop).
 *
 * Usage example (StyleSheet):
 *   import { MD3Colors, MD3Spacing, MD3Radius } from '@/constants/theme';
 *   const styles = StyleSheet.create({
 *     card: { backgroundColor: MD3Colors.surface, borderRadius: MD3Radius.container }
 *   });
 *
 * Usage example (NativeWind className):
 *   <View className="bg-surface rounded-[28px] p-5" />
 */

// ─────────────────────────────────────────────────────────────────────────────
// M3 COLOR PALETTE
// ─────────────────────────────────────────────────────────────────────────────

export const MD3Colors = {
  // Primary Role — Highlights, CTAs, links, active navigation icons
  primary: '#2196F3',            // NativeWind: bg-primary / text-primary
  onPrimary: '#FFFFFF',          // NativeWind: text-on-primary
  primaryContainer: '#D1E4FF',   // NativeWind: bg-primary-container
  onPrimaryContainer: '#001D36', // NativeWind: text-on-primary-container

  // Secondary Role — Supporting interactive elements
  secondary: '#5C6BC0',          // NativeWind: bg-secondary
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E8EAF6',
  onSecondaryContainer: '#1A237E',

  // Tertiary Role — Accent / callout highlights
  tertiary: '#7B1FA2',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#F3E5F5',
  onTertiaryContainer: '#4A148C',

  // Error / Allergen Alert Role — Coral-Red system alert block
  // Triggered when AllergenEngine.checkIntersection returns matchFound === true
  error: '#DE3730',              // NativeWind: bg-error / text-error
  onError: '#FFFFFF',            // NativeWind: text-on-error
  errorContainer: '#FFDAD6',     // NativeWind: bg-error-container (bottom sheet background)
  onErrorContainer: '#410002',   // NativeWind: text-on-error-container

  // Success / Safe State Role — Forest Green macro nutrient pills
  // Rendered when hasTriggeredAllergen === false
  success: '#2E7D32',            // NativeWind: bg-success / text-success
  onSuccess: '#FFFFFF',          // NativeWind: text-on-success
  successContainer: '#C8E6C9',   // NativeWind: bg-success-container
  onSuccessContainer: '#0A2F1D', // NativeWind: text-on-success-container

  // Warning Role — Medication schedule reminders
  warning: '#E65100',
  onWarning: '#FFFFFF',
  warningContainer: '#FFF3E0',
  onWarningContainer: '#3E2723',

  // Neutral Surface Roles
  background: '#0F1117',         // Dark-mode base background
  onBackground: '#E6E0E9',       // Primary text on background
  surface: '#1C1B1F',            // Card / container surface
  onSurface: '#E6E0E9',          // Text on surface
  surfaceVariant: '#49454F',     // Variant surface (bottom nav, dividers)
  onSurfaceVariant: '#CAC4D0',   // Secondary text on surface variant

  // Outline
  outline: '#938F99',            // Borders, dividers, input outlines
  outlineVariant: '#49454F',     // Subtle separators

  // Scrim — overlay behind modals and bottom sheets
  scrim: 'rgba(0, 0, 0, 0.5)',
} as const;

export type MD3ColorKey = keyof typeof MD3Colors;

// ─────────────────────────────────────────────────────────────────────────────
// SPACING GRID (base-8 with design-spec 20px standard)
// ─────────────────────────────────────────────────────────────────────────────

export const MD3Spacing = {
  /** 4px — micro gap between tightly coupled elements */
  xs: 4,
  /** 8px — standard inner padding for pill tags and chips */
  sm: 8,
  /** 12px — medium gap between list items */
  md: 12,
  /** 16px — card internal gap between content rows */
  lg: 16,
  /** 20px — STANDARD horizontal/vertical structural padding per design spec */
  xl: 20,
  /** 24px — generous padding for header sections */
  xxl: 24,
  /** 32px — section-level spacing */
  xxxl: 32,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BORDER RADIUS SCALE (Material 3 Shape System)
// ─────────────────────────────────────────────────────────────────────────────

export const MD3Radius = {
  /** 4px — Extra small: chip check-boxes, small icons */
  extraSmall: 4,
  /** 8px — Small: input fields, small cards */
  small: 8,
  /** 12px — Medium: inner sub-components, secondary containers */
  element: 12,
  /** 16px — Large: modal inner containers, secondary cards */
  large: 16,
  /** 28px — EXTRA LARGE: primary card containers, bottom modal sheets per M3 spec */
  container: 28,
  /** 9999px — Full pill: navigation FABs, macro nutrient tags, filter chips */
  pill: 9999,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY SCALE (Inter / Outfit via Google Fonts via expo-font)
// ─────────────────────────────────────────────────────────────────────────────

export const MD3Typography = {
  displayLarge:  { fontFamily: 'Outfit-Bold',    fontSize: 57, lineHeight: 64, letterSpacing: -0.25 },
  displayMedium: { fontFamily: 'Outfit-Bold',    fontSize: 45, lineHeight: 52 },
  displaySmall:  { fontFamily: 'Outfit-Regular', fontSize: 36, lineHeight: 44 },

  headlineLarge:  { fontFamily: 'Inter-SemiBold', fontSize: 32, lineHeight: 40 },
  headlineMedium: { fontFamily: 'Inter-SemiBold', fontSize: 28, lineHeight: 36 },
  headlineSmall:  { fontFamily: 'Inter-SemiBold', fontSize: 24, lineHeight: 32 },

  titleLarge:  { fontFamily: 'Inter-Medium', fontSize: 22, lineHeight: 28 },
  titleMedium: { fontFamily: 'Inter-Medium', fontSize: 16, lineHeight: 24, letterSpacing: 0.15 },
  titleSmall:  { fontFamily: 'Inter-Medium', fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },

  bodyLarge:  { fontFamily: 'Inter-Regular', fontSize: 16, lineHeight: 24, letterSpacing: 0.5 },
  bodyMedium: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, letterSpacing: 0.25 },
  bodySmall:  { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },

  labelLarge:  { fontFamily: 'Inter-Medium', fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  labelMedium: { fontFamily: 'Inter-Medium', fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  labelSmall:  { fontFamily: 'Inter-Medium', fontSize: 11, lineHeight: 16, letterSpacing: 0.5 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ELEVATION / SHADOW TOKENS (M3 Tonal Elevation)
// ─────────────────────────────────────────────────────────────────────────────

export const MD3Elevation = {
  /** Level 0 — flat surface, no shadow */
  level0: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Level 1 — cards at rest */
  level1: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  /** Level 2 — cards on hover / focused inputs */
  level2: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  /** Level 3 — bottom navigation bar */
  level3: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  /** Level 5 — modal bottom sheets and floating panels */
  level5: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATION DURATIONS (milliseconds) — consistent M3 motion system
// ─────────────────────────────────────────────────────────────────────────────

export const MD3Motion = {
  durationShort1: 50,
  durationShort2: 100,
  durationMedium1: 200,
  durationMedium2: 300,
  durationLong1: 450,
  durationLong2: 500,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BOTTOM NAVIGATION BAR TOKEN MAP
// ─────────────────────────────────────────────────────────────────────────────

export const MD3BottomNav = {
  height: 80,
  iconSize: 24,
  labelSize: MD3Typography.labelMedium.fontSize,
  activeColor: MD3Colors.primary,
  inactiveColor: MD3Colors.onSurfaceVariant,
  backgroundColor: MD3Colors.surface,
  indicatorColor: MD3Colors.primaryContainer,
  indicatorRadius: MD3Radius.pill,
  indicatorPaddingH: 16,
  indicatorPaddingV: 4,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED THEME BUNDLE
// ─────────────────────────────────────────────────────────────────────────────

export const MD3Theme = {
  colors: MD3Colors,
  spacing: MD3Spacing,
  radius: MD3Radius,
  typography: MD3Typography,
  elevation: MD3Elevation,
  motion: MD3Motion,
  bottomNav: MD3BottomNav,
} as const;

export type MD3Theme = typeof MD3Theme;
