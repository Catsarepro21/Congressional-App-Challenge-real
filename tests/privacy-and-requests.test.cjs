const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const crypto=require('node:crypto');
function load(path,mocks={},globals={}) {
  const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports,Date,console,TextEncoder,TextDecoder,setTimeout,clearTimeout,AbortController,...globals,require:n=>{if(n in mocks)return mocks[n];if(n==='./PhotoRecordStorage')return load('src/services/PhotoRecordStorage.ts');if(n==='./OfflinePolicy')return load('src/services/OfflinePolicy.ts');if(n==='./LocalPhotoStorage')return load('src/services/LocalPhotoStorage.ts',{'expo-file-system/legacy':{}},globals);if(n==='./WebVaultCore')return load('src/services/WebVaultCore.ts',{'./ProtectedStorageCore':load('src/services/ProtectedStorageCore.ts')},globals);throw Error(n);}});return exports;
}
const {createProtectedStorage}=load('src/services/ProtectedStorageCore.ts');
function fixture() {
  const records=new Map();const key=crypto.randomBytes(32);
  const io={getItem:async n=>records.get(n)??null,setItem:async(n,v)=>{records.set(n,v);},removeItem:async n=>{records.delete(n);}};
  const cipher={encrypt:async value=>{const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');},
    decrypt:async value=>{const bytes=Buffer.from(value,'base64');const d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString('utf8');}};
  return {records,io,cipher,store:createProtectedStorage(io,cipher)};
}
test('protected storage migrates legacy records and never stores plaintext credentials',async()=>{
  const f=fixture();const value=JSON.stringify({state:{profile:{geminiApiKey:'synthetic-secret'},name:'Synthetic patient'}});
  f.records.set('health',value);assert.equal(await f.store.getItem('health'),value);
  assert.match(f.records.get('health'),/^safescale-aes-v1:/);assert.ok(!f.records.get('health').includes('synthetic-secret'));
  assert.equal(await f.store.getItem('health'),value);
  const previous=f.records.get('health');await f.store.setItem('health',value);assert.notEqual(f.records.get('health'),previous);
});
test('failed migration and corrupt encrypted state never overwrite saved records',async()=>{
  const f=fixture();f.records.set('health','{"old":true}');
  const failing=createProtectedStorage(f.io,{...f.cipher,encrypt:async()=>{throw Error('keychain locked');}});
  await assert.rejects(failing.getItem('health'),/locked/);assert.equal(f.records.get('health'),'{"old":true}');
  await f.store.getItem('health');const broken=f.records.get('health').slice(0,-8)+'AAAAAAAA';f.records.set('health',broken);
  await assert.rejects(f.store.getItem('health'));assert.equal(f.records.get('health'),broken);
});
test('protected writes are ordered and deletion follows pending writes',async()=>{
  const f=fixture();await Promise.all([f.store.setItem('x','1'),f.store.setItem('x','2')]);assert.equal(await f.store.getItem('x'),'2');
  await Promise.all([f.store.setItem('x','3'),f.store.removeItem('x')]);assert.equal(await f.store.getItem('x'),null);
});
test('web vault migrates legacy records with credentials removed and encrypted',async()=>{
  const f=fixture();const mod=load('src/services/SecureHealthStorage.ts',{
    '@react-native-async-storage/async-storage':f.io,'react-native':{Platform:{OS:'web'}},'expo-secure-store':{},'expo-crypto':{},zustand:require('zustand'),'./ProtectedStorageCore':{createProtectedStorage},
  },{crypto:crypto.webcrypto});
  const value=JSON.stringify({state:{profile:{name:'Synthetic',geminiApiKey:'secret',healthConnections:{apple:{connectedAt:'today'},'google-fit':{accessToken:'token',refreshToken:'refresh'}}}}});
  f.records.set('health',value);const work=mod.SecureHealthStorage.getItem('health');
  await new Promise(r=>setTimeout(r,0));await mod.unlockWebVault('a long synthetic passphrase');
  const result=JSON.parse(await work);assert.equal(result.state.profile.name,'Synthetic');assert.equal(result.state.profile.geminiApiKey,undefined);
  assert.equal(result.state.profile.healthConnections['google-fit'],undefined);
  assert.ok(!f.records.get('health').includes('Synthetic'));assert.match(f.records.get('health'),/^safescale-aes-v1:/);
  await mod.SecureHealthStorage.setItem('health',value);assert.ok(!f.records.get('health').includes('geminiApiKey'));
});

test('request deadlines and cancellation also apply to hung response parsing',async()=>{
  const {controlledRequest:r}=load('src/services/RequestControl.ts');
  await assert.rejects(r(()=>new Promise(()=>{}),5),/timed out/);
  const parent=new AbortController();let called=false;parent.abort();
  await assert.rejects(r(async()=>{called=true;},500,parent.signal),/canceled/);assert.equal(called,false);
  const p=new AbortController();const work=r(()=>new Promise(()=>{}),500,p.signal);p.abort();await assert.rejects(work,/canceled/);
});
test('native availability distinguishes Vision from text and unsupported platforms',async()=>{
  const mocks={'react-native':{Platform:{OS:'ios'}},'./LocalAIService':{},'./CloudAIService':{},'../../modules/safescale-vision':{isVisionSupportedAsync:async()=>true,isFoundationModelSupportedAsync:async()=>false}};
  const ai=load('src/services/AIIntelligenceService.ts',mocks);
  const caps=await ai.refreshDeviceCapabilities();assert.equal(caps.isVisionSupported,true);assert.equal(caps.isTextGenerationSupported,false);assert.equal(caps.isOnDeviceSupported,true);
  mocks['react-native'].Platform.OS='android';assert.equal((await ai.refreshDeviceCapabilities()).isOnDeviceSupported,false);
});
test('a nonexistent food filename cannot masquerade as native vision',async()=>{
  const {NativeVisionService:v}=load('src/services/NativeVisionService.ts',{'./USDALookupService':{}});
  assert.equal((await v.classifyImage('file:///does-not-exist/banana.jpg')).length,0);
});

test('offline ingredient checker shares aliases and never certifies unknown ingredients or substitutes',()=>{
  const {LocalAIService:a}=load('src/services/LocalAIService.ts',{'./AllergenEngine':load('src/services/AllergenEngine.ts')});
  const matched=a.analyzeIngredients(['Whey protein'],['Milk','Soy']);
  assert.equal(matched.insights[0].category,'Allergen');assert.equal(matched.insights[0].alternatives.length,0);
  const unknown=a.analyzeIngredients(['unidentified ingredient'],['Milk']);
  assert.equal(unknown.insights[0].category,'Unknown');assert.match(unknown.summary,/does not establish safety/);
  assert.match(a.analyzeIngredients([],[]).summary,/cannot be assessed/);
});
test('canceling the consent dialog prevents execution and clears its pending request',async()=>{
  const {CloudPermissionGuard:g,useCloudPermissionStore:s}=load('src/services/CloudPermissionGuard.ts',{zustand:require('zustand'),'../store/useSafeScaleStore':{useSafeScaleStore:{getState:()=>({isTestMode:false})}}});
  const controller=new AbortController();let calls=0;
  const work=g.executeWithPermission({purpose:'test',endpoint:'test',dataPayloadSummary:'synthetic'},async()=>{calls++;},async()=>{calls++;},controller.signal);
  controller.abort();await assert.rejects(work,/cancel/i);assert.equal(calls,0);assert.equal(s.getState().currentRequest,null);
});
test('native storage read failure blocks replacement and allows recovery after unlock',async()=>{
  let locked=true;let writes=0;
  const status=load('src/services/SecureHealthStorage.ts',{
    '@react-native-async-storage/async-storage':{},'react-native':{Platform:{OS:'ios'}},'expo-secure-store':{},'expo-crypto':{},zustand:require('zustand'),
    './ProtectedStorageCore':{createProtectedStorage:()=>({getItem:async name=>{if(locked)throw Error('locked');return name === 'health' ? '{}' : null;},setItem:async()=>{writes++;},removeItem:async()=>{}})},
  });
  await assert.rejects(status.SecureHealthStorage.getItem('health'));
  await status.SecureHealthStorage.setItem('health','replacement');assert.equal(writes,0);
  assert.equal(status.useStorageStatus.getState().readFailed,true);locked=false;
  await status.SecureHealthStorage.getItem('health');await status.SecureHealthStorage.setItem('health','{}');assert.equal(writes,2);
});
