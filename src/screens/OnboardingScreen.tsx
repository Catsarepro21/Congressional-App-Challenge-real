import React, { useState } from "react";
import { View, Text } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
import {
  Button,
  Card,
  Field,
  Heading,
  Icon,
  Page,
  C,
  s,
} from "../components/care/UI";
export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  function begin() {
    const store = useSafeScaleStore.getState();
    store.completeOnboarding(
      {
        ...store.profile,
        name: name.trim(),
        dob: "",
        bloodType: "Unknown",
        height: 0,
        weight: 0,
      },
      [],
    );
    onDone();
  }
  return (
    <Page
      title="Your health. A little clearer."
      subtitle="A simple home for your routines, notes, and records."
    >
      <View
        style={{
          backgroundColor: C.ink,
          borderRadius: 25,
          padding: 30,
          gap: 18,
        }}
      >
        <Icon name="leaf-circle-outline" color="#A4D6BD" size={66} />
        <Text
          style={{
            color: C.white,
            fontSize: 26,
            lineHeight: 35,
            fontWeight: "600",
          }}
        >
          Less to keep in your head.{"\n"}More ready when you need it.
        </Text>
        <Text style={{ color: "#D2E2DB", lineHeight: 23 }}>
          Keep track of daily medication, capture how you feel, and prepare
          notes for your next appointment.
        </Text>
      </View>
      <Card>
        <Heading
          title="Start with your name"
          detail="Optional. You can add other details later in Settings."
        />
        <Field
          label="What should we call you?"
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          maxLength={100}
        />
        <Button label="Get started" onPress={begin} />
        <Text style={s.body}>
          No account required. Your entries are stored on this device. Clearing
          app or browser data removes them; app storage is not encrypted by
          SafeScale.
        </Text>
      </Card>
    </Page>
  );
}
