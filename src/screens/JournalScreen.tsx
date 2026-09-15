import { validateVitalReadings } from '../utils/daily';
import React, { useState } from "react";
import { View, Text, Alert, Image, StyleSheet } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
import FoodNutritionModal from "../components/care/FoodNutritionModal";
import { promptMealPhoto } from "../utils/mealPhotoPicker";
import { classifyBloodPressure } from "../services/CardioDiagnosticsService";
import type { BloodPressureDiagnostic } from "../types";
import {
  Button,
  Card,
  Chips,
  Empty,
  Field,
  Page,
  Sheet,
  Icon,
  s,
  C,
} from "../components/care/UI";

export default function JournalScreen() {
  const moods = useSafeScaleStore((state) => state.moodLogs);
  const symptoms = useSafeScaleStore((state) => state.symptomLogs);
  const loggedItems = useSafeScaleStore((state) => state.loggedItems);
  const vitalsLogs = useSafeScaleStore((state) => state.vitalsLogs);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<"Check-in" | "Symptom" | "Vitals" | null>(null);
  const [foodPhotoUri, setFoodPhotoUri] = useState<string | null>(null);
  const [foodModalOpen, setFoodModalOpen] = useState(false);

  const entries = [
    ...moods.map((item) => ({
      id: `m-${item.id}`,
      rawId: item.id,
      date: item.timestamp,
      kind: "Check-in",
      title: item.feelings.join(", ") || "Daily check-in",
      body: `${item.notes || "No notes added."}\nStress: ${item.stressLevel}`,
      macros: undefined,
      calories: undefined,
      allergenWarnings: undefined as string[] | undefined,
      photoUri: undefined as string | undefined,
      bpDiag: null as BloodPressureDiagnostic | null,
    })),
    ...symptoms.map((item) => ({
      id: `s-${item.id}`,
      rawId: item.id,
      date: `${item.date} ${item.timestamp}`,
      kind: "Symptom",
      title: item.type,
      body: `Self-reported severity: ${item.severity}/10`,
      macros: undefined,
      calories: undefined,
      allergenWarnings: undefined as string[] | undefined,
      photoUri: undefined as string | undefined,
      bpDiag: null as BloodPressureDiagnostic | null,
    })),
    ...loggedItems.map((item) => ({
      id: `l-${item.id}`,
      rawId: item.id,
      date: item.date ? `${item.date} ${item.timestamp}` : item.timestamp,
      kind: item.type === "Meal" ? "Meal" : "Hydration",
      title: item.name,
      body: item.portion ? `Portion: ${item.portion} · ${item.value}` : item.value,
      macros: item.macros,
      calories: item.calories,
      allergenWarnings: item.allergenWarnings,
      photoUri: item.photoUri,
      bpDiag: null as BloodPressureDiagnostic | null,
    })),
    ...vitalsLogs.map((item) => {
      const bpDiag =
        item.systolicBP && item.diastolicBP
          ? classifyBloodPressure(item.systolicBP, item.diastolicBP)
          : null;
      const details: string[] = [];
      if (item.systolicBP && item.diastolicBP) {
        details.push(`Blood Pressure: ${item.systolicBP}/${item.diastolicBP} mmHg`);
      }
      if (item.bloodGlucose) {
        details.push(`Glucose: ${item.bloodGlucose} mg/dL (${item.glucoseContext || 'General'})`);
      }
      if (item.spo2) {
        details.push(`SpO2: ${item.spo2}%`);
      }
      if (item.temperature) {
        details.push(`Temp: ${item.temperature}°F`);
      }

      return {
        id: `v-${item.id}`,
        rawId: item.id,
        date: item.timestamp,
        kind: "Vitals",
        title: item.systolicBP && item.diastolicBP
          ? `BP ${item.systolicBP}/${item.diastolicBP} mmHg`
          : "Vital Signs Log",
        body: details.join(" • ") + (bpDiag ? `\n\nAHA Guidance: ${bpDiag.advice}` : ""),
        macros: undefined,
        calories: undefined,
        allergenWarnings: undefined as string[] | undefined,
        photoUri: undefined as string | undefined,
        bpDiag,
      };
    }),
  ]
    .filter(
      (item) =>
        (filter === "All" || item.kind === filter) &&
        `${item.title} ${item.body} ${item.date}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  function remove(id: string, kind: string) {
    Alert.alert("Delete this entry?", "This removes the saved journal entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (kind === "Symptom") {
            useSafeScaleStore.getState().deleteSymptomLog(id);
          } else if (kind === "Meal" || kind === "Hydration") {
            useSafeScaleStore.getState().deleteLoggedItem(id);
          } else if (kind === "Vitals") {
            useSafeScaleStore.setState((state) => ({
              vitalsLogs: state.vitalsLogs.filter((item) => item.id !== id),
            }));
          } else {
            useSafeScaleStore.setState((state) => ({
              moodLogs: state.moodLogs.filter((item) => item.id !== id),
            }));
          }
        },
      },
    ]);
  }

  function snapMealPhoto() {
    promptMealPhoto((uri) => {
      setFoodPhotoUri(uri);
      setFoodModalOpen(true);
    });
  }

  return (
    <Page
      title="Your health journal"
      subtitle="A place for how you feel, what you eat, and what you want to remember."
    >
      <View style={s.wrap}>
        <Button
          label="New check-in"
          icon="plus"
          onPress={() => setForm("Check-in")}
        />
        <Button
          label="Log a symptom"
          secondary
          onPress={() => setForm("Symptom")}
        />
        <Button
          label="Log vitals & BP"
          secondary
          icon="heart-pulse"
          onPress={() => setForm("Vitals")}
        />
        <Button
          label="Log a meal"
          secondary
          icon="camera"
          onPress={snapMealPhoto}
        />
      </View>
      <Field
        label="Search your journal"
        placeholder="Notes, symptoms, meals, vitals, or a date"
        value={query}
        onChangeText={setQuery}
      />
      <Chips
        options={["All", "Check-in", "Symptom", "Meal", "Vitals"]}
        value={filter}
        onChange={setFilter}
      />
      {entries.length === 0 ? (
        <Card>
          <Empty
            icon="notebook-outline"
            title={
              query || filter !== "All"
                ? "No matching entries"
                : "Start with a small check-in"
            }
            detail={
              query || filter !== "All"
                ? "Try another search or filter."
                : "Capture how you feel, your blood pressure, or a meal you ate."
            }
          />
        </Card>
      ) : (
        entries.map((entry) => (
          <Card key={entry.id}>
            <View style={s.row}>
              <Text style={[s.eyebrow, { flex: 1 }]}>
                {entry.kind.toUpperCase()}
              </Text>
              <Text style={s.body}>{entry.date}</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <Text style={s.heading}>{entry.title}</Text>
              {entry.bpDiag && (
                <View
                  style={[
                    journalStyles.bpBadge,
                    { backgroundColor: entry.bpDiag.color + "20" },
                  ]}
                >
                  <Icon name="heart-pulse" size={14} color={entry.bpDiag.color} />
                  <Text style={[journalStyles.bpBadgeText, { color: entry.bpDiag.color }]}>
                    {entry.bpDiag.label}
                  </Text>
                </View>
              )}
            </View>

            {entry.photoUri ? (
              <Image
                source={{ uri: entry.photoUri }}
                style={{ width: "100%", height: 140, borderRadius: 12, marginVertical: 8 }}
                resizeMode="cover"
              />
            ) : null}
            <Text style={s.body}>{entry.body}</Text>
            {entry.macros ? (
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {entry.calories ? (
                  <View style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#166534" }}>{entry.calories} kcal</Text>
                  </View>
                ) : null}
                <View style={{ backgroundColor: "#DBEAFE", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#1E40AF" }}>{entry.macros.protein ?? '—'}g protein</Text>
                </View>
                <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#92400E" }}>{entry.macros.carbs ?? '—'}g carbs</Text>
                </View>
                <View style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#991B1B" }}>{entry.macros.fat ?? '—'}g fat</Text>
                </View>
              </View>
            ) : null}
            {entry.allergenWarnings && entry.allergenWarnings.length > 0 ? (
              <View style={{ backgroundColor: "#FEE2E2", borderRadius: 8, padding: 8, marginTop: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.red }}>
                  ⚠️ Allergen alert: {entry.allergenWarnings.join(", ")}
                </Text>
              </View>
            ) : null}
            <View style={{ alignSelf: "flex-start", marginTop: 8 }}>
              <Button
                label="Delete entry"
                secondary
                onPress={() => remove(entry.rawId, entry.kind)}
              />
            </View>
          </Card>
        ))
      )}
      {form ? <JournalForm kind={form} onClose={() => setForm(null)} /> : null}
      <FoodNutritionModal
        visible={foodModalOpen}
        onClose={() => { setFoodModalOpen(false); setFoodPhotoUri(null); }}
        photoUri={foodPhotoUri ?? undefined}
      />
    </Page>
  );
}

function JournalForm({
  kind,
  onClose,
}: {
  kind: "Check-in" | "Symptom" | "Vitals";
  onClose: () => void;
}) {
  const [feeling, setFeeling] = useState("Okay");
  const [stress, setStress] = useState("Low");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState("3");

  // Vitals state
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [bloodGlucose, setBloodGlucose] = useState("");
  const [glucoseContext, setGlucoseContext] = useState<"Fasting" | "Post-Meal" | "General">("General");
  const [spo2, setSpo2] = useState("");

  const [error, setError] = useState("");

  // Live AHA Blood Pressure classification
  const sysNum = Number(systolic);
  const diaNum = Number(diastolic);
  const bpDiagnostic = sysNum > 50 && diaNum > 30 ? classifyBloodPressure(sysNum, diaNum) : null;

  function save() {
    const store = useSafeScaleStore.getState();
    if (kind === "Symptom") {
      if (!notes.trim())
        return setError("Describe the symptom you want to record.");
      if (!/^([1-9]|10)$/.test(severity))
        return setError("Enter a severity from 1 to 10.");
      store.addSymptomLog({ type: notes.trim(), severity: Number(severity) });
    } else if (kind === "Vitals") {
      const sNum = Number(systolic);
      const dNum = Number(diastolic);
      if (systolic && (isNaN(sNum) || sNum < 40 || sNum > 300)) {
        return setError("Enter a valid systolic blood pressure (40–300 mmHg).");
      }
      if (diastolic && (isNaN(dNum) || dNum < 30 || dNum > 200)) {
        return setError("Enter a valid diastolic blood pressure (30–200 mmHg).");
      }

      const gNum = bloodGlucose ? Number(bloodGlucose) : undefined;
      const oNum = spo2 ? Number(spo2) : undefined;

      const entry = {systolicBP: systolic.trim() ? sNum : undefined, diastolicBP: diastolic.trim() ? dNum : undefined,
        bloodGlucose: gNum, glucoseContext: gNum !== undefined ? glucoseContext : undefined, spo2: oNum};
      const validation = validateVitalReadings(entry);
      if (validation) return setError(validation);
      store.addVitalLog(entry);
    } else {
      store.addMoodLog({
        rating: (
          { Rough: 2, Low: 4, Okay: 6, Good: 8, Great: 10 } as Record<
            string,
            number
          >
        )[feeling],
        stressLevel: stress as "Low" | "Medium" | "High",
        feelings: [feeling],
        notes: notes.trim(),
      });
    }
    onClose();
  }

  const sheetTitle =
    kind === "Check-in"
      ? "How are you feeling?"
      : kind === "Symptom"
      ? "Log a symptom"
      : "Log Vitals & Blood Pressure";

  return (
    <Sheet title={sheetTitle} onClose={onClose}>
      {kind === "Check-in" ? (
        <>
          <Text style={s.label}>Overall feeling</Text>
          <Chips
            options={["Rough", "Low", "Okay", "Good", "Great"]}
            value={feeling}
            onChange={setFeeling}
          />
          <Text style={s.label}>Stress level</Text>
          <Chips
            options={["Low", "Medium", "High"]}
            value={stress}
            onChange={setStress}
          />
          <Field
            label="Notes or questions for your next visit (optional)"
            multiline
            value={notes}
            onChangeText={setNotes}
            maxLength={2000}
          />
        </>
      ) : null}

      {kind === "Symptom" ? (
        <>
          <Field
            label="What did you notice?"
            multiline
            value={notes}
            onChangeText={setNotes}
            maxLength={2000}
          />
          <Field
            label="Severity (1 mild — 10 severe)"
            value={severity}
            onChangeText={setSeverity}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Text style={{ color: C.muted }}>
            This saves your own observations; it does not diagnose symptoms.
          </Text>
        </>
      ) : null}

      {kind === "Vitals" ? (
        <>
          <Text style={s.label}>Blood Pressure (AHA/ACC 2017 Guidelines)</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Systolic (mmHg)"
                placeholder="120"
                value={systolic}
                onChangeText={setSystolic}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Diastolic (mmHg)"
                placeholder="80"
                value={diastolic}
                onChangeText={setDiastolic}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          </View>

          {/* Live AHA Blood Pressure Diagnostic Card */}
          {bpDiagnostic && (
            <View
              style={[
                journalStyles.ahaLiveCard,
                { borderLeftColor: bpDiagnostic.color },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="heart-pulse" size={16} color={bpDiagnostic.color} />
                <Text style={[journalStyles.ahaLiveCategory, { color: bpDiagnostic.color }]}>
                  AHA Classification: {bpDiagnostic.label}
                </Text>
              </View>
              <Text style={journalStyles.ahaLiveAdvice}>{bpDiagnostic.advice}</Text>
              {bpDiagnostic.category === "Crisis" && (
                <View style={journalStyles.crisisBanner}>
                  <Text style={journalStyles.crisisBannerText}>
                    ⚠️ Emergency Alert: Hypertensive crisis levels detected. Rest 5 minutes and re-test. If sustained, seek immediate emergency medical care.
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text style={[s.label, { marginTop: 12 }]}>Blood Glucose & Oxygenation</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Glucose (mg/dL)"
                placeholder="95"
                value={bloodGlucose}
                onChangeText={setBloodGlucose}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Oxygen (SpO2 %)"
                placeholder="98"
                value={spo2}
                onChangeText={setSpo2}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          </View>

          {bloodGlucose ? (
            <>
              <Text style={s.label}>Glucose Context</Text>
              <Chips
                options={["Fasting", "Post-Meal", "General"]}
                value={glucoseContext}
                onChange={(c) => setGlucoseContext(c as any)}
              />
            </>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save entry" onPress={save} />
    </Sheet>
  );
}

const journalStyles = StyleSheet.create({
  bpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  bpBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  ahaLiveCard: {
    backgroundColor: C.bg,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    marginVertical: 8,
    gap: 4,
  },
  ahaLiveCategory: {
    fontSize: 13,
    fontWeight: "700",
  },
  ahaLiveAdvice: {
    fontSize: 12,
    color: C.ink,
    lineHeight: 16,
  },
  crisisBanner: {
    backgroundColor: "#FCE8E6",
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  crisisBannerText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#A33F39",
    lineHeight: 15,
  },
});
