import React from "react";
import { View, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, Icon, type IconName } from "./care/UI";
const tabs: { index: number; label: string; icon: IconName }[] = [
  { index: 0, label: "Today", icon: "view-dashboard-outline" },
  { index: 6, label: "Journal", icon: "notebook-outline" },
  { index: 7, label: "Records", icon: "folder-heart-outline" },
  { index: 4, label: "Medical ID", icon: "card-account-details-outline" },
  { index: 5, label: "Settings", icon: "cog-outline" },
];
export function BottomNavBar({
  activeIndex,
  onTabPress,
}: {
  activeIndex: number;
  onTabPress: (index: number) => void;
}) {
  const inset = useSafeAreaInsets();
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
        {tabs.map((tab) => (
          <Pressable
            key={tab.index}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: tab.index === activeIndex }}
            onPress={() => onTabPress(tab.index)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              paddingVertical: 8,
              minHeight: 58,
              borderRadius: 14,
              backgroundColor:
                activeIndex === tab.index ? C.pale : "transparent",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon
              name={tab.icon}
              color={tab.index === activeIndex ? C.green : C.muted}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: tab.index === activeIndex ? C.green : C.muted,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
