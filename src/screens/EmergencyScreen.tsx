import React from "react";
import { View, Text, Linking, Alert } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
import { Button, Card, Heading, Page, C, s } from "../components/care/UI";
export default function EmergencyScreen() {
  const profile = useSafeScaleStore((state) => state.profile);
  const allergies = useSafeScaleStore((state) => state.userAllergies);
  const contacts = useSafeScaleStore((state) => state.emergencyContacts);
  const meds = useSafeScaleStore((state) => state.medicationSchedule);
  const demo = useSafeScaleStore((state) => state.isTestMode);
  async function call(phone: string) {
    try {
      await Linking.openURL(`tel:${phone.replace(/[^+\d]/g, "")}`);
    } catch {
      Alert.alert(
        "Could not open phone app",
        `Call ${phone} using your phone.`,
      );
    }
  }
  return (
    <Page
      title="Medical ID"
      subtitle="Your saved information, ready to show someone."
    >
      {demo ? (
        <Text style={{ color: C.amber }}>
          FICTIONAL SAMPLE DATA · Calling is disabled.
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: C.ink,
          borderRadius: 24,
          padding: 28,
          gap: 13,
        }}
      >
        <Text
          style={{
            color: "#A4D6BD",
            fontSize: 12,
            letterSpacing: 2,
            fontWeight: "700",
          }}
        >
          PERSONAL MEDICAL CARD
        </Text>
        <Text style={{ color: C.white, fontSize: 30, fontWeight: "700" }}>
          {profile.name || "Name not entered"}
        </Text>
        <Text style={{ color: "#D2E2DB", lineHeight: 23 }}>
          Date of birth: {profile.dob || "Not entered"}
          {"\n"}Blood type: {profile.bloodType || "Unknown"}
        </Text>
      </View>
      <Card>
        <Heading title="Recorded allergies" />
        <Text style={s.heading}>
          {allergies.length
            ? allergies.join(", ")
            : "No allergy information entered"}
        </Text>
        <Text style={s.body}>
          User-entered information; confirm with the person or their clinician.
        </Text>
      </Card>
      <Card>
        <Heading title="Medication schedule" />
        {meds.length ? (
          meds.map((med) => (
            <View key={med.id}>
              <Text style={s.label}>{med.name}</Text>
              <Text style={s.body}>
                {med.dosage} · {med.time} daily
              </Text>
            </View>
          ))
        ) : (
          <Text style={s.body}>No medications entered.</Text>
        )}
      </Card>
      <Card>
        <Heading title="People to contact" />
        {contacts.length ? (
          contacts.map((contact) => (
            <View key={contact.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{contact.name}</Text>
                <Text selectable style={s.body}>
                  {contact.phone}
                </Text>
              </View>
              <Button
                label={`Call ${contact.name}`}
                disabled={demo}
                secondary
                onPress={() =>
                  Alert.alert(`Call ${contact.name}?`, contact.phone, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Call", onPress: () => call(contact.phone) },
                  ])
                }
              />
            </View>
          ))
        ) : (
          <Text style={s.body}>Add contacts in Settings.</Text>
        )}
      </Card>
      <Text style={s.body}>
        This card is available inside Healthfolio. It does not set up your phone’s
        lock-screen Medical ID or contact emergency services automatically.
      </Text>
    </Page>
  );
}
