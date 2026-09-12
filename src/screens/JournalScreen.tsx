import React, { useState } from "react";
import { View, Text, Alert, Image } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
import FoodNutritionModal from "../components/care/FoodNutritionModal";
import { promptMealPhoto } from "../utils/mealPhotoPicker";
import {
  Button,
  Card,
  Chips,
  Empty,
  Field,
  Page,
  Sheet,
  s,
  C,
} from "../components/care/UI";

export default function JournalScreen() {
  const moods = useSafeScaleStore((state) => state.moodLogs);
  const symptoms = useSafeScaleStore((state) => state.symptomLogs);
  const loggedItems = useSafeScaleStore((state) => state.loggedItems);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<"Check-in" | "Symptom" | null>(null);
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
    })),
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
          if (kind === "Symptom")
            useSafeScaleStore.getState().deleteSymptomLog(id);
          else if (kind === "Meal" || kind === "Hydration")
            useSafeScaleStore.getState().deleteLoggedItem(id);
          else
            useSafeScaleStore.setState((state) => ({
              moodLogs: state.moodLogs.filter((item) => item.id !== id),
            }));
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
          label="Log a meal"
          secondary
          icon="camera"
          onPress={snapMealPhoto}
        />
      </View>
      <Field
        label="Search your journal"
        placeholder="Notes, symptoms, meals, or a date"
        value={query}
        onChangeText={setQuery}
      />
      <Chips
        options={["All", "Check-in", "Symptom", "Meal"]}
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
                : "Capture how you feel, a meal you ate, or something you noticed today."
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
            <Text style={s.heading}>{entry.title}</Text>
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
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#1E40AF" }}>{entry.macros.protein}g protein</Text>
                </View>
                <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#92400E" }}>{entry.macros.carbs}g carbs</Text>
                </View>
                <View style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#991B1B" }}>{entry.macros.fat}g fat</Text>
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
  kind: "Check-in" | "Symptom";
  onClose: () => void;
}) {
  const [feeling, setFeeling] = useState("Okay");
  const [stress, setStress] = useState("Low");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState("3");
  const [error, setError] = useState("");
  function save() {
    const store = useSafeScaleStore.getState();
    if (kind === "Symptom") {
      if (!notes.trim())
        return setError("Describe the symptom you want to record.");
      if (!/^([1-9]|10)$/.test(severity))
        return setError("Enter a severity from 1 to 10.");
      store.addSymptomLog({ type: notes.trim(), severity: Number(severity) });
    } else
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
    onClose();
  }
  return (
    <Sheet
      title={kind === "Check-in" ? "How are you feeling?" : "Log a symptom"}
      onClose={onClose}
    >
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
        </>
      ) : null}
      <Field
        label={
          kind === "Check-in"
            ? "Notes or questions for your next visit (optional)"
            : "What did you notice?"
        }
        multiline
        value={notes}
        onChangeText={setNotes}
        maxLength={2000}
      />
      {kind === "Symptom" ? (
        <>
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
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save entry" onPress={save} />
    </Sheet>
  );
}
