const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {webcrypto} = require('node:crypto');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports, TextEncoder, TextDecoder, URL, Date, console, setTimeout, clearTimeout, AbortController, ...globals,
      require: name => {if(name in mocks)return mocks[name]; if(name === './OfflinePolicy')return load('src/services/OfflinePolicy.ts');throw Error(name);}});
  return exports;
}
const core = load('src/services/ProtectedStorageCore.ts');
const {createWebVault} = load('src/services/WebVaultCore.ts', {'./ProtectedStorageCore':core});
const tick = () => new Promise(r=>setTimeout(r,0));
function fixture(records = new Map()) {
  const io = {getItem:async n=>records.get(n)??null, setItem:async(n,v)=>records.set(n,v), removeItem:async n=>records.delete(n)};
  const requests = [];
  const vault = createWebVault(io,webcrypto, creating=>requests.push(creating));
  return {records,vault,requests};
}
test('browser vault authenticates a passphrase, rejects tampering, and does not store its key', async()=>{
  const f = fixture();const read = f.vault.getItem('health');await tick();
  await assert.rejects(f.vault.unlock('short'),/12/);assert.equal(f.records.size,0);
  await f.vault.unlock('a synthetic passphrase');assert.equal(await read,null);
  const clear=JSON.stringify({state:{name:'PRIVATE HEALTH FIXTURE'}});
  await f.vault.setItem('health',clear);const sealed=f.records.get('health');
  assert.ok(!sealed.includes('PRIVATE'));assert.ok(!sealed.includes('passphrase'));
  assert.equal(await f.vault.getItem('health'),clear);
  await f.vault.setItem('health',clear);assert.notEqual(f.records.get('health'),sealed);
  const locked=fixture(f.records);const work=locked.vault.getItem('health');await tick();
  const unchanged=f.records.get('health');await assert.rejects(locked.vault.unlock('wrong passphrase'),/Incorrect/);assert.equal(f.records.get('health'),unchanged);
  await locked.vault.unlock('a synthetic passphrase');assert.equal(await work,clear);
  const prefix='safescale-aes-v1:';const data=JSON.parse(f.records.get('health').slice(prefix.length));data.data[0]^=1;
  f.records.set('health',prefix+JSON.stringify(data));await assert.rejects(locked.vault.getItem('health'));
  assert.equal(f.records.get('health'),prefix+JSON.stringify(data));
});
test('legacy browser records remain untouched until a vault passphrase is chosen',async()=>{
  const clear='{"state":{"name":"private old record"}}';const f=fixture(new Map([['health',clear]]));
  let resolved=false;const work=f.vault.getItem('health').then(value=>{resolved=true;return value;});await tick();
  assert.equal(resolved,false);assert.equal(f.records.get('health'),clear);assert.equal(f.requests[0],true);
  await f.vault.unlock('a different synthetic passphrase');assert.equal(await work,clear);
  assert.ok(!f.records.get('health').includes('private old record'));
});
test('the app transport cannot call global fetch, even with a credentialed request',async()=>{
  let calls=0;const {offlineFetch,localImageUri}=load('src/services/OfflinePolicy.ts',{}, {fetch:async()=>{calls++;}});
  await assert.rejects(offlineFetch('https://example.invalid',{method:'POST',body:'private'}),/disabled/);assert.equal(calls,0);
  for(const uri of ['https://example.invalid/pixel','//example.invalid/pixel','javascript:alert(1)','data:image/svg+xml;base64,AA'])assert.equal(localImageUri(uri),undefined);
  assert.equal(localImageUri('file:///local.jpg'),'file:///local.jpg');assert.equal(localImageUri('data:image/jpeg;base64,AA'),'data:image/jpeg;base64,AA');
});
test('every app fetch is bound to the deny transport and no browser sign-in can launch',()=>{
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  for(const file of walk('src').filter(f=>/\.tsx?$/.test(f))){
    const text=fs.readFileSync(file,'utf8');
    if(/\bfetch\s*\(/.test(text))assert.match(text,/import \{ offlineFetch as fetch \} from ['"].*OfflinePolicy['"]/ ,file);
    assert.doesNotMatch(text,/\b(?:XMLHttpRequest|WebSocket|sendBeacon|openAuthSessionAsync)\s*\(/,file);
    assert.doesNotMatch(text,/(?:globalThis|window)\.fetch\s*\(/,file);
  }
  for(const name of ['GoogleFitService','GoogleHealthService']){
    const text=fs.readFileSync(`src/services/${name}.ts`,'utf8');assert.match(text,/authorize:[\s\S]*?return blockExternalService\(\)/);
  }
});
test('failed local photo recognition never reads or uploads the photo even with a saved key',async()=>{
  let reads=0;const {FoodVisionService}=load('src/services/FoodVisionService.ts',{
    'expo-file-system/legacy':{readAsStringAsync:async()=>{reads++;return 'photo';}},
    './NativeVisionService':{NativeVisionService:{classifyAndLookup:async()=>{throw Error('Apple Vision could not identify the photo');}}},
  });
  await assert.rejects(FoodVisionService.analyzeImage('file:///local.jpg','on-device','old-key'),/not available offline|Apple Vision could not identify/);
  assert.equal(reads,0);
});
test('native text route uses the on-device model and preserves a local-only fallback',async()=>{
  const {LocalHealthChatEngine}=load('src/services/LocalHealthChatEngine.ts',{
    './HealthContextAggregator':{HealthContextAggregator:{getSnapshot:()=>({}),getAsPromptContext:()=> 'Fictional context'}},
    './CloudPermissionGuard':{},
    './RequestControl':load('src/services/RequestControl.ts'),
    '../../modules/safescale-vision':{isFoundationModelSupportedAsync:async()=>true,generateTextAsync:async()=>({text:'Local model response',provider:'apple-foundation',isLocal:true})},
  });
  const result=await LocalHealthChatEngine.sendMessage('What is recorded?');assert.equal(result.source,'apple-foundation');assert.equal(result.text,'Local model response');
  const swift=fs.readFileSync('modules/safescale-vision/ios/SafeScaleVisionModule.swift','utf8');
  assert.match(swift,/LanguageModelSession\(model: SystemLanguageModel.default/);
  assert.doesNotMatch(swift,/URLSession|PrivateCloud|Gemini/);
});
test('notifications do not contain medication names, doses, or vaccine details',async()=>{
  const content=[];const {NotificationService:n}=load('src/services/NotificationService.ts',{
    'react-native':{Platform:{OS:'ios'}},'expo-notifications':{
      setNotificationHandler:()=>{},getPermissionsAsync:async()=>({status:'granted'}),getAllScheduledNotificationsAsync:async()=>[],
      SchedulableTriggerInputTypes:{DAILY:'daily'},AndroidNotificationPriority:{HIGH:1,DEFAULT:1},
      scheduleNotificationAsync:async request=>{content.push(request.content);return 'id';},
    },
  });
  await n.scheduleMedicationReminder('opaque-id','PRIVATE MEDICATION','PRIVATE DOSE','08:00');
  await n.scheduleLowStockAlert('PRIVATE MEDICATION',4);await n.scheduleVaccineReminder('opaque-vaccine','PRIVATE VACCINE','2099-01-01');
  assert.equal(content.length,3);assert.ok(!JSON.stringify(content).includes('PRIVATE'));
});

test('photo records inline local bytes and never read a remote attachment',async()=>{
  const reads=[];const deleted=[];
  const {inlineSavedPhotos,removePhotoCacheCopy}=load('src/services/LocalPhotoStorage.ts',{
    'expo-file-system/legacy':{cacheDirectory:'file:///cache/',EncodingType:{Base64:'base64'},getInfoAsync:async()=>({exists:true,isDirectory:false,size:3}),
      readAsStringAsync:async uri=>{reads.push(uri);return 'YWJj';},deleteAsync:async uri=>deleted.push(uri)},
  });
  const result=await inlineSavedPhotos(JSON.stringify({state:{loggedItems:[{photoUri:'file:///cache/meal.jpg'},{photoUri:'https://example.invalid/private'}]}}));
  const saved=JSON.parse(result.value);assert.equal(saved.state.loggedItems[0].photoUri,'data:image/jpeg;base64,YWJj');
  assert.equal(saved.state.loggedItems[1].photoUri,undefined);assert.deepEqual(reads,['file:///cache/meal.jpg']);
  await removePhotoCacheCopy('file:///library/original.jpg');assert.equal(deleted.length,0);
  await removePhotoCacheCopy('file:///cache/../library/original.jpg');assert.equal(deleted.length,0);
  await removePhotoCacheCopy('file:///cache/%2F../library/original.jpg');assert.equal(deleted.length,0);
  await removePhotoCacheCopy(result.temporaryFiles[0]);assert.deepEqual(deleted,['file:///cache/meal.jpg']);
});

test('attachment preparation cannot reorder saves or restore records after deletion',async()=>{
  let finish;const writes=[];let prepareCount=0;
  const mod=load('src/services/SecureHealthStorage.ts',{
    '@react-native-async-storage/async-storage':{},'react-native':{Platform:{OS:'ios'}},'expo-secure-store':{deleteItemAsync:async()=>{}},'expo-crypto':{},
    zustand:require('zustand'),'./WebVaultCore':{},
    './LocalPhotoStorage':{inlineSavedPhotos:async value=>{if(++prepareCount===1)await new Promise(resolve=>{finish=resolve;});return {value,temporaryFiles:[]};},removePhotoCacheCopy:async()=>{}},
    './ProtectedStorageCore':{createProtectedStorage:()=>({getItem:async()=>null,setItem:async(_name,value)=>writes.push(value),removeItem:async()=>writes.push('DELETE')})},
  });
  const first=mod.SecureHealthStorage.setItem('health','{"revision":1}');await tick();
  const second=mod.SecureHealthStorage.setItem('health','{"revision":2}');finish();await Promise.all([first,second]);
  assert.deepEqual(writes,['{"revision":1}','{"revision":2}']);
  prepareCount=0;const pending=mod.SecureHealthStorage.setItem('health','{"revision":3}');await tick();
  const deletion=mod.SecureHealthStorage.clearSavedData();finish();await Promise.all([pending,deletion]);
  assert.equal(writes.at(-1),'DELETE');
});
