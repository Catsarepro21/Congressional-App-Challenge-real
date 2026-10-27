const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
function load(file,mocks={}) {
  const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports,Date,console,setTimeout,clearTimeout,AbortController,require:name=>{if(name in mocks)return mocks[name];throw Error(name);}});
  return exports;
}
function storeFixture(overrides={}) {
  let saved;let cancelled=0;
  const storage={getItem:async()=>null,setItem:async(_n,v)=>{saved=v;},removeItem:async()=>{saved=null;},clearSavedData:async reset=>{saved=null;reset?.();},retryWrite:async()=>{}};
  const mod=load('src/store/useSafeScaleStore.ts',{
    zustand:require('zustand'),'zustand/middleware':require('zustand/middleware'),
    '../utils/daily':load('src/utils/daily.ts'),'../utils/deviceName':{getSuggestedOwnerName:()=>null},
    '../services/WorkoutService':load('src/services/WorkoutService.ts'),
    '../services/SleepAnalysisService':load('src/services/SleepAnalysisService.ts'),
    '../services/FastingService':load('src/services/FastingService.ts'),
    '../services/CardioDiagnosticsService':load('src/services/CardioDiagnosticsService.ts'),
    '../services/HealthDataService':{HealthDataService:{saveWorkoutToHealthKit:async()=>false}},
    '../services/SecureHealthStorage':{SecureHealthStorage:storage},
    '../services/HealthSyncService':{syncHealthSource:async()=>null,readableData:d=>d},
    '../services/NotificationService':{NotificationService:{cancelAllReminders:async()=>{cancelled++;}}},...overrides,
  });return {...mod,saved:()=>saved,cancelled:()=>cancelled};
}
test('export removes nested credentials without dropping health records',()=>{
  const {privacyExport}=load('src/utils/privacyExport.ts');
  const text=privacyExport({profile:{name:'Synthetic',geminiApiKey:'secret',healthConnections:{apple:{accessToken:'token'}}},medicalRecords:[{title:'Synthetic record'}]});
  assert.ok(!text.includes('secret'));assert.ok(!text.includes('token'));assert.match(text,/Synthetic record/);
});
test('deletion clears state, credentials, reminders and blocks old sync completion',async()=>{
  let complete;
  const fixture=storeFixture({'../services/HealthSyncService':{syncHealthSource:()=>new Promise(r=>{complete=r;}),readableData:d=>d}});
  const store=fixture.useSafeScaleStore;await store.persist.rehydrate();
  store.getState().updateProfile({name:'Synthetic',geminiApiKey:'secret',lastHealthSource:'apple',healthConnections:{apple:{connectedAt:'now'}}});
  store.getState().triggerAutoSync();
  await fixture.deleteLocalHealthData();
  complete({readings:{heartRate:99},connection:{connectedAt:'old'}});await new Promise(r=>setTimeout(r,0));
  assert.equal(store.getState().profile.geminiApiKey,'');assert.equal(store.getState().biometricCore.heartRate,0);
  assert.equal(store.getState().hasCompletedOnboarding,false);assert.equal(fixture.cancelled(),1);
  assert.ok(!fixture.saved().includes('secret'));assert.ok(!fixture.saved().includes('Synthetic'));
});
test('midnight removes yesterday totals while preserving saved vital samples and history',()=>{
  const {useSafeScaleStore:store}=storeFixture();
  store.setState({lastSyncedAt:'2020-01-01T12:00:00Z',biometricCore:{...store.getState().biometricCore,steps:4000,activeCalories:300,heartRate:65},activityRings:{...store.getState().activityRings,moveCalories:300,lastSyncedAt:'2020-01-01T12:00:00Z'}});
  store.getState().ensureCurrentDay();assert.equal(store.getState().biometricCore.steps,0);
  assert.equal(store.getState().biometricCore.heartRate,65);assert.equal(store.getState().activityRings.moveCalories,0);
});
test('live freshness rejects missing, future and expired sample times',()=>{
  const {isFreshReading:f}=load('src/utils/readingFreshness.ts');const now=Date.now();
  assert.equal(f(undefined,300000,now),false);assert.equal(f({sampledAt:new Date(now+1).toISOString()},300000,now),false);
  assert.equal(f({sampledAt:new Date(now-300001).toISOString()},300000,now),false);
  assert.equal(f({sampledAt:new Date(now-1000).toISOString()},300000,now),true);
});
test('GPS rejects bad accuracy, impossible jumps and reversed timestamps; gaps add no invented distance',()=>{
  const {appendWorkoutLocation:add}=load('src/services/WorkoutSensors.ts');
  const origin={latitude:40,longitude:-74,timestamp:100000};const workout={routeCoordinates:[origin],distanceMeters:0};
  assert.equal(add(workout,{...origin,timestamp:105000},100),null);
  assert.equal(add(workout,{...origin,latitude:41,timestamp:105000},5),null);
  assert.equal(add(workout,{...origin,timestamp:99999},5),null);
  const next=add(workout,{...origin,latitude:40.0001,timestamp:105000},5);assert.ok(next.distanceMeters>10 && next.distanceMeters<12);
  assert.equal(add(workout,{...origin,latitude:41,timestamp:200000},5).distanceMeters,0);
});
test('workout retries retain a stable ID and old records without sync metadata are not retried',async()=>{
  const calls=[];const f=storeFixture({'../services/HealthDataService':{HealthDataService:{saveWorkoutToHealthKit:async w=>{calls.push(w);return false;}}}});
  const s=f.useSafeScaleStore;s.getState().addWorkout({id:'stable',type:'Walking',source:'app',startedAt:new Date().toISOString(),durationSeconds:30,caloriesBurned:3});
  await new Promise(r=>setTimeout(r,0));f.retryWorkoutSync('stable');await new Promise(r=>setTimeout(r,0));
  assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);assert.equal(calls[0].healthSyncVersion,1);
  s.setState({workouts:[{...calls[0],id:'legacy',healthSyncVersion:undefined}]});f.retryWorkoutSync('legacy');await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,2);
});

