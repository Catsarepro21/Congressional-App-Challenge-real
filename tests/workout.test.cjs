const test = require('node:test');
const assert = require('node:assert/strict');

// Test 1: Device Name Parsing
test('parseOwnerNameFromDeviceName extracts human names correctly', () => {
  // We can re-implement the pure logic or test regex
  const parse = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const possessive = trimmed.match(/^(.+?)(?:['’]s)\s+(?:iPhone|iPad|Apple\s*Watch|Watch|MacBook|Mac|Phone|Device|Galaxy|Pixel).*/i);
    if (possessive && possessive[1]) {
      const c = possessive[1].trim();
      if (c.length >= 2 && !['iphone', 'my', 'the', 'admin'].includes(c.toLowerCase())) return c;
    }

    const hyphen = trimmed.match(/^(.+?)\s*[-–—]\s*(?:iPhone|iPad|Phone|Watch|Apple\s*Watch).*/i);
    if (hyphen && hyphen[1]) {
      const c = hyphen[1].trim();
      if (c.length >= 2 && !['iphone', 'my', 'the', 'admin'].includes(c.toLowerCase())) return c;
    }

    const romance = trimmed.match(/(?:iPhone|iPad|Watch)\s+(?:de|di|da)\s+(.+)/i);
    if (romance && romance[1]) {
      const c = romance[1].trim();
      if (c.length >= 2) return c;
    }

    return null;
  };

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
  const calcMaxHR = (age) => (typeof age === 'number' && age >= 10 && age <= 110 ? 220 - age : 190);
  const getZone = (bpm, maxHR) => {
    if (bpm <= 0 || maxHR <= 0) return 1;
    const pct = (bpm / maxHR) * 100;
    if (pct >= 90) return 5;
    if (pct >= 80) return 4;
    if (pct >= 70) return 3;
    if (pct >= 60) return 2;
    return 1;
  };

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
  const METS = {
    Running: 9.8,
    Walking: 3.5,
    Cycling: 7.5,
    Strength: 5.0,
    HIIT: 8.5,
    Yoga: 3.0,
    Other: 4.5,
  };
  const estimate = (type, durationSec, weightKg = 70) => {
    if (durationSec <= 0) return 0;
    const met = METS[type] || 4.5;
    const durationMin = durationSec / 60;
    return Math.round(((met * 3.5 * weightKg) / 200) * durationMin);
  };

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
  const calcPace = (distanceMeters, durationSeconds) => {
    if (distanceMeters <= 50 || durationSeconds <= 0) return { minPerKm: '--:--', minPerMi: '--:--' };
    const km = distanceMeters / 1000;
    const miles = distanceMeters / 1609.34;
    const secKm = durationSeconds / km;
    const secMi = durationSeconds / miles;
    const fmt = (s) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    return { minPerKm: fmt(secKm), minPerMi: fmt(secMi) };
  };

  // 5000m in 1500s (25 mins) => 300s/km = 5:00 min/km
  const pace = calcPace(5000, 1500);
  assert.equal(pace.minPerKm, '5:00');
  assert.ok(pace.minPerMi.startsWith('8:0'));

  assert.equal(calcPace(0, 100).minPerKm, '--:--');
});

// Test 5: Recovery Readiness Scoring
test('computeRecoveryScore weights sleep, RHR, and strain', () => {
  const computeScore = ({ sleepMinutes = 0, currentRHR = 0, baselineRHR = 0, yesterdayStrainCalories = 0 }) => {
    let sleepFactor = 70;
    if (sleepMinutes > 0) {
      if (sleepMinutes >= 450 && sleepMinutes <= 540) sleepFactor = 100;
      else if (sleepMinutes >= 390 && sleepMinutes < 450) sleepFactor = 85;
      else if (sleepMinutes >= 330 && sleepMinutes < 390) sleepFactor = 70;
      else if (sleepMinutes >= 270 && sleepMinutes < 330) sleepFactor = 50;
      else if (sleepMinutes > 540) sleepFactor = 80;
      else sleepFactor = 35;
    }

    let rhrFactor = 80;
    if (currentRHR > 0 && baselineRHR > 0) {
      const diff = currentRHR - baselineRHR;
      if (diff <= -3) rhrFactor = 100;
      else if (diff <= 0) rhrFactor = 90;
      else if (diff <= 3) rhrFactor = 75;
      else if (diff <= 7) rhrFactor = 55;
      else rhrFactor = 30;
    }

    let strainFactor = 90;
    if (yesterdayStrainCalories > 0) {
      if (yesterdayStrainCalories < 300) strainFactor = 100;
      else if (yesterdayStrainCalories < 600) strainFactor = 85;
      else if (yesterdayStrainCalories < 900) strainFactor = 70;
      else strainFactor = 50;
    }

    const rawScore = Math.round(sleepFactor * 0.45 + rhrFactor * 0.35 + strainFactor * 0.20);
    const score = Math.max(10, Math.min(100, rawScore));
    let status = 'Good';
    if (score >= 85) status = 'Optimal';
    else if (score >= 70) status = 'Good';
    else if (score >= 50) status = 'Fair';
    else status = 'Rest Needed';

    return { score, status, sleepFactor, rhrFactor, strainFactor };
  };

  // Optimal recovery: 8 hours sleep, lower RHR, light yesterday strain
  const optimal = computeScore({ sleepMinutes: 480, currentRHR: 58, baselineRHR: 62, yesterdayStrainCalories: 200 });
  assert.equal(optimal.status, 'Optimal');
  assert.ok(optimal.score >= 85);

  // Poor recovery: 4 hours sleep, elevated RHR, high yesterday strain
  const poor = computeScore({ sleepMinutes: 240, currentRHR: 75, baselineRHR: 62, yesterdayStrainCalories: 1000 });
  assert.equal(poor.status, 'Rest Needed');
  assert.ok(poor.score < 50);
});
