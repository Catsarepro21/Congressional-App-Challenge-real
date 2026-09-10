import React, { useState } from "react";
import { View, Text, Alert } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
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
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<"Check-in" | "Symptom" | null>(null);
  const entries = [
    ...moods.map((item) => ({
      id: `m-${item.id}`,
      rawId: item.id,
      date: item.timestamp,
      kind: "Check-in",
      title: item.feelings.join(", ") || "Daily check-in",
      body: `${item.notes || "No notes added."}\nStress: ${item.stressLevel}`,
    })),
    ...symptoms.map((item) => ({
      id: `s-${item.id}`,
      rawId: item.id,
      date: `${item.date} ${item.timestamp}`,
      kind: "Symptom",
      title: item.type,
      body: `Self-reported severity: ${item.severity}/10`,
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
          else
            useSafeScaleStore.setState((state) => ({
              moodLogs: state.moodLogs.filter((item) => item.id !== id),
            }));
        },
      },
    ]);
  }
  return (
    <Page
      title="Your health journal"
      subtitle="A place for how you feel and what you want to remember."
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
      </View>
      <Field
        label="Search your journal"
        placeholder="Notes, symptoms, or a date"
        value={query}
        onChangeText={setQuery}
      />
      <Chips
        options={["All", "Check-in", "Symptom"]}
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
                : "Capture how you feel, a question for your clinician, or something you noticed today."
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
            <Text style={s.body}>{entry.body}</Text>
            <View style={{ alignSelf: "flex-start" }}>
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
