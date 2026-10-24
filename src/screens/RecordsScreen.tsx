import React, { useState } from "react";
import { View, Text, Share, Platform, Alert } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
import type { MedicalRecord } from "../types";
import { localDate, validDate } from "../utils/daily";
import { visitSummary } from "../utils/visitSummary";
import {
  Button,
  Card,
  Chips,
  Empty,
  Field,
  Page,
  Sheet,
  s,
} from "../components/care/UI";
const types = ["All", "LabResult", "Prescription", "Condition", "Immunization"];
const labels: Record<string, string> = {
  All: "All",
  LabResult: "Lab results",
  Prescription: "Prescriptions",
  Condition: "Conditions",
  Immunization: "Immunizations",
};
export default function RecordsScreen() {
  const records = useSafeScaleStore((state) => state.medicalRecords);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState("");
  const visible = records
    .filter(
      (record) =>
        (filter === "All" || record.type === filter) &&
        `${record.title} ${record.value} ${record.provider} ${record.date}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  async function share() {
    if (!summary) return;
    try {
      if (Platform.OS === "web") {
        const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `healthfolio-visit-${localDate()}.txt`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else await Share.share({ message: summary, title: "My visit notes" });
    } catch {
      setError(
        "Sharing could not finish. You can select and copy the summary below.",
      );
    }
  }
  return (
    <Page
      title="Records, within reach."
      subtitle="Find what you need before your next appointment."
    >
      <View style={s.wrap}>
        <Button
          label="Add a record"
          icon="plus"
          onPress={() => setAdding(true)}
        />
        <Button
          label="Prepare visit summary"
          secondary
          icon="text-box-outline"
          onPress={() => {
            setError("");
            setSummary(visitSummary(useSafeScaleStore.getState()));
          }}
        />
      </View>
      <Field
        label="Search records"
        placeholder="Title, provider, details, or date"
        value={query}
        onChangeText={setQuery}
      />
      <Chips
        options={types.map((t) => labels[t])}
        value={labels[filter]}
        onChange={(label) => setFilter(types.find((t) => labels[t] === label)!)}
      />
      {visible.length === 0 ? (
        <Card>
          <Empty
            icon="folder-heart-outline"
            title={
              records.length
                ? "No matching records"
                : "Your important details, together"
            }
            detail={
              records.length
                ? "Try a different search or category."
                : "Save a lab result, prescription, condition, or immunization using the details in your own records."
            }
          />
        </Card>
      ) : (
        visible.map((record) => (
          <Card key={record.id}>
            <View style={s.row}>
              <Text style={[s.eyebrow, { flex: 1 }]}>
                {labels[record.type]}
              </Text>
              <Text style={s.body}>{record.date}</Text>
            </View>
            <Text style={s.heading}>{record.title}</Text>
            <Text selectable style={s.body}>
              {record.value}
            </Text>
            <Text style={s.label}>
              {record.provider || "Provider not entered"} · {record.status}
            </Text>
            <View style={{ alignSelf: "flex-start" }}>
              <Button
                label="Delete record"
                secondary
                onPress={() =>
                  Alert.alert("Delete record?", record.title, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        useSafeScaleStore
                          .getState()
                          .deleteMedicalRecord(record.id),
                    },
                  ])
                }
              />
            </View>
          </Card>
        ))
      )}
      {adding ? <RecordForm onClose={() => setAdding(false)} /> : null}
      {summary !== null ? (
        <Sheet
          title="Review your visit summary"
          onClose={() => setSummary(null)}
        >
          <Text style={s.body}>
            Includes your name, recorded allergies, medications, recent journal
            entries, and saved records. Review before sharing.
          </Text>
          <Button
            label={
              Platform.OS === "web" ? "Download text summary" : "Share summary"
            }
            onPress={share}
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Text selectable style={s.body}>
            {summary}
          </Text>
        </Sheet>
      ) : null}
    </Page>
  );
}
function RecordForm({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState("LabResult");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(localDate());
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");
  function save() {
    if (!title.trim() || !value.trim())
      return setError("Add a title and the details you want to save.");
    if (!validDate(date)) return setError("Enter a real date as YYYY-MM-DD.");
    useSafeScaleStore
      .getState()
      .addMedicalRecord({
        type: type as MedicalRecord["type"],
        title: title.trim(),
        value: value.trim(),
        date,
        provider: provider.trim(),
        status: "User entered",
      });
    onClose();
  }
  return (
    <Sheet title="Add a health record" onClose={onClose}>
      <Chips
        options={types.slice(1).map((t) => labels[t])}
        value={labels[type]}
        onChange={(label) => setType(types.find((t) => labels[t] === label)!)}
      />
      <Field
        label="Record title"
        value={title}
        onChangeText={setTitle}
        maxLength={150}
      />
      <Field
        label="Details from your record"
        value={value}
        onChangeText={setValue}
        multiline
        maxLength={5000}
      />
      <Field
        label="Record date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        maxLength={10}
      />
      <Field
        label="Provider (optional)"
        value={provider}
        onChangeText={setProvider}
        maxLength={150}
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save record" onPress={save} />
    </Sheet>
  );
}
