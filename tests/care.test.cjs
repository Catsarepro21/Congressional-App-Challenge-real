const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");
function load(path, mocks = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      Date,
      console,
      require: (name) => {
        if (name in mocks) return mocks[name];
        throw Error(name);
      },
    },
  );
  return exports;
}
const daily = load("src/utils/daily.ts");
function makeStore() {
  let saved;
  const storage = {
    getItem: async () => null,
    setItem: async (_key, value) => {
      saved = JSON.parse(value);
    },
    removeItem: async () => {},
  };
  const store = load("src/store/useSafeScaleStore.ts", {
    "../utils/daily": daily,
    zustand: require("zustand"),
    "zustand/middleware": require("zustand/middleware"),
    "@react-native-async-storage/async-storage": storage,
    "../services/HealthDataService": { HealthDataService: {} },
    "../services/NotificationService": {
      NotificationService: {
        scheduleMedicationReminder: async () => null,
        cancelMedicationReminder: async () => {},
      },
    },
  }).useSafeScaleStore;
  return { store, saved: () => saved };
}
test("local calendar dates and invalid date validation", () => {
  assert.equal(daily.localDate(new Date(2026, 8, 10, 23, 59)), "2026-09-10");
  assert.equal(daily.validDate("2026-02-30"), false);
  assert.equal(daily.validDate("2024-02-29"), true);
  assert.equal(daily.validDate("2026-02-29"), false);
});
test("completion is idempotent, undo restores actual stock, and empty stock is not fabricated", () => {
  const med = {
    id: "1",
    name: "Test",
    dosage: "Existing instructions",
    time: "08:00",
    status: "Pending",
    stock: 3,
  };
  const done = daily.changeDose(med, "Completed");
  assert.equal(done.stock, 2);
  assert.equal(daily.changeDose(done, "Completed").stock, 2);
  assert.equal(daily.changeDose(done, "Pending").stock, 3);
  const empty = daily.changeDose({ ...med, stock: 0 }, "Completed");
  assert.equal(daily.changeDose(empty, "Pending").stock, 0);
  assert.equal(
    daily.changeDose({ ...med, stock: undefined }, "Completed").stock,
    undefined,
  );
});
test("midnight and legacy status reset without restoring stock from a previous day", () => {
  const med = { id: "1", status: "Completed", stock: 4, stockDebited: true };
  const next = daily.currentMedications([med], "2026-09-09", "2026-09-10")[0];
  assert.equal(next.status, "Pending");
  assert.equal(next.stock, 4);
  assert.equal(daily.changeDose(next, "Completed").stock, 3);
  assert.equal(
    daily.currentMedications([med], null, "2026-09-10")[0].status,
    "Pending",
  );
  assert.equal(
    daily.currentMedications([med], "2026-09-10", "2026-09-10")[0].status,
    "Completed",
  );
});
test("store rolls over before a dose and persists date, completion, and stock together", async () => {
  const { store, saved } = makeStore();
  await store.persist.rehydrate();
  store.setState({
    medicationDay: "2000-01-01",
    medicationSchedule: [
      {
        id: "1",
        name: "Test",
        dosage: "Test",
        time: "08:00",
        status: "Completed",
        stock: 5,
        stockDebited: true,
      },
    ],
  });
  store.getState().setMedicationStatus("1", "Completed");
  assert.equal(saved().state.medicationDay, daily.localDate());
  assert.equal(saved().state.medicationSchedule[0].stock, 4);
  store.getState().setMedicationStatus("1", "Pending");
  assert.equal(store.getState().medicationSchedule[0].stock, 5);
});
test("logged entries have dates and cannot alter measured telemetry", async () => {
  const { store } = makeStore();
  await store.persist.rehydrate();
  store
    .getState()
    .addLoggedItem({ type: "Meal", name: "Legacy entry", value: "100" });
  assert.equal(store.getState().biometricCore.activeCalories, 0);
  assert.equal(store.getState().loggedItems[0].date, daily.localDate());
  store.getState().deleteLoggedItem(store.getState().loggedItems[0].id);
  assert.equal(store.getState().biometricCore.activeCalories, 0);
});
test("visit export includes notes but excludes credentials and raw documents", async () => {
  const { store } = makeStore();
  await store.persist.rehydrate();
  store.setState({
    profile: {
      name: "Test",
      geminiApiKey: "SECRET_KEY",
      googleAccessToken: "SECRET_TOKEN",
    },
    moodLogs: [
      {
        timestamp: "2026-09-10",
        feelings: ["Okay"],
        stressLevel: "Low",
        notes: "Question for next visit",
      },
    ],
    medicalRecords: [
      {
        date: "2026-09-10",
        title: "Lab",
        provider: "Clinic",
        value: "Saved detail",
        documentImage: "PRIVATE_IMAGE",
      },
    ],
  });
  const report = load("src/utils/visitSummary.ts", {
    "./daily": daily,
  }).visitSummary(store.getState());
  assert.match(report, /Question for next visit/);
  assert.match(report, /Saved detail/);
  assert.doesNotMatch(report, /SECRET_KEY|SECRET_TOKEN|PRIVATE_IMAGE/);
});
