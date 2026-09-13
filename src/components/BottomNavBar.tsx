import React from "react";
import { View, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, Icon, type IconName } from "./care/UI";
const tabs: { index: number; label: string; icon: IconName }[] = [
  { index: 0, label: "Today", icon: "view-dashboard-outline" },
  { index: 1, label: "Activity", icon: "heart-pulse" },
  { index: 2, label: "Journal", icon: "notebook-outline" },
  { index: 3, label: "Records", icon: "folder-heart-outline" },
  { index: 4, label: "Profile", icon: "account-circle-outline" },
];
export function BottomNavBar({
  activeIndex,
  onTabPress,
}: {
  activeIndex: number;
  onTabPress: (index: number) => void;
}) {
  const inset = useSafeAreaInsets();
  const normalizedIndex =
    activeIndex === 9 ? 2 : activeIndex === 8 ? 4 : activeIndex === 6 ? 2 : activeIndex === 7 ? 3 : activeIndex === 5 ? 4 : activeIndex;

  return (
    <View
      style={{
        backgroundColor: C.white,
        paddingBottom: Math.max(8, inset.bottom),
        paddingTop: 8,
        borderTopWidth: 1,
        borderColor: C.line,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          maxWidth: 700,
          alignSelf: "center",
          paddingHorizontal: 6,
        }}
      >
        {tabs.map((tab) => {
          const isSelected = tab.index === normalizedIndex;
          return (
            <Pressable
              key={tab.index}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onTabPress(tab.index)}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                paddingVertical: 8,
                minHeight: 58,
                borderRadius: 14,
                backgroundColor: isSelected ? C.pale : "transparent",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Icon
                name={tab.icon}
                color={isSelected ? C.green : C.muted}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: isSelected ? C.green : C.muted,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
