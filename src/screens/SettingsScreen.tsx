import React, { useState } from "react";
import { View, Text, Alert } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
import { validDate, localDate } from "../utils/daily";
import HealthConnections from "../components/care/HealthConnections";
import AIProviderSelector from "../components/care/AIProviderSelector";
import { AIIntelligenceService } from "../services/AIIntelligenceService";
import {
  Button,
  Card,
  Chips,
  Field,
  Heading,
  Page,
  Sheet,
  C,
  s,
} from "../components/care/UI";
const bloodTypes = [
  "Unknown",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];
export default function SettingsScreen() {
  const profile = useSafeScaleStore((state) => state.profile);
  const allergies = useSafeScaleStore((state) => state.userAllergies);
  const contacts = useSafeScaleStore((state) => state.emergencyContacts);
  const demo = useSafeScaleStore((state) => state.isTestMode);
  const [name, setName] = useState(profile.name);
  const [dob, setDob] = useState(profile.dob);
  const [blood, setBlood] = useState(profile.bloodType || "Unknown");

  React.useEffect(() => {
    if (profile.name) setName(profile.name);
    if (profile.dob) setDob(profile.dob);
    if (profile.bloodType) setBlood(profile.bloodType);
  }, [profile.name, profile.dob, profile.bloodType]);

  const [allergy, setAllergy] = useState("");
  const [contactForm, setContactForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [localAiTesting, setLocalAiTesting] = useState(false);
  const [localAiResult, setLocalAiResult] = useState<{
    runtime: string;
    latencyMs: number;
    summary: string;
    flagged: string[];
  } | null>(null);

  async function testLocalAI() {
    setLocalAiTesting(true);
    try {
      const testIngredients = ["Wheat flour", "Skim milk powder", "Soy lecithin", "Cane sugar", "Cocoa butter"];
      const startTime = Date.now();
      const result = await AIIntelligenceService.analyzeIngredients(
        'on-device',
        testIngredients,
        allergies.length > 0 ? allergies : ["Milk", "Soy"],
        "Sample Wafer"
      );
      const elapsed = Date.now() - startTime;
      const flagged = result.insights
        .filter((i) => i.category === 'Allergen')
        .map((i) => i.name);
      const report = {
        runtime: 'Offline ingredient checker',
        latencyMs: elapsed,
        summary: result.summary,
        flagged,
      };
      setLocalAiResult(report);
      Alert.alert(
        "Offline Ingredient Checker Result",
        `Engine: ${report.runtime}\nExecution: 100% On-Device (Zero network bytes)\nLatency: ${report.latencyMs} ms\nResult: ${report.summary}\nDetected Allergens: ${report.flagged.join(', ') || 'None'}`
      );
    } catch (err: any) {
      Alert.alert("Ingredient Check Error", err?.message || "Inference failed.");
    } finally {
      setLocalAiTesting(false);
    }
  }

  function save() {
    setMessage("");
    setError("");
    if (dob && (!validDate(dob) || dob > localDate()))
      return setError(
        "Use a real birth date in YYYY-MM-DD format, or leave it blank.",
      );
    useSafeScaleStore
      .getState()
      .updateProfile({ name: name.trim(), dob, bloodType: blood });
    setMessage("Profile saved.");
  }
  return (
    <Page
      title="Make it yours."
      subtitle="Your profile, allergies, and people to contact."
    >
      <Card><HealthConnections /><Button label="Review onboarding" secondary onPress={() => useSafeScaleStore.getState().resetOnboarding()} /></Card>
      <Card>
        <AIProviderSelector value={useSafeScaleStore.getState().aiPreference} onChange={(pref) => useSafeScaleStore.getState().setAIPreference(pref)} showHeading />
        <View style={{ marginTop: 12, gap: 10, borderTopWidth: 1, borderColor: C.line, paddingTop: 12 }}>
          <Text style={s.label}>Offline Ingredient Checker</Text>
          <Text style={s.body}>Check sample ingredients against saved allergies using the offline rules. This does not test Apple Foundation Models.</Text>
          <Button
            label={localAiTesting ? "Checking Ingredients…" : "Test Offline Ingredient Checker"}
            secondary
            onPress={testLocalAI}
            disabled={localAiTesting}
          />
          {localAiResult ? (
            <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: "#BBF7D0" }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#166534" }}>✓ Local Engine Executed Successfully</Text>
              <Text style={{ fontSize: 11, color: "#166534" }}>{localAiResult.runtime} · {localAiResult.latencyMs}ms latency · 0 network calls</Text>
              <Text style={{ fontSize: 11, color: C.ink, marginTop: 2 }}>{localAiResult.summary}</Text>
            </View>
          ) : null}
        </View>
      </Card>
      <Card>
        <Heading
          title="Personal details"
          detail="All fields are optional. Enter only details you want to keep here."
        />
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          maxLength={100}
        />
        <Field
          label="Date of birth (YYYY-MM-DD, optional)"
          value={dob}
          onChangeText={setDob}
          maxLength={10}
        />
        <Text style={s.label}>Blood type · leave Unknown unless confirmed</Text>
        <Chips options={bloodTypes} value={blood} onChange={setBlood} />
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={s.body}>
            {message}
          </Text>
        ) : null}
        <Button label="Save profile" onPress={save} />
      </Card>
      <Card>
        <Heading
          title="Recorded allergies"
          detail="These appear on your Medical ID and visit summary."
        />
        {allergies.length ? (
          allergies.map((item) => (
            <View key={item} style={s.row}>
              <Text style={[s.label, { flex: 1 }]}>{item}</Text>
              <Button
                label={`Remove ${item}`}
                secondary
                onPress={() =>
                  Alert.alert("Remove recorded allergy?", item, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      onPress: () =>
                        useSafeScaleStore.getState().removeAllergy(item),
                    },
                  ])
                }
              />
            </View>
          ))
        ) : (
          <Text style={s.body}>No allergies entered.</Text>
        )}
        <Field
          label="Add a known allergy"
          value={allergy}
          onChangeText={setAllergy}
          maxLength={100}
        />
        <Button
          label="Add allergy"
          disabled={!allergy.trim()}
          secondary
          onPress={() => {
            useSafeScaleStore.getState().addAllergy(allergy.trim());
            setAllergy("");
          }}
        />
      </Card>
      <Card>
        <Heading
          title="Emergency contacts"
          detail="Choose people you want listed on your Medical ID."
        />
        {contacts.map((contact) => (
          <View key={contact.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{contact.name}</Text>
              <Text style={s.body}>{contact.phone}</Text>
            </View>
            <Button
              label={`Remove ${contact.name}`}
              secondary
              onPress={() =>
                Alert.alert("Remove contact?", contact.name, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    onPress: () =>
                      useSafeScaleStore
                        .getState()
                        .removeEmergencyContact(contact.id),
                  },
                ])
              }
            />
          </View>
        ))}
        <Button
          label="Add contact"
          secondary
          onPress={() => setContactForm(true)}
        />
      </Card>
      <Card>
        <Heading
          title="Your data"
          detail="Native app records are encrypted on this device. The web preview saves records in browser storage. Clearing app or browser data removes those records."
        />
        <Text style={s.body}>
          Use Records → Prepare visit summary to review and export your notes.
          This summary is not a complete backup. Native health sync is available
          from Today.
        </Text>
        <Heading
          title="Sample mode"
          detail="Explore fictional data. Your saved records are restored when you exit. Sample edits are not saved over your own data."
        />
        <Button
          label={demo ? "Exit sample mode" : "Try sample mode"}
          secondary
          onPress={() => {
            useSafeScaleStore.getState().toggleTestMode();
            useSafeScaleStore.getState().ensureCurrentDay();
            const p = useSafeScaleStore.getState().profile;
            setName(p.name);
            setDob(p.dob);
            setBlood(p.bloodType);
            setMessage("");
          }}
        />
      </Card>
      {contactForm ? (
        <ContactForm onClose={() => setContactForm(false)} />
      ) : null}
    </Page>
  );
}
function ContactForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  return (
    <Sheet title="Add emergency contact" onClose={onClose}>
      <Field
        label="Contact name"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={30}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button
        label="Save contact"
        onPress={() => {
          if (
            !name.trim() ||
            !/^[+\d\s().-]+$/.test(phone) ||
            phone.replace(/\D/g, "").length < 7
          )
            return setError("Enter a name and a valid phone number.");
          useSafeScaleStore
            .getState()
            .addEmergencyContact({ name: name.trim(), phone: phone.trim() });
          onClose();
        }}
      />
    </Sheet>
  );
}
