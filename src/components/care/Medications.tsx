import React, { useState } from "react";
import { View, Text, Alert, Platform } from "react-native";
import { useSafeScaleStore } from "../../store/useSafeScaleStore";
import { Button, Card, Empty, Field, Heading, Sheet, s, C } from "./UI";

export default function Medications() {
  const meds = useSafeScaleStore((state) => state.medicationSchedule);
  const [adding, setAdding] = useState(false);
  const [refill, setRefill] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  return (
    <Card>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Heading
            title="Your medication routine"
            detail="Record what you took today."
          />
        </View>
        <Button
          label="Add"
          icon="plus"
          secondary
          onPress={() => setAdding(true)}
        />
      </View>
      {meds.length === 0 ? (
        <Empty
          icon="pill"
          title="A routine you can keep track of"
          detail="Add a medication and the time from your existing instructions. Each entry tracks one daily dose."
        />
      ) : (
        [...meds]
          .sort((a, b) => a.time.localeCompare(b.time))
          .map((med) => (
            <View
              key={med.id}
              style={{
                gap: 12,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderColor: C.line,
              }}
            >
              <View style={s.row}>
                <Text style={[s.label, { color: C.green, width: 48 }]}>
                  {med.time}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.heading}>{med.name}</Text>
                  <Text style={s.body}>{med.dosage}</Text>
                </View>
              </View>
              <View style={s.wrap}>
                <Button
                  label={
                    med.status === "Completed"
                      ? `Undo ${med.name}`
                      : `Mark ${med.name} taken`
                  }
                  icon={
                    med.status === "Completed"
                      ? "check-circle-outline"
                      : "check"
                  }
                  secondary={med.status === "Completed"}
                  onPress={() =>
                    useSafeScaleStore
                      .getState()
                      .setMedicationStatus(
                        med.id,
                        med.status === "Completed" ? "Pending" : "Completed",
                      )
                  }
                />
                <Button
                  label={`Stock${med.stock === undefined ? "" : `: ${med.stock}`}`}
                  secondary
                  onPress={() => {
                    setAmount("");
                    setRefill(med.id);
                  }}
                />
                <Button
                  label={`Remove ${med.name}`}
                  secondary
                  onPress={() =>
                    Alert.alert(
                      "Remove medication?",
                      "This removes the schedule and cancels its reminder.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () =>
                            useSafeScaleStore
                              .getState()
                              .removeMedication(med.id),
                        },
                      ],
                    )
                  }
                />
              </View>
              {med.stock !== undefined &&
              med.stock <= (med.refillThreshold ?? 5) ? (
                <Text style={{ color: C.amber }}>
                  Low stock · {med.stock} doses recorded remaining
                </Text>
              ) : null}
            </View>
          ))
      )}
      {adding ? <MedicationForm onClose={() => setAdding(false)} /> : null}
      {refill ? (
        <Sheet title="Add to medication stock" onClose={() => setRefill(null)}>
          <Field
            label="Number of doses to add"
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Button
            label="Update stock"
            disabled={
              !/^\d+$/.test(amount) ||
              Number(amount) < 1 ||
              Number(amount) > 10000
            }
            onPress={() => {
              useSafeScaleStore
                .getState()
                .refillMedication(refill, Number(amount));
              setRefill(null);
            }}
          />
        </Sheet>
      ) : null}
    </Card>
  );
}
function MedicationForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [time, setTime] = useState("08:00");
  const [stock, setStock] = useState("");
  const [error, setError] = useState("");
  function save() {
    if (!name.trim() || !dosage.trim())
      return setError(
        "Enter a name and dose from your medication instructions.",
      );
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      return setError("Use a 24-hour time, such as 08:30 or 21:00.");
    if (stock && (!/^\d+$/.test(stock) || Number(stock) > 10000))
      return setError(
        "Stock must be a whole number from 0 to 10000, or left blank.",
      );
    useSafeScaleStore
      .getState()
      .addMedication({
        name: name.trim(),
        dosage: dosage.trim(),
        time,
        stock: stock ? Number(stock) : undefined,
        icon: "pill",
      });
    onClose();
  }
  return (
    <Sheet title="Add a daily medication" onClose={onClose}>
      <Field
        label="Medication name"
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <Field
        label="Dose as prescribed"
        placeholder="Copy the label instructions"
        value={dosage}
        onChangeText={setDosage}
        maxLength={100}
      />
      <Field
        label="Daily time (24-hour HH:MM)"
        value={time}
        onChangeText={setTime}
        maxLength={5}
      />
      <Field
        label="Doses remaining (optional)"
        value={stock}
        onChangeText={setStock}
        keyboardType="number-pad"
      />
      <Text style={s.body}>
        {Platform.OS === "web"
          ? "Browser mode saves your routine. Notifications require the native app."
          : "The app will request a daily local reminder. Delivery depends on notification permissions and device settings."}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save medication" onPress={save} />
    </Sheet>
  );
}
