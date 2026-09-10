import React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export const C = {
  ink: "#172F32",
  muted: "#607476",
  green: "#18685D",
  pale: "#E5F0E9",
  bg: "#F5F6F1",
  line: "#DFE5DF",
  white: "#FFFFFF",
  amber: "#875B24",
  red: "#A33F39",
};
export type IconName = React.ComponentProps<
  typeof MaterialCommunityIcons
>["name"];
export function Icon({
  name,
  color = C.green,
  size = 23,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return <MaterialCommunityIcons name={name} color={color} size={size} />;
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      {icon ? (
        <Icon name={icon} size={19} color={secondary ? C.green : C.white} />
      ) : null}
      <Text style={[s.buttonText, secondary && { color: C.green }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Page({
  title,
  subtitle,
  children,
  action,
}: React.PropsWithChildren<{
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}>) {
  const inset = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      contentContainerStyle={{
        paddingTop: inset.top + 24,
        paddingBottom: 32,
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{ width: "100%", maxWidth: 1000, alignSelf: "center", gap: 22 }}
      >
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>SAFESCALE / HEALTH COMPANION</Text>
            <Text accessibilityRole="header" style={s.title}>
              {title}
            </Text>
            <Text style={s.body}>{subtitle}</Text>
          </View>
          {action}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}
export function Card({ children }: React.PropsWithChildren) {
  return <View style={s.card}>{children}</View>;
}
export function Heading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ gap: 5 }}>
      <Text accessibilityRole="header" style={s.heading}>
        {title}
      </Text>
      {detail ? <Text style={s.body}>{detail}</Text> : null}
    </View>
  );
}
export function Empty({
  icon,
  title,
  detail,
}: {
  icon: IconName;
  title: string;
  detail: string;
}) {
  return (
    <View style={{ paddingVertical: 18, gap: 9 }}>
      <Icon name={icon} size={30} />
      <Text style={s.heading}>{title}</Text>
      <Text style={s.body}>{detail}</Text>
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={C.muted}
        {...props}
        style={[
          s.input,
          props.multiline && { minHeight: 95, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Sheet({
  title,
  onClose,
  children,
}: React.PropsWithChildren<{ title: string; onClose: () => void }>) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "height" : undefined}
        style={s.overlay}
      >
        <View accessibilityViewIsModal style={s.sheet}>
          <View style={s.row}>
            <Text accessibilityRole="header" style={[s.heading, { flex: 1 }]}>
              {title}
            </Text>
            <Button label="Close" secondary onPress={onClose} />
          </View>
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            automaticallyAdjustKeyboardInsets={false}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 17, paddingBottom: 16 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Chips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={s.wrap}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option }}
          onPress={() => onChange(option)}
          style={[
            s.chip,
            value === option && {
              backgroundColor: C.green,
              borderColor: C.green,
            },
          ]}
        >
          <Text style={[s.label, value === option && { color: C.white }]}>
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export const s = StyleSheet.create({
  title: {
    fontSize: 36,
    lineHeight: 43,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -1.2,
    marginVertical: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: C.green,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -0.4,
  },
  body: { fontSize: 14, lineHeight: 22, color: C.muted },
  label: { fontSize: 13, lineHeight: 19, color: C.ink, fontWeight: "600" },
  card: {
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: C.line,
    gap: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: C.green,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  secondary: { backgroundColor: C.pale },
  buttonText: { color: C.white, fontSize: 13, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#B9CAC2",
    borderRadius: 12,
    padding: 13,
    minHeight: 48,
    color: C.ink,
    fontSize: 16,
    backgroundColor: C.white,
  },
  chip: {
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(16,35,33,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    flex: 1,
    minHeight: 0,
    backgroundColor: C.bg,
    padding: 22,
    borderRadius: 24,
    maxHeight: "90%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 20,
  },
  error: { color: C.red, fontSize: 14, lineHeight: 21 },
});