test('sample mode never restores an orphaned sync lock or accepts an old completion',async()=>{
  const completions=[];
  const fixture=storeFixture({'../services/HealthSyncService':{syncHealthSource:()=>new Promise(r=>completions.push(r)),readableData:d=>d}});
  const store=fixture.useSafeScaleStore;await store.persist.rehydrate();
  store.getState().updateProfile({lastHealthSource:'apple',healthConnections:{apple:{connectedAt:'now'}}});
  store.getState().triggerAutoSync();assert.equal(store.getState().isAutoSyncing,true);
  store.getState().toggleTestMode();assert.equal(store.getState().isAutoSyncing,false);
  store.getState().toggleTestMode();assert.equal(store.getState().isAutoSyncing,false);
  store.getState().triggerAutoSync();assert.equal(completions.length,2);
  completions[0]({readings:{heartRate:99},connection:{connectedAt:'old'}});
  await new Promise(r=>setTimeout(r,0));
  assert.equal(store.getState().isAutoSyncing,true);assert.equal(store.getState().biometricCore.heartRate,0);
  store.getState().triggerAutoSync();assert.equal(completions.length,2);
  completions[1](null);await new Promise(r=>setTimeout(r,0));assert.equal(store.getState().isAutoSyncing,false);
});

test('pre-deletion sync completion cannot release a new sync lock',async()=>{
  const completions=[];
  const fixture=storeFixture({'../services/HealthSyncService':{syncHealthSource:()=>new Promise(r=>completions.push(r)),readableData:d=>d}});
  const store=fixture.useSafeScaleStore;await store.persist.rehydrate();
  const connect=()=>store.getState().updateProfile({lastHealthSource:'apple',healthConnections:{apple:{connectedAt:'now'}}});
  connect();store.getState().triggerAutoSync();await fixture.deleteLocalHealthData();
  connect();store.getState().triggerAutoSync();assert.equal(completions.length,2);
  completions[0](null);await new Promise(r=>setTimeout(r,0));assert.equal(store.getState().isAutoSyncing,true);
  store.getState().triggerAutoSync();assert.equal(completions.length,2);
  completions[1](null);await new Promise(r=>setTimeout(r,0));assert.equal(store.getState().isAutoSyncing,false);
});

