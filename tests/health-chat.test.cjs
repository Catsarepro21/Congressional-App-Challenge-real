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
      Set,
      Map,
      Array,
      Math,
      Number,
      String,
      Boolean,
      JSON,
      Error,
      setTimeout,
      clearTimeout,
      AbortController,
      fetch: mocks.fetch || globalThis.fetch,
      require: (name) => {
        if (name in mocks) return mocks[name];
        if (name === './RequestControl') return load('src/services/RequestControl.ts'); throw Error(name);
      },
    },
  );
  return exports;
}

// 1. Load CloudPermissionGuard
const guardModule = load("src/services/CloudPermissionGuard.ts", {
  "../store/useSafeScaleStore": {useSafeScaleStore:{getState:()=>({isTestMode:false})}},
  zustand: require("zustand"),
});

// 2. Load mock store with rich health data
const mockStoreState = {
  profile: {
    name: "Rehan",
    age: 28,
    bloodType: "O+",
    chronicConditions: ["Mild Asthma"],
    geminiApiKey: "test-key-123",
  },
  userAllergies: ["Peanuts", "Shellfish"],
  biometricCore: {
    heartRate: 72,
    restingHeartRate: 58,
    sleepMinutes: 465, // 7h 45m
    steps: 8420,
    activeCalories: 450,
    bloodPressureSystolic: 118,
    bloodPressureDiastolic: 76,
    hrvSdnn: 68,
    recoveryScore: 88,
  },
  loggedItems: [
    {
      id: "meal_1",
      type: "Meal",
      date: new Date().toISOString().slice(0, 10),
      name: "Grilled Salmon Bowl",
      value: "550 kcal",
      calories: 550,
      macros: { protein: 42, carbs: 45, fat: 18, fiber: 6, sodium: 480 },
    },
    {
      id: "water_1",
      type: "Water",
      date: new Date().toISOString().slice(0, 10),
      name: "Water",
      value: "500 ml",
    },
  ],
  medicationSchedule: [
    {
      id: "med_1",
      name: "Albuterol Inhaler",
      dosage: "2 puffs",
      time: "08:00",
      status: "Completed",
      stock: 12,
      refillThreshold: 5,
    },
    {
      id: "med_2",
      name: "Vitamin D3",
      dosage: "2000 IU",
      time: "20:00",
      status: "Pending",
      stock: 3,
      refillThreshold: 5, // Low stock!
    },
  ],
  fastingSession: {
    isFasting: true,
    protocol: "16:8",
    startTime: new Date(Date.now() - 14.5 * 3600 * 1000).toISOString(), // 14.5 hours ago -> Ketosis!
  },
  medicalRecords: [
    {
      id: "lab_1",
      type: "LabResult",
      title: "Fasting Blood Glucose",
      value: "88 mg/dL",
    },
  ],
};

const mockStore = {
  getState: () => mockStoreState,
};

// 3. Load HealthContextAggregator
const contextAggregator = load("src/services/HealthContextAggregator.ts", {
  "../store/useSafeScaleStore": { useSafeScaleStore: mockStore },
  "../utils/daily": { localDate: () => new Date().toISOString().slice(0, 10) },
  "./FastingService": load("src/services/FastingService.ts"),
  "./CardioDiagnosticsService": {
    CardioDiagnosticsService: {
      classifyBloodPressure: (sys, dia) => ({ label: "Normal Blood Pressure", category: "Normal" }),
      classifyHRV: (sdnn) => ({ tone: "Parasympathetic Dominance", autonomicTone: "Optimal" }),
    },
  },
});

