const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const crypto=require('node:crypto');
function load(file,mocks={},globals={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,TextEncoder,TextDecoder,URL,console,setTimeout,clearTimeout,...globals,require:n=>{
      if(n in mocks)return mocks[n];
      if(n==='expo-file-system/legacy')return {};
      if(n.startsWith('./'))return load(`src/services/${n.slice(2)}.ts`,mocks,globals);
      throw Error(n);
    }});return exports;
}
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture() {
  const records=new Map(),writes=[];const key=crypto.randomBytes(32);
  const raw={getItem:async n=>records.get(n)??null,setItem:async(n,v)=>{
    assert.ok(Buffer.byteLength(v)<2*1024*1024,'encrypted row must fit Android CursorWindow');
    records.set(n,v);writes.push(n);
  },removeItem:async n=>{records.delete(n);},getAllKeys:async()=>[...records.keys()]};
  const cipher={encrypt:async value=>{
    const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);
    const data=Buffer.concat([c.update(value,'utf8'),c.final()]);
    return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');
  },decrypt:async value=>{
    const bytes=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
    d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString('utf8');
  }};
  const {createProtectedStorage}=load('src/services/ProtectedStorageCore.ts');
  const encrypted=createProtectedStorage(raw,cipher);
  const {createPhotoRecordStorage}=load('src/services/PhotoRecordStorage.ts');
  const photo=createPhotoRecordStorage(encrypted,async()=>crypto.randomBytes(32).toString('hex'),raw.getAllKeys);
  return {records,writes,raw,encrypted,photo};
}
test('large photos use small encrypted chunks, hydrate after restart, and do not re-encrypt on water updates',async()=>{
  const f=fixture(),uri='data:image/jpeg;base64,'+'A'.repeat(3*1024*1024);
  const value=JSON.stringify({state:{loggedItems:[{photoUri:uri}],medicalRecords:[],water:1}});
  await f.photo.setItem('health',value);
  const stored=await f.encrypted.getItem('health');assert.ok(stored.length<1000);assert.ok(!stored.includes('AAAA'));
  for(const v of f.records.values())assert.ok(!v.includes('data:image/'));
  const count=f.writes.filter(n=>n.startsWith('safescale-photo-v1:')).length;assert.ok(count>1);
  await f.photo.setItem('health',value.replace('"water":1','"water":2'));
  assert.equal(f.writes.filter(n=>n.startsWith('safescale-photo-v1:')).length,count);
  const fresh=load('src/services/PhotoRecordStorage.ts').createPhotoRecordStorage(f.encrypted,async()=>crypto.randomBytes(32).toString('hex'),f.raw.getAllKeys);
  assert.equal(JSON.parse(await fresh.getItem('health')).state.loggedItems[0].photoUri,uri);
  await fresh.setItem('health',JSON.stringify({state:{loggedItems:[],water:3}}));
  assert.equal([...f.records.keys()].filter(n=>n.startsWith('safescale-photo-v1:')).length,0);
});
test('failed photo saves preserve the committed record and explicit deletion clears orphaned allocations',async()=>{
  const f=fixture();await f.photo.setItem('health','{"state":{"name":"synthetic"}}');const previous=f.records.get('health');
  const normal=f.raw.setItem;f.raw.setItem=async(n,v)=>{if(n.startsWith('safescale-photo-v1:'))throw Error('disk full');return normal(n,v);};
  await assert.rejects(f.photo.setItem('health',JSON.stringify({state:{loggedItems:[{photoUri:'data:image/png;base64,AAAA'}]}})),/disk full/);
  assert.equal(f.records.get('health'),previous);
  f.records.set('safescale-photo-v1:'+'f'.repeat(64)+':0','orphan');f.records.set('unrelated','keep');
  await f.photo.clear('health');assert.deepEqual([...f.records.keys()],['unrelated']);
});
test('a missing photo chunk marks only that attachment missing',async()=>{
  const f=fixture();await f.photo.setItem('health',JSON.stringify({state:{medicalRecords:[{title:'retain record',documentImage:'data:image/png;base64,AAAA'}]}}));
  f.records.delete([...f.records.keys()].find(n=>n.startsWith('safescale-photo-v1:')));
  const state=JSON.parse(await f.photo.getItem('health')).state;
  assert.equal(state.medicalRecords[0].title,'retain record');assert.equal(state.medicalRecords[0].attachmentMissing,true);
});
test('attachment authentication failures preserve all committed ciphertext for retry',async()=>{
  const f=fixture();await f.photo.setItem('health',JSON.stringify({state:{loggedItems:[{photoUri:'data:image/jpeg;base64,AAAA'}]}}));
  const chunk=[...f.records.keys()].find(n=>n.startsWith('safescale-photo-v1:'));
  f.records.set(chunk,'safescale-aes-v1:corrupt');const snapshot=[...f.records];
  await assert.rejects(f.photo.getItem('health'));assert.deepEqual([...f.records],snapshot);
});
test('record limits reject oversized saves before touching committed data',async()=>{
  const f=fixture();await f.photo.setItem('health','{"state":{"name":"keep"}}');const snapshot=[...f.records];
  await assert.rejects(f.photo.setItem('health',JSON.stringify({state:{notes:'x'.repeat(800000)}})),/Record storage is full/);
  assert.deepEqual([...f.records],snapshot);
});
test('legacy migration sanitizes before its first encrypted write',async()=>{
  let saved=JSON.stringify({state:{profile:{name:'keep',geminiApiKey:'PRIVATE'}}});const encryptedInputs=[];
  const {createProtectedStorage}=load('src/services/ProtectedStorageCore.ts');
  const store=createProtectedStorage({getItem:async()=>saved,setItem:async(_n,v)=>{saved=v;},removeItem:async()=>{}},
    {encrypt:async v=>{encryptedInputs.push(v);return 'sealed';},decrypt:async()=>''},v=>{const d=JSON.parse(v);delete d.state.profile.geminiApiKey;return JSON.stringify(d);});
  assert.equal(JSON.parse(await store.getItem('health')).state.profile.name,'keep');
  assert.equal(encryptedInputs.length,1);assert.ok(!encryptedInputs[0].includes('PRIVATE'));
});
test('corrupt browser data rejects hydration, while reset rejects pending unlock and supports a new passphrase',async()=>{
  const {createWebVault}=load('src/services/WebVaultCore.ts');let raw='{bad';
  const io={getItem:async()=>raw,setItem:async(_n,v)=>{raw=v;},removeItem:async()=>{raw=null;}};
  const v=createWebVault(io,crypto.webcrypto,()=>{});
  await assert.rejects(v.getItem('health'),/JSON|property|position|Expected/);assert.equal(raw,'{bad');
  raw=null;const read=v.getItem('health');const rejected=assert.rejects(read,/reset/);await tick();v.reset();await rejected;
  const next=v.getItem('health');await tick();await v.unlock('new synthetic passphrase');assert.equal(await next,null);
  await v.setItem('health','{"state":{}}');v.reset();
  const reopen=v.getItem('health');await tick();await assert.rejects(v.unlock('wrong phrase'),/Incorrect/);
  await v.unlock('new synthetic passphrase');assert.equal(await reopen,'{"state":{}}');
});
test('photo cleanup follows successful encrypted persistence and retains cache on failure',async()=>{
  let fail=false;const events=[];
  const mod=load('src/services/SecureHealthStorage.ts',{
    '@react-native-async-storage/async-storage':{},'react-native':{Platform:{OS:'ios'}},'expo-secure-store':{},'expo-crypto':{},zustand:require('zustand'),
    './ProtectedStorageCore':{createProtectedStorage:()=>({getItem:async()=>null,setItem:async()=>{events.push('persist');if(fail)throw Error('disk full');},removeItem:async()=>{}})},
    './LocalPhotoStorage':{inlineSavedPhotos:async value=>({value,temporaryFiles:['file:///cache/copy.jpg']}),removePhotoCacheCopy:async()=>events.push('cleanup')},
  });
  await mod.SecureHealthStorage.setItem('health','{}');assert.deepEqual(events,['persist','cleanup']);events.length=0;fail=true;
  await mod.SecureHealthStorage.setItem('health','{}');assert.deepEqual(events,['persist']);assert.ok(mod.useStorageStatus.getState().error);
});
test('legacy attachment errors do not block records and cache aliases preserve original files',async()=>{
  const deleted=[];
  const m=load('src/services/LocalPhotoStorage.ts',{'expo-file-system/legacy':{
    cacheDirectory:'file:///var/mobile/app/Library/Caches/',EncodingType:{Base64:'base64'},
    getInfoAsync:async uri=>({exists:true,isDirectory:false,size:uri.includes('huge')?20*1024*1024:4}),
    readAsStringAsync:async()=>'AAAA',deleteAsync:async uri=>deleted.push(uri),
  }});
  const result=await m.inlineSavedPhotos(JSON.stringify({state:{medicalRecords:[{title:'keep',documentImage:'file:///private/var/mobile/app/Library/Caches/huge.jpg'}]}}));
  assert.equal(JSON.parse(result.value).state.medicalRecords[0].attachmentMissing,true);
  const photo=await m.inlineLocalPhoto('file:///private/var/mobile/app/Library/Caches/photo.webp');assert.match(photo.uri,/^data:image\/webp/);
  await m.removePhotoCacheCopy(photo.temporaryFile);await m.removePhotoCacheCopy('file:///private/var/mobile/app/Documents/original.jpg');
  assert.equal(deleted.length,1);
});
test('export strips image bytes, file references and credentials at every level',()=>{
  const {privacyExport}=load('src/utils/privacyExport.ts');
  const result=privacyExport({loggedItems:[{food:'keep',photoUri:'data:image/jpeg;base64,PRIVATE'}],medicalRecords:[{documentImage:'file:///PRIVATE',title:'keep'}],profile:{accessToken:'PRIVATE'}});
  assert.ok(!result.includes('PRIVATE'));assert.match(result,/keep/);
  const {localImageUri}=load('src/services/OfflinePolicy.ts');assert.equal(localImageUri('/server/image.jpg'),undefined);
});
test('browser deletion erases encrypted photos, suppresses reset writes, and requires a new vault passphrase',async()=>{
  const records=new Map();
  const io={getItem:async n=>records.get(n)??null,setItem:async(n,v)=>{records.set(n,v);},removeItem:async n=>{records.delete(n);},getAllKeys:async()=>[...records.keys()]};
  const mod=load('src/services/SecureHealthStorage.ts',{
    '@react-native-async-storage/async-storage':io,'react-native':{Platform:{OS:'web'}},'expo-secure-store':{},
    'expo-crypto':{getRandomBytesAsync:async n=>crypto.randomBytes(n)},zustand:require('zustand'),
  },{crypto:crypto.webcrypto});
  const initial=mod.SecureHealthStorage.getItem('safescale-storage');await tick();await mod.unlockWebVault('old synthetic passphrase');assert.equal(await initial,null);
  await mod.SecureHealthStorage.setItem('safescale-storage',JSON.stringify({state:{profile:{name:'synthetic'},loggedItems:[{photoUri:'data:image/jpeg;base64,'+'A'.repeat(300000)}]}}));
  assert.ok([...records.keys()].some(n=>n.startsWith('safescale-photo-v1:')));
  // Re-read a multi-chunk browser photo through the real encrypted backend.
  const saved=JSON.parse(await mod.SecureHealthStorage.getItem('safescale-storage'));assert.equal(saved.state.loggedItems[0].photoUri.length,300023);
  await mod.SecureHealthStorage.clearSavedData(()=>{void mod.SecureHealthStorage.setItem('safescale-storage','{"state":{}}');});
  assert.equal(records.size,0);assert.equal(mod.useWebVaultStatus.getState().locked,true);
  await tick();await mod.unlockWebVault('new synthetic passphrase');
  await mod.SecureHealthStorage.setItem('safescale-storage','{"state":{"new":true}}');
  const reopened=load('src/services/WebVaultCore.ts').createWebVault(io,crypto.webcrypto,()=>{});
  const read=reopened.getItem('safescale-storage');await tick();
  await assert.rejects(reopened.unlock('old synthetic passphrase'),/Incorrect/);
  await reopened.unlock('new synthetic passphrase');assert.equal(JSON.parse(await read).state.new,true);
});
test('resetting a locked browser vault releases its pending hydration instead of deadlocking',async()=>{
  const records=new Map();
  const io={getItem:async n=>records.get(n)??null,setItem:async(n,v)=>records.set(n,v),removeItem:async n=>records.delete(n),getAllKeys:async()=>[...records.keys()]};
  const mod=load('src/services/SecureHealthStorage.ts',{
    '@react-native-async-storage/async-storage':io,'react-native':{Platform:{OS:'web'}},'expo-secure-store':{},'expo-crypto':{},zustand:require('zustand'),
  },{crypto:crypto.webcrypto});
  const read=mod.SecureHealthStorage.getItem('safescale-storage');const rejection=assert.rejects(read,/reset/);await tick();
  await mod.SecureHealthStorage.clearSavedData();await rejection;
  assert.equal(records.size,0);assert.equal(mod.useStorageStatus.getState().readFailed,false);
  await tick();await mod.unlockWebVault('replacement synthetic passphrase');
});