test('competition demo hides all personal slices and restores real records without persisting demo edits',async()=>{
  const f=storeFixture();const store=f.useSafeScaleStore;await store.persist.rehydrate();
  store.setState({hasCompletedOnboarding:true,loggedItems:[{id:'private-meal',type:'Meal',name:'Private meal',value:'1 bowl'}],medicalRecords:[{id:'private-document',documentImage:'private://photo'}],activeWorkout:{id:'private-workout',recordSensors:true},trackingPath:[{latitude:1,longitude:2}],scanState:{isCameraActive:false,isProcessing:false,currentPayloadMetrics:{private:'scan'},lastMatchResult:null},aiPreference:'cloud'});
  store.getState().updateProfile({geminiApiKey:'private-key'});
  store.getState().toggleTestMode();
  const demo=store.getState();assert.equal(demo.activeWorkout,null);assert.equal(demo.trackingPath.length,0);
  assert.equal(demo.scanState.currentPayloadMetrics,null);assert.equal(demo.profile.geminiApiKey,'');
  assert.equal(demo.aiPreference,'on-device');assert.equal(demo.hasCompletedOnboarding,true);
  assert.ok(demo.loggedItems.length>0);assert.ok(demo.medicalRecords.length>0);
  assert.ok(!JSON.stringify({meals:demo.loggedItems,records:demo.medicalRecords}).includes('private'));
  store.getState().updateProfile({name:'Demo edit'});
  assert.ok(f.saved().includes('private-document'));assert.ok(!f.saved().includes('Demo edit'));
  store.getState().toggleTestMode();assert.equal(store.getState().activeWorkout.id,'private-workout');
  assert.equal(store.getState().medicalRecords[0].id,'private-document');assert.equal(store.getState().aiPreference,'cloud');
});
test('all modes block cloud actions even with a key and stale approval',async()=>{
  const {CloudPermissionGuard:g,useCloudPermissionStore:s}=load('src/services/CloudPermissionGuard.ts',{zustand:require('zustand')});
  const details={purpose:'Synthetic',endpoint:'https://example.invalid',dataPayloadSummary:'fictional'};let calls=0;
  g.approveCurrentRequest('old');assert.equal(await g.executeWithPermission(details,async()=>{calls++;},async()=>'offline'),'offline');
  await assert.rejects(g.executeWithPermission(details,async()=>{calls++;}),/blocked/);
  assert.equal(calls,0);assert.equal(s.getState().currentRequest,null);
});

test('reset after an initial storage failure completes hydration and restores onboarding',async()=>{
  let corrupt=true;
  const f=storeFixture({'../services/SecureHealthStorage':{SecureHealthStorage:{
    getItem:async()=>{if(corrupt)throw Error('Unreadable records');return null;},
    setItem:async()=>{},removeItem:async()=>{},clearSavedData:async reset=>{corrupt=false;reset?.();},
  }}});
  const store=f.useSafeScaleStore;await store.persist.rehydrate();
  assert.equal(store.persist.hasHydrated(),false);
  let finished=0;store.persist.onFinishHydration(()=>finished++);
  await f.deleteLocalHealthData();await new Promise(r=>setTimeout(r,0));
  assert.equal(store.persist.hasHydrated(),true);assert.equal(finished,1);
  assert.equal(store.getState().hasCompletedOnboarding,false);assert.equal(store.getState().isDeletingData,false);
});

