import React, { useState } from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { useSafeScaleStore } from "../store/useSafeScaleStore";
import HealthConnections from "../components/care/HealthConnections";
import FoodNutritionModal from "../components/care/FoodNutritionModal";
import { localDate } from "../utils/daily";
import Medications from "../components/care/Medications";
import FastingTracker from "../components/care/FastingTracker";
import { Button, Card, Heading, Icon, Page, Sheet, C, s } from "../components/care/UI";
import { promptMealPhoto } from "../utils/mealPhotoPicker";

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
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [foodPhotoUri, setFoodPhotoUri] = useState<string | null>(null);
  const [foodModalOpen, setFoodModalOpen] = useState(false);
  const isAutoSyncing = useSafeScaleStore((state) => state.isAutoSyncing);
  const { width } = useWindowDimensions();
  const taken = meds.filter((med) => med.status === "Completed").length;
  const today = localDate();
  const checkedIn = logs.some((log) => log.timestamp.slice(0, 10) === today);
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
            onPress={() => onNavigate(2)}
          />
          <Button
            label="Fitness & Rings"
            secondary
            icon="heart-pulse"
            onPress={() => onNavigate(1)}
          />
          <Button
            label="Medical ID"
            secondary
            icon="card-account-details-outline"
            onPress={() => onNavigate(4)}
          />
          <Button
            label="Snap meal photo"
            secondary
            icon="camera"
            onPress={() => {
              promptMealPhoto((uri) => {
                setFoodPhotoUri(uri);
                setFoodModalOpen(true);
              });
            }}
          />
        </View>
      </View>
      <View style={{ flexDirection: width >= 850 ? "row" : "column", gap: 20 }}>
        <View style={{ flex: 1.5, gap: 20 }}>
          <FastingTracker />
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
              {(() => {
                const parts: string[] = [];
                if (lastSync) parts.push(`Last synced ${new Date(lastSync).toLocaleString()}`);
                else parts.push('No health sync yet. Connect when you are ready.');
                // Show watch badge
                const conn = profile.healthConnections;
                const src = profile.lastHealthSource;
                const wearable = src && conn?.[src]?.wearable;
                if (wearable?.detected) parts.push(`⌚ ${wearable.name}`);
                if (isAutoSyncing) parts.push('Syncing…');
                return parts.join(' · ');
              })()}
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
              label="Sync health readings"
              secondary
              icon="sync"
              onPress={() => setConnectionsOpen(true)}
            />
            {connectionsOpen ? <Sheet title="Health connections" onClose={() => setConnectionsOpen(false)}>
              <HealthConnections />
            </Sheet> : null}
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
      <FoodNutritionModal
        visible={foodModalOpen}
        onClose={() => { setFoodModalOpen(false); setFoodPhotoUri(null); }}
        photoUri={foodPhotoUri ?? undefined}
      />
    </Page>
  );
}
