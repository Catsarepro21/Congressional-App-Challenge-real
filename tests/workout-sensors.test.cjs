const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const vm=require('node:vm');
function load(file,mocks={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports,Date,require:name=>{if(name in mocks)return mocks[name];throw Error(name);}});
  return exports;
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const denied={granted:false,canAskAgain:true};
const granted={granted:true,canAskAgain:true};

test('sensor permissions serialize across restarts and skip cancelled queued work',async()=>{
  const {requestSensorPermission:ask}=load('src/services/SensorPermissions.ts');
  let finish;let cancelled=false;const calls=[];
  const first=ask(async()=>denied,()=>{calls.push('first');return new Promise(r=>{finish=r;});},()=>false);
  const second=ask(async()=>{calls.push('second');return denied;},async()=>granted,()=>cancelled);
  await flush();assert.deepEqual(calls,['first']);cancelled=true;finish(granted);
  assert.equal((await first).granted,true);assert.equal(await second,null);assert.deepEqual(calls,['first']);
});

test('sensor permission queue recovers from failure and respects existing or permanent decisions',async()=>{
  const {requestSensorPermission:ask}=load('src/services/SensorPermissions.ts');
  await assert.rejects(ask(async()=>{throw Error('OS failure');},async()=>granted,()=>false),/OS failure/);
  let prompts=0;const request=async()=>{prompts++;return granted;};
  assert.equal((await ask(async()=>granted,request,()=>false)).granted,true);
  assert.equal((await ask(async()=>({...denied,canAskAgain:false}),request,()=>false)).granted,false);
  assert.equal(prompts,0);
  assert.equal((await ask(async()=>denied,request,()=>false)).granted,true);assert.equal(prompts,1);
});

function hookFixture(locationOverrides={}) {
  const effects=[];let stepCallback;let gpsRemoved=0;let stepRemoved=0;let stepPrompts=0;
  const state={activeWorkout:{id:'synthetic',recordSensors:true,stepCount:10},dataRevision:1,isTestMode:false,isDeletingData:false,
    updateLiveWorkout:change=>Object.assign(state.activeWorkout,change)};
  const store=selector=>selector(state);store.getState=()=>state;
  const hook=load('src/hooks/useWorkoutSensors.ts',{
    react:{useEffect:effect=>effects.push(effect),useState:initial=>[initial,()=>{}]},
    'react-native':{Platform:{OS:'ios'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
    'expo-location':{Accuracy:{High:4},getForegroundPermissionsAsync:async()=>granted,requestForegroundPermissionsAsync:async()=>granted,
      watchPositionAsync:async()=>({remove(){gpsRemoved++;}}),...locationOverrides},
    'expo-sensors':{Pedometer:{getPermissionsAsync:async()=>denied,requestPermissionsAsync:async()=>{stepPrompts++;return granted;},isAvailableAsync:async()=>true,
      watchStepCount:callback=>{stepCallback=callback;return {remove(){stepRemoved++;}};}}},
    '../store/useSafeScaleStore':{useSafeScaleStore:store},
    '../services/WorkoutSensors':load('src/services/WorkoutSensors.ts'),
    '../services/SensorPermissions':load('src/services/SensorPermissions.ts'),
  });
  hook.useWorkoutSensors(true);const cleanups=effects.map(effect=>effect());
  return {state,emitSteps:steps=>stepCallback({steps}),cleanup:()=>cleanups.forEach(fn=>fn?.()),
    counts:()=>({gpsRemoved,stepRemoved,stepPrompts})};
}

test('workout step counts never regress and stopped subscriptions ignore late events',async()=>{
  const f=hookFixture();await flush();
  f.emitSteps(8);assert.equal(f.state.activeWorkout.stepCount,18);
  f.emitSteps(3);assert.equal(f.state.activeWorkout.stepCount,18);
  f.emitSteps(NaN);assert.equal(f.state.activeWorkout.stepCount,18);
  f.emitSteps(12);assert.equal(f.state.activeWorkout.stepCount,22);
  f.cleanup();f.emitSteps(50);assert.equal(f.state.activeWorkout.stepCount,22);
  assert.deepEqual(f.counts(),{gpsRemoved:1,stepRemoved:1,stepPrompts:1});
});

test('ending a workout during permission setup cancels queued prompts and sensor creation',async()=>{
  let finish;let watches=0;
  const f=hookFixture({getForegroundPermissionsAsync:async()=>denied,
    requestForegroundPermissionsAsync:()=>new Promise(r=>{finish=r;}),
    watchPositionAsync:async()=>{watches++;return {remove(){}};}});
  await flush();f.cleanup();finish(granted);await flush();
  assert.equal(watches,0);assert.equal(f.counts().stepPrompts,0);
});

test('late GPS subscription is immediately removed after background cleanup',async()=>{
  let finish;let removed=0;
  const f=hookFixture({watchPositionAsync:()=>new Promise(r=>{finish=r;})});
  await flush();f.cleanup();finish({remove(){removed++;}});await flush();assert.equal(removed,1);
});
