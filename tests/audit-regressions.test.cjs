const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports, Date, console, setTimeout, clearTimeout, AbortController, ...globals,
      require: name => {if (name in mocks) return mocks[name]; throw Error(name);}});
  return exports;
}
test('allergen aliases match without invented nutrition tags or substring matches', () => {
  const {AllergenEngine:a}=load('src/services/AllergenEngine.ts');
  for (const [ingredient,allergy] of [['Milk','Dairy'],['Whey protein','Milk'],['Tahini','Sesame'],['Peanuts','Peanut'],['Shrimp','Shellfish']]) {
    assert.equal(a.analyzeIngredients([ingredient],[allergy]).matchFound,true,ingredient);
  }
  assert.equal(a.analyzeIngredients(['Eggplant'],['Egg']).matchFound,false);
  assert.equal(a.analyzeIngredients([],['Milk']).alternativeSafeMacros.length,0);
  assert.equal(a.analyzeIngredients(['Wheat'],['Milk']).alternativeSafeMacros.length,0);
});
test('consent rejects concurrent requests and stale approval IDs', async () => {
  const {CloudPermissionGuard:g,useCloudPermissionStore:s}=load('src/services/CloudPermissionGuard.ts',{zustand:require('zustand')});
  const details={purpose:'A',endpoint:'test',dataPayloadSummary:'synthetic'};
  const first=g.requestPermission(details); const id=s.getState().currentRequest.id;
  assert.equal(await g.requestPermission({...details,purpose:'B'}),false);
  g.approveCurrentRequest('stale'); assert.equal(s.getState().currentRequest.id,id);
  g.denyCurrentRequest(id); assert.equal(await first,false);
  const second=g.requestPermission(details); g.approveCurrentRequest(id);
  assert.ok(s.getState().currentRequest);
  g.approveCurrentRequest(s.getState().currentRequest.id); assert.equal(await second,true);
});
test('missing consent guard never reads or uploads a photo', async () => {
  let calls=0;
  const files={'expo-file-system/legacy':{readAsStringAsync:async()=>{calls++;return 'synthetic';},EncodingType:{Base64:'base64'}}};
  const cloud=load('src/services/CloudAIService.ts',files,{fetch:async()=>{calls++;}}).CloudAIService;
  await assert.rejects(cloud.analyzeDocumentOCR('file:///test.jpg','test'),/consent is unavailable/);
  await assert.rejects(cloud.analyzeIngredientsOCR('file:///test.jpg','test'),/consent is unavailable/);
  const photo=load('src/services/FoodVisionService.ts',files,{fetch:async()=>{calls++;}}).FoodVisionService;
  await assert.rejects(photo.analyzeImage('file:///test.jpg','cloud','test'),/consent is unavailable/);
  assert.equal(calls,0);
});
function barcode(product, allowed=true) {
  let calls=0;
  const service=load('src/services/BarcodeLookupService.ts',{
    './USDALookupService':{USDALookupService:{getFoodByBarcode:()=>null}},
    './CloudPermissionGuard':{CloudPermissionGuard:{requestPermission:async()=>allowed}},
  },{fetch:async()=>{calls++;return {ok:true,json:async()=>({status:1,product})};}}).BarcodeLookupService;
  return {run:()=>service.lookupBarcode('1234567890123'),calls:()=>calls};
}
test('barcode scales per-100g values to grams and preserves unknowns', async () => {
  const b=barcode({product_name:'Synthetic',serving_size:'30 g',nutriments:{'energy-kcal_100g':400,proteins_100g:10,salt_100g:1}});
  const r=await b.run(); assert.equal(r.calories,120); assert.equal(r.protein,3); assert.equal(r.sodium,120);
  assert.equal(r.carbs,undefined); assert.equal(r.fiber,undefined); assert.equal(r.confidence,'low');
});
test('barcode never mixes volume servings with per-100g nutrients or invents units',async()=>{
  let r=await barcode({serving_size:'200 ml',nutriments:{'energy-kcal_serving':90,proteins_100g:5}}).run();
  assert.equal(r.calories,90); assert.equal(r.protein,undefined);
  r=await barcode({serving_size:'one bowl',nutriments:{'energy-kcal_100g':100}}).run();
  assert.match(r.portionEstimate,/100 g/); assert.equal(r.calories,100);
  const denied=barcode({},false);await assert.rejects(denied.run(),/canceled/);assert.equal(denied.calls(),0);
});
test('vitals require actual finite measurements and paired BP',()=>{
  const {validateVitalReadings:v}=load('src/utils/daily.ts');
  for(const input of [{},{spo2:101},{bloodGlucose:NaN},{spo2:Infinity},{systolicBP:120},{systolicBP:80,diastolicBP:90}]) assert.ok(v(input));
  assert.equal(v({spo2:98}),null); assert.equal(v({systolicBP:139.5,diastolicBP:79}),null);
  const {classifyBloodPressure:bp}=load('src/services/CardioDiagnosticsService.ts');
  assert.equal(bp(139.5,79).category,'Stage 1'); assert.equal(bp(129.5,79).category,'Elevated');
});
test('vaccine reminder retains local calendar day and rejects impossible dates',async()=>{
  const triggers=[];
  const notifications={setNotificationHandler:()=>{},getPermissionsAsync:async()=>({status:'granted'}),getAllScheduledNotificationsAsync:async()=>[],
    AndroidNotificationPriority:{DEFAULT:1},scheduleNotificationAsync:async o=>{triggers.push(o.trigger);return 'test';}};
  const {NotificationService:n}=load('src/services/NotificationService.ts',{'expo-notifications':notifications,'react-native':{Platform:{OS:'ios'}}});
  await n.scheduleVaccineReminder('x','Synthetic','2099-01-02');
  assert.equal(triggers[0].getFullYear(),2099); assert.equal(triggers[0].getMonth(),0);assert.equal(triggers[0].getDate(),2);assert.equal(triggers[0].getHours(),9);
  assert.equal(await n.scheduleVaccineReminder('x','Synthetic','2099-02-30'),null);
});
test('workout duration follows wall-clock time after missing timer ticks',()=>{
  const {workoutElapsedSeconds:e}=load('src/services/WorkoutService.ts');
  const start='2026-09-14T10:00:00Z'; assert.equal(e(start,Date.parse('2026-09-14T10:15:00Z')),900);
  assert.equal(e('invalid'),0); assert.equal(e(start,Date.parse(start)-1000),0);
});
test('active workout persists, restores and finishes using timestamps rather than stale counters',async()=>{
  let saved=null;
  const storage={getItem:async()=>saved,setItem:async(_key,value)=>{saved=value;},removeItem:async()=>{saved=null;}};
  const make=()=>load('src/store/useSafeScaleStore.ts',{
    '../utils/daily':load('src/utils/daily.ts'), '../utils/deviceName':{getSuggestedOwnerName:()=>null},
    '../services/WorkoutService':load('src/services/WorkoutService.ts'),
    '../services/SleepAnalysisService':load('src/services/SleepAnalysisService.ts'),
    '../services/FastingService':load('src/services/FastingService.ts'),
    '../services/CardioDiagnosticsService':load('src/services/CardioDiagnosticsService.ts'),
    zustand:require('zustand'),'zustand/middleware':require('zustand/middleware'),
    '@react-native-async-storage/async-storage':storage,
    '../services/HealthDataService':{HealthDataService:{saveWorkoutToHealthKit:async()=>false}},
    '../services/HealthSyncService':{syncHealthSource:async()=>null,readableData:d=>d},
    '../services/NotificationService':{NotificationService:{}},
  }).useSafeScaleStore;
  const first=make();await first.persist.rehydrate();first.getState().startLiveWorkout('Running');
  first.getState().updateLiveWorkout({startedAt:new Date(Date.now()-900000).toISOString(),durationSeconds:8,caloriesBurned:2});
  const id=first.getState().activeWorkout.id;
  first.getState().startLiveWorkout('Walking');assert.equal(first.getState().activeWorkout.id,id);
  const restored=make();await restored.persist.rehydrate();assert.equal(restored.getState().activeWorkout.id,id);
  const result=restored.getState().finishLiveWorkout();
  assert.ok(result.durationSeconds>=900 && result.durationSeconds<905);assert.ok(result.caloriesBurned>2);
  assert.equal(restored.getState().activeWorkout,null);
  assert.equal(JSON.parse(saved).state.activeWorkout,null);
  assert.throws(()=>restored.getState().addVitalLog({spo2:Infinity}),/valid/);
});
