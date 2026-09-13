const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected import in ${file}: ${name}`);
    },
    setTimeout,
    clearTimeout,
    console,
    Date,
    Math,
    Error,
    String,
    Number,
  });
  return exports;
}

const sleepAnalysis = load('src/services/SleepAnalysisService.ts');
const fastingService = load('src/services/FastingService.ts');
const cardioDiagnostics = load('src/services/CardioDiagnosticsService.ts');

// ── 1. Sleep Architecture & Circadian Tests ──────────────────────────────────
test('Sleep Analysis parses raw Apple HealthKit sleep stage categories', () => {
  const now = Date.now();
  const minute = 60 * 1000;

  const samples = [
    // 60 min InBed
    { value: 0, startDate: new Date(now).toISOString(), endDate: new Date(now + 480 * minute).toISOString() },
    // 90 min Deep (category 4)
    { value: 4, startDate: new Date(now + 30 * minute).toISOString(), endDate: new Date(now + 120 * minute).toISOString() },
    // 100 min REM (category 5)
    { value: 5, startDate: new Date(now + 120 * minute).toISOString(), endDate: new Date(now + 220 * minute).toISOString() },
    // 240 min Core/Light (category 3)
    { value: 3, startDate: new Date(now + 220 * minute).toISOString(), endDate: new Date(now + 460 * minute).toISOString() },
    // 20 min Awake (category 2)
    { value: 2, startDate: new Date(now + 460 * minute).toISOString(), endDate: new Date(now + 480 * minute).toISOString() },
  ];

  const parsed = sleepAnalysis.parseSleepStageSamples(samples);

  assert.equal(parsed.deepMinutes, 90);
  assert.equal(parsed.remMinutes, 100);
  assert.equal(parsed.coreMinutes, 240);
  assert.equal(parsed.awakeMinutes, 20);
  assert.equal(parsed.totalSleepMinutes, 430); // 90 + 100 + 240
  assert.ok(parsed.efficiencyPercent >= 85 && parsed.efficiencyPercent <= 100);
});

test('Sleep Debt calculates accurate deficit/surplus against 8h target', () => {
  // 6 days of 7h (420 min) sleep
  const weekly = [420, 420, 420, 420, 420, 420];
  const debtData = sleepAnalysis.calculateSleepDebt(weekly, 480);

  // Expected 480 * 6 = 2880 min, Actual = 2520 min -> Deficit = -360 min (-6 hours)
  assert.equal(debtData.debtMinutes, -360);
  assert.equal(debtData.weeklyAverageMinutes, 420);
  assert.ok(debtData.circadianBedtimeWindow);
  assert.ok(debtData.circadianBedtimeWindow.start.includes('PM'));
});

test('Circadian Bedtime window calculates optimal wind-down slot', () => {
  const window = sleepAnalysis.calculateCircadianBedtime('07:00', 480);
  assert.ok(window.start);
  assert.ok(window.end);
  assert.ok(window.recommendation.includes('wind down'));
});

// ── 2. Intermittent Fasting Tests ─────────────────────────────────────────────
test('Fasting Service maps protocols to accurate hourly durations', () => {
  assert.equal(fastingService.getProtocolTargetHours('14:10'), 14);
  assert.equal(fastingService.getProtocolTargetHours('16:8'), 16);
  assert.equal(fastingService.getProtocolTargetHours('18:6'), 18);
  assert.equal(fastingService.getProtocolTargetHours('20:4'), 20);
  assert.equal(fastingService.getProtocolTargetHours('OMAD'), 24);
});

test('Fasting metabolic stages progress accurately through physiology phases', () => {
  assert.equal(fastingService.getFastingStage(1.5), 'Digestion');
  assert.equal(fastingService.getFastingStage(3.9), 'Digestion');
  assert.equal(fastingService.getFastingStage(4.0), 'Glycogen Depletion');
  assert.equal(fastingService.getFastingStage(11.9), 'Glycogen Depletion');
  assert.equal(fastingService.getFastingStage(12.0), 'Ketosis');
  assert.equal(fastingService.getFastingStage(17.9), 'Ketosis');
  assert.equal(fastingService.getFastingStage(18.0), 'Autophagy');
  assert.equal(fastingService.getFastingStage(24.0), 'Autophagy');
});

test('Fasting duration formatter prints human-readable strings', () => {
  assert.equal(fastingService.formatFastingDuration(3665), '1h 01m 05s');
  assert.equal(fastingService.formatFastingDuration(57600), '16h 00m 00s');
});

// ── 3. Cardio & Autonomic Diagnostics Tests ──────────────────────────────────
test('Blood Pressure adheres strictly to AHA/ACC 2017 staging criteria', () => {
  // Normal: < 120 and < 80
  const normal = cardioDiagnostics.classifyBloodPressure(118, 76);
  assert.equal(normal.category, 'Normal');

  // Elevated: 120-129 and < 80
  const elevated = cardioDiagnostics.classifyBloodPressure(124, 78);
  assert.equal(elevated.category, 'Elevated');

  // Stage 1: 130-139 or 80-89
  const stage1Sys = cardioDiagnostics.classifyBloodPressure(134, 76);
  assert.equal(stage1Sys.category, 'Stage 1');
  const stage1Dia = cardioDiagnostics.classifyBloodPressure(118, 84);
  assert.equal(stage1Dia.category, 'Stage 1');

  // Stage 2: >= 140 or >= 90
  const stage2Sys = cardioDiagnostics.classifyBloodPressure(142, 78);
  assert.equal(stage2Sys.category, 'Stage 2');
  const stage2Dia = cardioDiagnostics.classifyBloodPressure(118, 92);
  assert.equal(stage2Dia.category, 'Stage 2');

  // Hypertensive Crisis: > 180 and/or > 120
  const crisis = cardioDiagnostics.classifyBloodPressure(185, 122);
  assert.equal(crisis.category, 'Crisis');

  // Invalid / Out of bounds
  assert.equal(cardioDiagnostics.classifyBloodPressure(30, 20), null);
  assert.equal(cardioDiagnostics.classifyBloodPressure(undefined, 80), null);
});

test('HRV SDNN ms autonomic tone classification reflects sympathetic/parasympathetic equilibrium', () => {
  const lowHRV = cardioDiagnostics.classifyHRV(25);
  assert.ok(lowHRV.autonomicTone.includes('Sympathetic'));
  assert.equal(lowHRV.recoveryStatus, 'Fatigued / Low Reserve');

  const normalHRV = cardioDiagnostics.classifyHRV(55);
  assert.ok(normalHRV.autonomicTone.includes('Balanced'));
  assert.equal(normalHRV.recoveryStatus, 'Optimal Recovery');

  const highHRV = cardioDiagnostics.classifyHRV(92);
  assert.ok(highHRV.autonomicTone.includes('Parasympathetic'));
  assert.equal(highHRV.recoveryStatus, 'Well Rested / High Parasympathetic');
});
