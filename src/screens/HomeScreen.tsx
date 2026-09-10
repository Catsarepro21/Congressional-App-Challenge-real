import React, { useRef, useState } from "react";
import { View, Text, Platform, useWindowDimensions } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
import { HealthDataService } from "../services/HealthDataService";
import { localDate } from "../utils/daily";
import Medications from "../components/care/Medications";
import { Button, Card, Heading, Icon, Page, C, s } from "../components/care/UI";

export default function HomeScreen({
  onNavigate,
}: {
  onNavigate: (index: number) => void;
}) {
  const profile = useSafeScaleStore((state) => state.profile);
  const meds = useSafeScaleStore((state) => state.medicationSchedule);
  const logs = useSafeScaleStore((state) => state.moodLogs);
  const vitals = useSafeScaleStore((state) => state.biometricCore);
  const lastSync = useSafeScaleStore((state) => state.lastSyncedAt);
  const demo = useSafeScaleStore((state) => state.isTestMode);
  const allergies = useSafeScaleStore((state) => state.userAllergies);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const syncLock = useRef(false);
  const { width } = useWindowDimensions();
  const taken = meds.filter((med) => med.status === "Completed").length;
  const today = localDate();
  const checkedIn = logs.some((log) => log.timestamp.slice(0, 10) === today);
  async function sync() {
    if (syncLock.current) return;
    if (demo)
      return setMessage(
        "Sample mode is active. Exit in Settings to sync your own data.",
      );
    if (Platform.OS === "web")
      return setMessage(
        "Health syncing is available in the native iPhone and Android app. You can use the journal and records here.",
      );
    syncLock.current = true;
    setSyncing(true);
    setMessage("");
    try {
      const allowed =
        Platform.OS === "ios"
          ? await HealthDataService.requestHealthPermissions()
          : await HealthDataService.requestHealthConnectPermissions();
      if (!allowed) {
        setMessage(
          "Health access was not enabled. You can try again when ready.",
        );
        return;
      }
      const data =
        Platform.OS === "ios"
          ? await HealthDataService.fetchHealthData()
          : await HealthDataService.fetchHealthConnectData();
      if (!data) {
        setMessage(
          "No readable samples were returned. Check your health app permissions and available data.",
        );
        return;
      }
      useSafeScaleStore.getState().updateBiometrics(data);
      useSafeScaleStore.setState({
        lastSyncedAt: new Date().toISOString(),
        hasHealthPermission: true,
      });
      setMessage("Available health readings updated.");
    } catch {
      setMessage(
        "Sync could not finish. Your saved readings have been kept. Try again.",
      );
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }
  return (
    <Page
      title="A little care, every day."
      subtitle={new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
    >
      {demo ? (
        <Text style={[s.label, { color: C.amber }]}>
          SAMPLE MODE · Showing fictional data
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: C.ink,
          borderRadius: 25,
          padding: width > 700 ? 32 : 24,
          gap: 20,
        }}
      >
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: "#A4D6BD",
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: "700",
              }}
            >
              YOUR DAY, AT A GLANCE
            </Text>
            <Text
              style={{
                color: C.white,
                fontSize: 26,
                fontWeight: "600",
                marginTop: 12,
              }}
            >
              {profile.name && profile.name !== "Jane Doe"
                ? `Hello, ${profile.name.split(" ")[0]}.`
                : "Make room for your health."}
            </Text>
          </View>
          <Icon name="leaf-circle-outline" size={52} color="#A4D6BD" />
        </View>
        <Text style={{ color: "#D2E2DB", fontSize: 15, lineHeight: 24 }}>
          {meds.length
            ? `${taken} of ${meds.length} daily doses recorded. ${taken === meds.length ? "Your medication log is up to date." : "Your routine is ready below."}`
            : "Keep your routine, notes, and health records together."}
        </Text>
        <View style={s.wrap}>
          <Button
            label={checkedIn ? "View your check-in" : "How are you feeling?"}
            secondary
            icon="notebook-outline"
            onPress={() => onNavigate(6)}
          />
          <Button
            label="Medical ID"
            secondary
            icon="card-account-details-outline"
            onPress={() => onNavigate(4)}
          />
        </View>
      </View>
      <View style={{ flexDirection: width >= 850 ? "row" : "column", gap: 20 }}>
        <View style={{ flex: 1.5, gap: 20 }}>
          <Medications />
          <Card>
            <Heading
              title="Keep the details that matter"
              detail="Write down symptoms and questions while they are fresh, then bring them to your next appointment."
            />
            <View style={s.wrap}>
              <Button
                label="Open journal"
                secondary
                onPress={() => onNavigate(6)}
              />
              <Button
                label="View records"
                secondary
                onPress={() => onNavigate(7)}
              />
            </View>
          </Card>
        </View>
        <View style={{ flex: 1, gap: 20 }}>
          <Card>
            <View style={s.row}>
              <Icon name="heart-pulse" />
              <Heading title="Latest readings" />
            </View>
            <Text style={s.body}>
              {lastSync
                ? `Last synced ${new Date(lastSync).toLocaleString()}`
                : "No health sync yet. Connect when you are ready."}
            </Text>
            {[
              [
                "Heart rate",
                vitals.heartRate > 0
                  ? `${Math.round(vitals.heartRate)} bpm`
                  : "No reading",
              ],
              [
                "Sleep",
                vitals.sleepMinutes > 0
                  ? `${Math.floor(vitals.sleepMinutes / 60)}h ${Math.round(vitals.sleepMinutes % 60)}m`
                  : "No reading",
              ],
              [
                "Steps",
                vitals.steps > 0
                  ? Math.round(vitals.steps).toLocaleString()
                  : "No reading",
              ],
            ].map(([label, value]) => (
              <View
                key={label}
                style={[
                  s.row,
                  {
                    justifyContent: "space-between",
                    borderBottomWidth: 1,
                    borderColor: C.line,
                    paddingBottom: 12,
                  },
                ]}
              >
                <Text style={s.body}>{label}</Text>
                <Text style={s.heading}>{value}</Text>
              </View>
            ))}
            <Button
              label={syncing ? "Syncing…" : "Sync health readings"}
              disabled={syncing}
              secondary
              icon="sync"
              onPress={sync}
            />
            {message ? (
              <Text accessibilityLiveRegion="polite" style={s.body}>
                {message}
              </Text>
            ) : null}
          </Card>
          <Card>
            <Heading
              title="Your allergy list"
              detail={
                allergies.length
                  ? allergies.join(" · ")
                  : "No allergies recorded. Add known allergies in your profile."
              }
            />
            <Button
              label="Edit profile & allergies"
              secondary
              onPress={() => onNavigate(5)}
            />
          </Card>
        </View>
      </View>
    </Page>
  );
}
