/**
 * @file src/components/BottomNavBar.tsx
 * @description Material 3 bottom navigation bar with an animated capsule
 * indicator that translates horizontally between tab positions using a
 * spring-physics Animated.Value.
 *
 * Design token alignment (from Screen 5 / Screen 6 Stitch spec):
 *   - Surface: #FFFFFF (bg-white)
 *   - Primary: hsl(152 60% 35%) → #227C54 (text-primary / bg-primary)
 *   - Inactive icon: hsl(220 15% 45%) → #6B7A87 (text-secondary)
 *   - Capsule height: 40px, corner-radius: rounded-full
 *   - Nav bar height: 72px with 20px horizontal padding
 *   - Border top: 1px hsl(220 20% 90%) separator
 *   - Safe-area bottom inset handled via react-native-safe-area-context
 *
 * PROPS:
 *   activeIndex  — currently selected tab index (0-based)
 *   onTabPress   — callback invoked with the pressed tab index
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Pressable,
  Animated,
  Text,
  LayoutChangeEvent,
  AccessibilityRole,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NavTab = {
  /** Unique key used as the React list key. */
  readonly key: string;
  /** Human-readable label rendered below the icon. */
  readonly label: string;
  /** MaterialCommunityIcons name for the inactive (outline) state. */
  readonly icon: string;
  /** MaterialCommunityIcons name for the active (filled) state. */
  readonly activeIcon: string;
  /** Accessibility hint read by screen readers. */
  readonly a11yHint: string;
};

export interface BottomNavBarProps {
  /** 0-based index of the currently active tab. */
  activeIndex: number;
  /** Fired when the user presses a tab with that tab's index. */
  onTabPress: (index: number) => void;
  /** Optional custom tab definitions. Defaults to the 3-tab SafeScale set. */
  tabs?: NavTab[];
}

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

const DEFAULT_TABS: ReadonlyArray<NavTab> = [
  {
    key: 'home',
    label: 'Home',
    icon: 'home-outline',
    activeIcon: 'home',
    a11yHint: 'Navigate to the Home dashboard',
  },
  {
    key: 'scan',
    label: 'Scan',
    icon: 'barcode-scan',
    activeIcon: 'barcode-scan',
    a11yHint: 'Open the allergen scanner',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: 'chart-line',
    activeIcon: 'chart-line',
    a11yHint: 'View your health analytics dashboard',
  },
] as const;

// ---------------------------------------------------------------------------
// Design constants
// ---------------------------------------------------------------------------

/** Horizontal padding on each side of the nav bar (matches 20px design spec). */
const H_PADDING = 20;

/**
 * Height of the sliding capsule indicator in logical pixels.
 * Chosen to cleanly house both the icon (24px) and label (11px) with 5px
 * vertical breathing room on each side.
 */
const CAPSULE_HEIGHT = 52;

/** Width of the capsule indicator. Calculated from measured tab width. */
const CAPSULE_WIDTH_RATIO = 0.82; // 82% of the tab slot width

/** Spring animation configuration — tuned for a snappy but smooth feel. */
const SPRING_CONFIG: Animated.SpringAnimationConfig = {
  toValue: 0, // overridden at call-site
  useNativeDriver: true,
  tension: 320,
  friction: 28,
  overshootClamping: false,
};

/** Pressed scale for the icon micro-animation (Pressable feedback). */
const ICON_PRESS_SCALE = 0.88;

// ---------------------------------------------------------------------------
// Sub-component: single tab slot
// ---------------------------------------------------------------------------

interface TabItemProps {
  tab: NavTab;
  isActive: boolean;
  onPress: () => void;
  scaleAnim: Animated.Value;
}