test('readable native records stay available when a migration rewrite fails and can be retried',async()=>{
  let full=true;const events=[];
  const value=JSON.stringify({state:{medicalRecords:[{title:'Synthetic record'}]}});
  const mod=load('src/services/SecureHealthStorage.ts',{
    '@react-native-async-storage/async-storage':{},'react-native':{Platform:{OS:'ios'}},'expo-secure-store':{},'expo-crypto':{},zustand:require('zustand'),
    './ProtectedStorageCore':{createProtectedStorage:()=>({getItem:async name=>name==='safescale-storage'?value:null,setItem:async()=>{events.push('write');if(full)throw Error('disk full');},removeItem:async()=>{}})},
    './LocalPhotoStorage':{inlineSavedPhotos:async value=>({value,temporaryFiles:['file:///cache/copy.jpg']}),removePhotoCacheCopy:async()=>events.push('cleanup')},
  });
  assert.equal(JSON.parse(await mod.SecureHealthStorage.getItem('safescale-storage')).state.medicalRecords[0].title,'Synthetic record');
  assert.equal(mod.useStorageStatus.getState().readFailed,false);
  assert.ok(mod.useStorageStatus.getState().error);assert.deepEqual(events,['write']);
  full=false;await mod.SecureHealthStorage.retryWrite();
  assert.equal(mod.useStorageStatus.getState().error,null);assert.deepEqual(events,['write','write','cleanup']);
});

