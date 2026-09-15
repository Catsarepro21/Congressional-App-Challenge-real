const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected import: ${name}`);
  }, setTimeout, clearTimeout, console, Error });
  return exports;
}
const sleepAnalysis = load('src/services/SleepAnalysisService.ts');
const fastingService = load('src/services/FastingService.ts');
const cardioDiagnostics = load('src/services/CardioDiagnosticsService.ts');
const reader = load('src/services/NativeHealthReader.ts', {
  './SleepAnalysisService': sleepAnalysis,
});
function coordinator(os, native = {}, google = {}) {
  return load('src/services/HealthSyncService.ts', {
    'react-native': { Platform: { OS: os }, NativeModules: {} },
    './HealthDataService': { HealthDataService: native },
    './GoogleFitService': { GoogleFitService: google },
    './GoogleHealthService': { GoogleHealthService: google },
    './NativeHealthReader': reader,
  });
}
test('sync preserves saved readings on an empty response and rejects unsupported platforms', async () => {
  const sync = coordinator('ios', { requestHealthPermissions: async () => true, fetchHealthData: async () => ({steps:0}) });
  const result = await sync.syncHealthSource('apple');
  assert.equal(result.readings, null);
  assert.equal(result.connection.lastSyncedAt, undefined);
  await assert.rejects(coordinator('web').syncHealthSource('apple'), /native/);
  await assert.rejects(sync.bounded(new Promise(() => {}), 5), /too long/);
});
test('Google cancellation is harmless and expired credentials refresh once', async () => {
  assert.equal(await coordinator('ios', {}, {authorize: async () => null}).syncHealthSource('google-health'), null);
  const calls = [];
  const google = {
    fetchFitnessData: async token => { calls.push(token); if (token === 'expired') throw new Error('UNAUTHENTICATED'); return {steps:123}; },
    refreshAccessToken: async token => { assert.equal(token, 'refresh'); return 'fresh'; },
  };
  const result = await coordinator('ios', {}, google).syncHealthSource('google-fit', {accessToken:'expired',refreshToken:'refresh',connectedAt:'original'});
  assert.deepEqual(calls, ['expired','fresh']);
  assert.equal(result.connection.accessToken,'fresh');
  assert.equal(result.connection.connectedAt,'original');
  assert.equal(result.readings.steps,123);
  assert.equal(result.readings.heartRate,0);
});
test('missing native method and thrown native error resolve safely', async () => {
  assert.equal(await reader.queryHealth({}, 'read', {}), null);
  assert.equal(await reader.queryHealth({ read() { throw Error('missing entitlement'); } }, 'read', {}), null);
});
test('a native callback that never returns times out', async () => {
  assert.equal(await reader.queryHealth({ read() {} }, 'read', {}, 5), null);
});
test('denied/empty HealthKit never fabricates default vitals', async () => {
  const bridge = { initHealthKit() {}, getStepCount(_o, cb) { cb(null, {value: 0}); } };
  assert.equal(await reader.readAppleHealth(bridge), null);
});
test('sleep stages overlap, awake periods and invalid dates are handled', () => {
  const date = n => new Date(n * 60000).toISOString();
  const sample = (value,a,b) => ({value, startDate:date(a), endDate:date(b)});
  const samples = [sample('ASLEEP',0,60),sample('CORE',30,90),sample('DEEP',90,100),sample('AWAKE',100,110),sample('REM',110,120),sample('INBED',0,200),{value:'ASLEEP',startDate:'bad',endDate:'bad'}];
  assert.equal(reader.sleepMinutesFromSamples(samples, 0, 120*60000),110);
});
test('partial readings preserve measured values without guessed RHR or sleep', async () => {
  const bridge = { initHealthKit() {}, getStepCount(_o, cb) { cb(null, {value: 123}); }, getHeartRateSamples(_o, cb) { cb(null, [{value:80},{value:100}]); } };
  const data = await reader.readAppleHealth(bridge);
  assert.equal(data.steps, 123); assert.equal(data.heartRate,90);
  assert.equal(data.restingHeartRate,0); assert.equal(data.sleepMinutes,0);
});
test('CommonJS HealthKit export initializes permissions', async () => {
  const health = load('src/services/HealthDataService.ts', {
    'react-native': {Platform:{OS:'ios'}}, './NativeHealthReader':reader,
    'react-native-health': { Constants:{Permissions:{Steps:'Steps'}}, initHealthKit(_p,cb) { cb(null); } },
  }).HealthDataService;
  assert.equal(await health.requestHealthPermissions(),true);
  assert.equal(health.calculateHealthStabilityScore(0,0,[]),0);
  assert.equal(health.calculateHealthStabilityScore(65,80,[65]),0);
});
test('unimplemented wearable adapters cannot claim success or return patient data', async () => {
  const service = load('src/services/DeviceAPIService.ts').DeviceAPIService;
  await assert.rejects(service.authorizeDevice('fitbit', () => {}), /not implemented/);
  await assert.rejects(service.fetchDeviceData('withings'), /not implemented/);
});
test('daily reminders reject invalid times and use cross-platform daily trigger', async () => {
  const scheduled = [];
  const service = load('src/services/NotificationService.ts', {
    'react-native':{Platform:{OS:'ios'}}, 'expo-notifications': {
      setNotificationHandler() {}, getPermissionsAsync:async () => ({status:'granted'}),
      getAllScheduledNotificationsAsync:async () => [],
      SchedulableTriggerInputTypes:{DAILY:'daily'}, AndroidNotificationPriority:{HIGH:'high'},
      scheduleNotificationAsync:async n => { scheduled.push(n); return 'reminder'; },
    },
  }).NotificationService;
  assert.equal(await service.scheduleMedicationReminder('1','Test','1','25:80'),null);
  assert.equal(scheduled.length,0);
  assert.equal(await service.scheduleMedicationReminder('1','Test','1','08:30'),'reminder');
  assert.equal(scheduled[0].trigger.type,'daily');
});
test('demo mode preserves real records in memory and storage', async () => {
  let saved;
  const storage = { getItem: async () => null, setItem: async (_k,v) => { saved = JSON.parse(v); }, removeItem: async () => {} };
  const store = load('src/store/useSafeScaleStore.ts', {
    '../utils/daily':load('src/utils/daily.ts'),
    '../utils/deviceName': { getSuggestedOwnerName: () => 'Rehan', parseOwnerNameFromDeviceName: () => 'Rehan' },
    '../services/WorkoutService': {
      estimateCaloriesBurned: () => 300,
      computeRecoveryScore: () => ({ score: 85, status: 'Optimal', sleepFactor: 100, rhrFactor: 90, strainFactor: 100, recommendation: 'Optimal' }),
    },
    zustand: require('zustand'), 'zustand/middleware':require('zustand/middleware'),
    '../services/SecureHealthStorage':{SecureHealthStorage:storage},
    '../services/HealthDataService':{HealthDataService:{}},
    '../services/HealthSyncService':{syncHealthSource: async () => null, readableData: d => d},
    '../services/NotificationService':{NotificationService:{}},
    '../services/SleepAnalysisService': sleepAnalysis,
    '../services/FastingService': fastingService,
    '../services/CardioDiagnosticsService': cardioDiagnostics,
  }).useSafeScaleStore;
  await store.persist.rehydrate();
  store.setState({ userAllergies:['Sesame'], emergencyContacts:[{id:'real',name:'Saved contact',phone:'test'}] });
  store.getState().toggleTestMode();
  assert.equal(store.getState().isTestMode,true);
  assert.deepEqual(saved.state.userAllergies,['Sesame']);
  store.getState().toggleTestMode();
  assert.equal(store.getState().isTestMode,false);
  assert.deepEqual(store.getState().userAllergies,['Sesame']);
  assert.equal(store.getState().emergencyContacts[0].id,'real');
});


test('HealthKit uses non-enumerable native methods when package export only has constants', async () => {
  const native = {};
  Object.defineProperty(native, 'initHealthKit', {value(_p, cb) { cb(null); }});
  const health = load('src/services/HealthDataService.ts', {
    'react-native': {Platform: {OS: 'ios'}, NativeModules: {AppleHealthKit: native}},
    './NativeHealthReader': reader,
    'react-native-health': {Constants: {Permissions: {Steps: 'Steps'}}},
  }).HealthDataService;
  assert.equal(await health.requestHealthPermissions(), true);
});

test('Google PKCE uses SHA256 and rejects a mismatched OAuth state', async () => {
  const crypto = require('node:crypto');
  const code = ts.transpileModule(fs.readFileSync('src/services/GoogleOAuth.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, URL, require() { return {
    getRandomBytesAsync: async n => crypto.randomBytes(n),
    randomUUID: () => crypto.randomUUID(),
    CryptoDigestAlgorithm: {SHA256: 'sha256'}, CryptoEncoding: {BASE64: 'base64'},
    digestStringAsync: async (a, v) => crypto.createHash(a).update(v).digest('base64'),
  }; }});
  const pkce = await exports.createGooglePKCE();
  assert.equal(pkce.challenge, crypto.createHash('sha256').update(pkce.verifier).digest('base64url'));
  const redirect = exports.googleRedirectUri(exports.GOOGLE_IOS_CLIENT_ID);
  assert.equal(exports.validateGoogleCallback(redirect + '?code=abc&state=' + pkce.state, redirect, pkce.state), 'abc');
  assert.throws(() => exports.validateGoogleCallback(redirect + '?code=abc&state=wrong', redirect, pkce.state));
  assert.throws(() => exports.validateGoogleCallback('other:/oauthredirect?code=abc&state=' + pkce.state, redirect, pkce.state));
});
