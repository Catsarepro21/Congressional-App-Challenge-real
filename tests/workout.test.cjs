const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports,Date,console,require:name=>{if(name in mocks)return mocks[name];throw Error(name);}});
  return exports;
}
const workout = load('src/services/WorkoutService.ts');
const {parseOwnerNameFromDeviceName:parse} = load('src/utils/deviceName.ts', {'react-native':{Platform:{OS:'web'}}});
const {calculateMaxHeartRate:calcMaxHR,getHeartRateZone:getZone,estimateCaloriesBurned:estimate,calculatePace:calcPace,computeRecoveryScore:computeScore} = workout;


// Test 1: Device Name Parsing
test('parseOwnerNameFromDeviceName extracts human names correctly', () => {
  assert.equal(parse("Rehan's iPhone"), "Rehan");
  assert.equal(parse("Rehan’s iPad Pro"), "Rehan");
  assert.equal(parse("Alex - iPhone"), "Alex");
  assert.equal(parse("iPhone de Mateo"), "Mateo");
  assert.equal(parse("iPhone"), null);
  assert.equal(parse("My iPhone"), null);
  assert.equal(parse(""), null);
  assert.equal(parse(undefined), null);
});

// Test 2: Heart Rate & Zones
test('HR calculations and zone boundaries', () => {
  const maxHR30 = calcMaxHR(30); // 190
  assert.equal(maxHR30, 190);
  assert.equal(calcMaxHR(20), 200);

  // 190 max:
  // Zone 1: <114 (<60%)
  // Zone 2: 114-132 (60-70%)
  // Zone 3: 133-151 (70-80%)
  // Zone 4: 152-170 (80-90%)
  // Zone 5: >=171 (>=90%)
  assert.equal(getZone(100, 190), 1);
  assert.equal(getZone(120, 190), 2);
  assert.equal(getZone(140, 190), 3);
  assert.equal(getZone(160, 190), 4);
  assert.equal(getZone(175, 190), 5);
});

// Test 3: MET Calorie Estimation
test('estimateCaloriesBurned matches standard MET formula', () => {
  // 30 min (1800 sec) run at 70kg: (9.8 * 3.5 * 70 / 200) * 30 = 12.005 * 30 = 360.15 => 360 kcal
  const runCals = estimate('Running', 1800, 70);
  assert.ok(runCals >= 350 && runCals <= 370, `Expected ~360, got ${runCals}`);

  // 60 min walk at 70kg: (3.5 * 3.5 * 70 / 200) * 60 = 4.2875 * 60 = 257.25 => 257 kcal
  const walkCals = estimate('Walking', 3600, 70);
  assert.ok(walkCals >= 250 && walkCals <= 265, `Expected ~257, got ${walkCals}`);

  // 0 duration returns 0
  assert.equal(estimate('Running', 0, 70), 0);
});

// Test 4: Pace Formatting
test('calculatePace returns formatted MM:SS', () => {
  // 5000m in 1500s (25 mins) => 300s/km = 5:00 min/km
  const pace = calcPace(5000, 1500);
  assert.equal(pace.minPerKm, '5:00');
  assert.ok(pace.minPerMi.startsWith('8:0'));

  assert.equal(calcPace(0, 100).minPerKm, '--:--');
});

// Test 5: Recovery Readiness Scoring
test('computeRecoveryScore weights sleep, RHR, and strain', () => {
  // Optimal recovery: 8 hours sleep, lower RHR, light yesterday strain
  const optimal = computeScore({ sleepMinutes: 480, currentRHR: 58, baselineRHR: 62, yesterdayStrainCalories: 200 });
  assert.equal(optimal.status, 'Optimal');
  assert.ok(optimal.score >= 85);

  // Poor recovery: 4 hours sleep, elevated RHR, high yesterday strain
  const poor = computeScore({ sleepMinutes: 240, currentRHR: 75, baselineRHR: 62, yesterdayStrainCalories: 1000 });
  assert.equal(poor.status, 'Rest Needed');
  assert.ok(poor.score < 50);
});