const TabItem = React.memo<TabItemProps>(
  ({ tab, isActive, onPress, scaleAnim }) => {
    const iconColor = isActive ? '#227C54' : '#6B7A87';
    const labelColor = isActive ? '#227C54' : '#6B7A87';
    const iconName = isActive ? tab.activeIcon : tab.icon;
    const fontWeight = isActive
      ? ('700' as const)
      : ('400' as const);

    return (
      <Pressable
        onPress={onPress}
        accessible
        accessibilityRole={'tab' as AccessibilityRole}
        accessibilityLabel={tab.label}
        accessibilityHint={tab.a11yHint}
        accessibilityState={{ selected: isActive }}
        className="flex-1 items-center justify-center"
        style={{ height: CAPSULE_HEIGHT }}
        android_ripple={{ color: 'rgba(34,124,84,0.10)', borderless: true }}
      >
        <Animated.View
          style={{ transform: [{ scale: scaleAnim }] }}
          className="items-center justify-center gap-y-0.5"
        >
          <MaterialCommunityIcons
            name={iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
            size={24}
            color={iconColor}
          />
          <Text
            style={{
              color: labelColor,
              fontSize: 11,
              fontWeight,
              letterSpacing: 0.2,
            }}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </Animated.View>
      </Pressable>
    );
  },
);

// ---------------------------------------------------------------------------
// BottomNavBar
// ---------------------------------------------------------------------------

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeIndex,
  onTabPress,
  tabs = DEFAULT_TABS as NavTab[],
}) => {
  const insets = useSafeAreaInsets();
  const tabCount = tabs.length;

  /**
   * translateX tracks the horizontal position of the sliding capsule.
   * Initialized to the position of the first tab (index 0).
   */
  const translateX = useRef(new Animated.Value(0)).current;

  /**
   * Measured pixel width of the full nav bar inner area (excluding padding).
   * Used to calculate per-tab slot widths dynamically.
   */
  const innerWidth = useRef<number>(0);

  /**
   * Per-tab scale animations for the icon press micro-interaction.
   * Each tab gets its own Animated.Value so they animate independently.
   */
  const scaleAnims = useRef<Animated.Value[]>(
    tabs.map(() => new Animated.Value(1)),
  ).current;

  // ── Capsule position animation ─────────────────────────────────────────────

  const animateCapsuleTo = useCallback(
    (index: number) => {
      if (innerWidth.current === 0) return;
      const slotWidth = innerWidth.current / tabCount;
      const capsuleWidth = slotWidth * CAPSULE_WIDTH_RATIO;
      // Centre the capsule within its slot:
      const targetX =
        index * slotWidth + (slotWidth - capsuleWidth) / 2;
      Animated.spring(translateX, {
        ...SPRING_CONFIG,
        toValue: targetX,
      }).start();
    },
    [tabCount, translateX],
  );

  /** Re-position immediately whenever activeIndex changes. */
  useEffect(() => {
    animateCapsuleTo(activeIndex);
  }, [activeIndex, animateCapsuleTo]);

  // ── Tab press handler ──────────────────────────────────────────────────────

  const handleTabPress = useCallback(
    (index: number) => {
      // Icon scale pulse: squeeze then spring back
      Animated.sequence([
        Animated.timing(scaleAnims[index], {
          toValue: ICON_PRESS_SCALE,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnims[index], {
          toValue: 1,
          useNativeDriver: true,
          tension: 400,
          friction: 18,
        }),
      ]).start();

      onTabPress(index);
    },
    [scaleAnims, onTabPress],
  );

  // ── Layout measurement ─────────────────────────────────────────────────────

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width } = event.nativeEvent.layout;
      innerWidth.current = width;
      // Position capsule without animation on first mount.
      const slotWidth = width / tabCount;
      const capsuleWidth = slotWidth * CAPSULE_WIDTH_RATIO;
      const initialX =
        activeIndex * slotWidth + (slotWidth - capsuleWidth) / 2;
      translateX.setValue(initialX);
    },
    [activeIndex, tabCount, translateX],
  );

  // ── Capsule width (derived from innerWidth, updated post-layout) ───────────
  // We use a percentage-style approach via flex so the capsule scales
  // correctly on all screen widths without a second layout pass.

  return (
    <View
      style={{
        paddingBottom: insets.bottom,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: 'hsl(220, 20%, 90%)',
        // Elevation for Android Material shadow
        elevation: 12,
        // iOS shadow
        shadowColor: '#1A2129',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      }}
    >
      {/* Inner row — measured for capsule positioning */}
      <View
        onLayout={onLayout}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 72,
          paddingHorizontal: H_PADDING,
          position: 'relative',
        }}
      >
        {/* ── Sliding capsule indicator ────────────────────────────────── */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: (72 - CAPSULE_HEIGHT) / 2,
              height: CAPSULE_HEIGHT,
              // Width is set as a fraction of each tab slot; we derive the
              // pixel value from innerWidth. Use a generous initial value that
              // will be updated once onLayout fires.
              width: `${(CAPSULE_WIDTH_RATIO / tabCount) * 100}%`,
              borderRadius: CAPSULE_HEIGHT / 2,
              backgroundColor: 'hsl(152, 60%, 90%)', // primaryContainer
              transform: [{ translateX }],
            },
          ]}
        />

        {/* ── Tab items ────────────────────────────────────────────────── */}
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.key}
            tab={tab}
            isActive={index === activeIndex}
            onPress={() => handleTabPress(index)}
            scaleAnim={scaleAnims[index]}
          />
        ))}
      </View>
    </View>
  );
};

export default BottomNavBar;