// 4. Load LocalHealthChatEngine
const chatEngine = load("src/services/LocalHealthChatEngine.ts", {
  "./HealthContextAggregator": contextAggregator,
  "./CloudPermissionGuard": guardModule,
  "../../modules/safescale-vision": {
    isFoundationModelSupportedAsync: async () => false, // fallback to local clinical reasoning
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("HealthContextAggregator: gathers complete real-time health snapshot", () => {
  const snapshot = contextAggregator.HealthContextAggregator.getSnapshot();

  assert.equal(snapshot.user.name, "Rehan");
  assert.equal(snapshot.user.age, 28);
  assert.deepEqual(snapshot.user.allergies, ["Peanuts", "Shellfish"]);

  // Vitals
  assert.equal(snapshot.vitals.restingHeartRate, 58);
  assert.equal(snapshot.vitals.steps, 8420);
  assert.equal(snapshot.vitals.recoveryScore, 88);

  // Nutrition
  assert.equal(snapshot.nutrition.todayCalories, 550);
  assert.equal(snapshot.nutrition.proteinGrams, 42);
  assert.equal(snapshot.nutrition.todayWaterMl, 500);

  // Medications
  assert.equal(snapshot.medications.total, 2);
  assert.equal(snapshot.medications.taken, 1);
  assert.equal(snapshot.medications.pending.length, 1);
  assert.equal(snapshot.medications.pending[0].name, "Vitamin D3");
  assert.deepEqual(snapshot.medications.lowStockAlerts, ["Vitamin D3"]);

  // Fasting
  assert.equal(snapshot.fasting.isFasting, true);
  assert.equal(snapshot.fasting.metabolicStage, "12–18 hours");

  // Quick pills
  const pills = contextAggregator.HealthContextAggregator.getQuickPillSummary();
  assert.ok(pills.some(p => p.includes("550 kcal")));
  assert.ok(pills.some(p => p.includes("12–18 hours")));
  assert.ok(pills.some(p => p.includes("88% Recovery")));
});

test("LocalHealthChatEngine: nutrition query returns grounded macro breakdown on-device", async () => {
  const engine = chatEngine.LocalHealthChatEngine;
  const reply = await engine.sendMessage("How are my macros and calories looking today?");

  assert.ok(reply);
  assert.equal(reply.source, "local-engine");
  assert.match(reply.text, /550 kcal/);
  assert.match(reply.text, /42g/); // protein
  assert.match(reply.text, /45g/); // carbs
  assert.match(reply.text, /Grilled Salmon Bowl/);
  assert.ok(reply.dataPointsReferenced.includes("Nutrition & Macros"));
});

test("LocalHealthChatEngine: sleep & recovery query answers using user sleep and HRV data", async () => {
  const engine = chatEngine.LocalHealthChatEngine;
  const reply = await engine.sendMessage("How is my recovery score and sleep today?");

  assert.ok(reply);
  assert.match(reply.text, /88%/); // recovery score
  assert.match(reply.text, /58 bpm/); // resting HR
  assert.match(reply.text, /68 ms/); // HRV
  assert.ok(reply.dataPointsReferenced.includes("Sleep & Recovery"));
});

test("LocalHealthChatEngine: fasting query explains elapsed time without claiming a metabolic state", async () => {
  const engine = chatEngine.LocalHealthChatEngine;
  const reply = await engine.sendMessage("Am I in ketosis right now?");

  assert.ok(reply);
  assert.match(reply.text, /cannot determine ketosis/);
  assert.match(reply.text, /16:8/);
  assert.ok(reply.dataPointsReferenced.includes("Intermittent Fasting"));
});

test("LocalHealthChatEngine: medication query identifies pending dose and low stock alert", async () => {
  const engine = chatEngine.LocalHealthChatEngine;
  const reply = await engine.sendMessage("What medications do I have left?");

  assert.ok(reply);
  assert.match(reply.text, /Vitamin D3/);
  assert.match(reply.text, /20:00/);
  assert.match(reply.text, /Low stock/i);
  assert.ok(reply.dataPointsReferenced.includes("Medication Schedule"));
});

test("CloudPermissionGuard: interactive permission flow enforces user choice every time", async () => {
  const guard = guardModule.CloudPermissionGuard;

  // 1. User approves request
  const requestPromise = guard.requestPermission({
    purpose: "Analyze food photo",
    endpoint: "https://generativelanguage.googleapis.com",
    dataPayloadSummary: "Photo bytes",
  });

  // Verify modal state is populated
  const storeState = guardModule.useCloudPermissionStore.getState();
  assert.ok(storeState.currentRequest);
  assert.equal(storeState.currentRequest.purpose, "Analyze food photo");

  // User taps "Allow"
  guard.approveCurrentRequest(guardModule.useCloudPermissionStore.getState().currentRequest.id);
  const granted = await requestPromise;
  assert.equal(granted, true);
  assert.equal(guardModule.useCloudPermissionStore.getState().currentRequest, null);

  // 2. Next request: user denies request (proves it is NOT remembered)
  const secondPromise = guard.requestPermission({
    purpose: "Cloud deep reasoning",
    endpoint: "https://generativelanguage.googleapis.com",
    dataPayloadSummary: "Medical text",
  });

  assert.ok(guardModule.useCloudPermissionStore.getState().currentRequest);

  // User taps "Deny"
  guard.denyCurrentRequest(guardModule.useCloudPermissionStore.getState().currentRequest.id);
  const secondResult = await secondPromise;
  assert.equal(secondResult, false);
  assert.equal(guardModule.useCloudPermissionStore.getState().currentRequest, null);
});

test("CloudPermissionGuard: executeWithPermission executes local fallback when user denies", async () => {
  const guard = guardModule.CloudPermissionGuard;

  let cloudCalled = false;
  let localCalled = false;

  const actionPromise = guard.executeWithPermission(
    {
      purpose: "Test cloud escalation",
      endpoint: "https://api.cloud.com",
      dataPayloadSummary: "test data",
    },
    async () => {
      cloudCalled = true;
      return "cloud-result";
    },
    async () => {
      localCalled = true;
      return "local-result";
    },
  );

  // Simulate user denying interactive prompt
  guard.denyCurrentRequest(guardModule.useCloudPermissionStore.getState().currentRequest.id);

  const result = await actionPromise;
  assert.equal(result, "local-result");
  assert.equal(cloudCalled, false);
  assert.equal(localCalled, true);
});

test('nutrition context and chat distinguish missing, zero, partial and legacy values', async () => {
  const original = mockStoreState.loggedItems;
  try {
    const date = new Date().toISOString().slice(0,10);
    mockStoreState.loggedItems = [{id:'a',type:'Meal',name:'Calories only',date,calories:420}];
    let n = contextAggregator.HealthContextAggregator.getSnapshot().nutrition;
    assert.equal(n.proteinGrams,null);
    assert.equal(n.todayCalories,420);
    let reply = await chatEngine.LocalHealthChatEngine.sendMessage('What are my macros?');
    assert.match(reply.text,/Protein: Not recorded/);
    assert.doesNotMatch(reply.text,/Protein: 0g/);
    mockStoreState.loggedItems.push({id:'b',type:'Meal',name:'Recorded zero',date,macros:{protein:0,carbs:2,fat:0}});
    mockStoreState.loggedItems.push({id:'old',type:'Meal',name:'Undated',calories:999});
    n = contextAggregator.HealthContextAggregator.getSnapshot().nutrition;
    assert.equal(n.proteinGrams,0); assert.equal(n.mealCount,2);
    assert.equal(n.recordedCounts.proteinGrams,1); assert.equal(n.fiberGrams,null);
    assert.match(contextAggregator.HealthContextAggregator.getAsPromptContext(),/Not recorded/);
  } finally { mockStoreState.loggedItems = original; }
});

test('native chat returns actual model output and falls back locally on model errors', async () => {
  const engine = (native) => load('src/services/LocalHealthChatEngine.ts', {
    './HealthContextAggregator':contextAggregator,'./CloudPermissionGuard':guardModule,
    '../../modules/safescale-vision':native,
  }).LocalHealthChatEngine;
  let actualPrompt;
  const response = await engine({isFoundationModelSupportedAsync:async()=>true,generateTextAsync:async(p,c)=>{actualPrompt=p;assert.match(c,/NUTRITION/);return {text:'Model answer for this question',isLocal:true,provider:'apple-foundation'};}}).sendMessage('Summarize my records');
  assert.equal(actualPrompt,'Summarize my records'); assert.equal(response.source,'apple-foundation');
  assert.equal(response.text,'Model answer for this question');
  const fallback = await engine({isFoundationModelSupportedAsync:async()=>true,generateTextAsync:async()=>{throw Error('Model not ready');}}).sendMessage('What are my macros?');
  assert.equal(fallback.source,'local-engine'); assert.match(fallback.text,/Protein/);
});
