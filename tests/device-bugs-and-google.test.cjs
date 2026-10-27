const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){
  const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,
    {exports,console,Error,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,...globals,require:n=>{
      if(n in mocks)return mocks[n];if(n==='./RequestControl')return load('src/services/RequestControl.ts');throw Error(n);
    }});return exports;
}
test('Google transport permits read-only imports and token exchange, rejects uploads and foreign origins',async()=>{
  const calls=[];const {googleHealthFetch:fetch}=load('src/services/GoogleHealthTransport.ts',{}, {fetch:async(url,options)=>{calls.push({url,options});return {ok:true};}});
  await fetch('https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:reconcile?filter=steps.interval.start_time%3E%222026-10-23%22',{headers:{Authorization:'Bearer synthetic'}});
  await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:'grant_type=refresh_token&refresh_token=synthetic&client_id=synthetic'});
  assert.equal(calls.length,2);assert.equal(calls[0].options.redirect,'error');
  for(const url of ['https://evil.invalid/','http://health.googleapis.com/v4/users/me/identity','https://health.googleapis.com.evil.invalid/v4/users/me/identity','https://people.googleapis.com/other'])await assert.rejects(fetch(url));
  await assert.rejects(fetch('https://health.googleapis.com/v4/users/me/identity',{method:'POST',body:'PRIVATE'}));
  await assert.rejects(fetch('https://oauth2.googleapis.com/token',{method:'POST',body:'grant_type=refresh_token&medicalRecords=PRIVATE'}));
  await assert.rejects(fetch('https://health.googleapis.com/v4/users/me/identity?medicalRecords=PRIVATE'));
  assert.equal(calls.length,2);
});
function coordinator(google){return load('src/services/HealthSyncService.ts',{
  'react-native':{Platform:{OS:'ios'},NativeModules:{}},'./HealthDataService':{HealthDataService:{}},'./NativeHealthReader':{},'./GoogleHealthService':{GoogleHealthService:google},
});}
test('Google Health imports need new consent, refresh expired tokens, and replace full snapshots instead of summing deltas',async()=>{
  let signins=0,reads=0;const sync=coordinator({
    authorize:async()=>{signins++;return {accessToken:'old-token',refreshToken:'refresh'};},
    refreshAccessToken:async token=>{assert.equal(token,'refresh');return 'new-token';},
    fetchFitnessData:async(token,lastSync)=>{reads++;assert.equal(lastSync,undefined);if(token==='old-token')throw Error('UNAUTHENTICATED');return {steps:500,heartRate:70};},
    fetchProfileData:async()=>({heightCm:170}),
  });
  await assert.rejects(sync.syncHealthSource('google-health',{connectedAt:'old',accessToken:'legacy-token'}),/Reconnect/);assert.equal(signins,0);assert.equal(reads,0);
  const result=await sync.syncHealthSource('google-health',undefined,undefined,true);
  assert.equal(signins,1);assert.equal(reads,2);assert.equal(result.connection.consentVersion,1);assert.equal(result.connection.accessToken,'new-token');assert.equal(result.readings.steps,500);assert.equal(result.profile.height,170);
  const again=await sync.syncHealthSource('google-health',result.connection);assert.equal(signins,1);assert.equal(again.readings.steps,500);
});
test('canceling Google Health aborts active reads and prevents connection restoration',async()=>{
  let signal,release;const sync=coordinator({fetchFitnessData:async(_a,_b,_c,s)=>{signal=s;await new Promise(r=>{release=r;});return {steps:123};}});
  const work=sync.syncHealthSource('google-health',{connectedAt:'now',consentVersion:1,accessToken:'synthetic'});
  assert.ok(signal);sync.cancelGoogleHealthSync();assert.equal(signal.aborted,true);release();await assert.rejects(work,/canceled/);
});
test('background refresh cannot interrupt an interactive Google Health import',async()=>{
  let release,signal;const sync=coordinator({fetchFitnessData:async(_a,_b,_c,s)=>{signal=s;await new Promise(r=>{release=r;});return {steps:12};},fetchProfileData:async()=>({})});
  const connection={connectedAt:'now',consentVersion:1,accessToken:'synthetic'};
  const interactive=sync.syncHealthSource('google-health',connection,undefined,true);
  await assert.rejects(sync.syncHealthSource('google-health',connection),/already in progress/);assert.equal(signal.aborted,false);
  release();assert.equal((await interactive).readings.steps,12);
});
test('Google OAuth uses PKCE, validates state before token exchange, and verifies linked account identity',async()=>{
  let callbackValid=false;const calls=[];let authUrl;
  const google=load('src/services/GoogleHealthService.ts',{
    './GoogleHealthTransport':{googleHealthFetch:async(url)=>{calls.push(url);return {ok:true,status:200,json:async()=>({access_token:'synthetic-token',refresh_token:'synthetic-refresh'})};}},
    'expo-web-browser':{maybeCompleteAuthSession(){},openAuthSessionAsync:async url=>{authUrl=new URL(url);return {type:'success',url:'test:/callback?code=synthetic'};}},
    'react-native':{Platform:{OS:'ios',select:o=>o.ios}},
    './GoogleOAuth':{GOOGLE_IOS_CLIENT_ID:'test-client',googleRedirectUri:()=> 'test:/callback',createGooglePKCE:async()=>({state:'synthetic-state',challenge:'synthetic-challenge',verifier:'synthetic-verifier'}),validateGoogleCallback:()=>{if(!callbackValid)throw Error('state mismatch');return 'synthetic-code';}},
  }).GoogleHealthService;
  await assert.rejects(google.authorize(),/state mismatch/);assert.equal(calls.length,0);
  callbackValid=true;const result=await google.authorize();assert.equal(result.accessToken,'synthetic-token');
  assert.equal(authUrl.searchParams.get('code_challenge_method'),'S256');assert.equal(authUrl.searchParams.get('state'),'synthetic-state');
  assert.ok(authUrl.searchParams.get('scope').includes('googlehealth.sleep.readonly'));assert.ok(!authUrl.searchParams.get('scope').includes('write'));
  assert.equal(calls[1],'https://health.googleapis.com/v4/users/me/identity');
});
const snapshot={user:{name:'Synthetic',age:16,allergies:[]},vitals:{steps:4263,activeCalories:0},nutrition:{mealCount:0,meals:[]},sleep:{totalMinutes:0,formatted:'Not recorded'},medications:{pending:[]},fasting:{isFasting:false},records:{recentLabs:[]}};
test('local fallback answers greetings and step guidance without inventing an individual target',async()=>{
  const engine=load('src/services/LocalHealthChatEngine.ts',{'./HealthContextAggregator':{HealthContextAggregator:{getSnapshot:()=>snapshot}}}).LocalHealthChatEngine;
  const hello=await engine.sendMessage('Hi!',{allowNative:false});assert.match(hello.text,/Hi, Synthetic/);assert.doesNotMatch(hello.text,/holistic|Carbohydrates/);
  const reply=await engine.sendMessage('How many steps should I take?',{allowNative:false});assert.match(reply.text,/4,263/);assert.match(reply.text,/gradual/);assert.doesNotMatch(reply.text,/10,000|cannot be provided/);
});
test('native model receives topic context and recent follow-up without a supplied-facts-only advice rule',async()=>{
  const engine=load('src/services/LocalHealthChatEngine.ts',{
    './HealthContextAggregator':{HealthContextAggregator:{getSnapshot:()=>snapshot}},
    '../../modules/safescale-vision':{isFoundationModelSupportedAsync:async()=>true,generateTextAsync:async(prompt,context)=>{
      assert.match(context,/4263/);assert.match(context,/short walks/);return {text:'Try a short comfortable walk and build gradually.',isLocal:true};
    }},
  }).LocalHealthChatEngine;
  const result=await engine.sendMessage('How many steps should I take?',{history:[{id:'synthetic',sender:'user',text:'I like short walks'}]});assert.equal(result.source,'apple-foundation');
  const swift=fs.readFileSync('modules/safescale-vision/ios/SafeScaleVisionModule.swift','utf8');assert.match(swift,/general, non-clinical wellness/);assert.doesNotMatch(swift,/Use only supplied facts/);
});
test('native Google connection tokens survive only new iPhone consent and are excluded from exports',()=>{
  const mod=load('src/services/SecureHealthStorage.ts',{
    '@react-native-async-storage/async-storage':{},'react-native':{Platform:{OS:'ios'}},'expo-secure-store':{},'expo-crypto':{},zustand:require('zustand'),
    './ProtectedStorageCore':{createProtectedStorage:()=>({})},'./WebVaultCore':{},'./LocalPhotoStorage':{},'./PhotoRecordStorage':{createPhotoRecordStorage:()=>({})},
  });
  const value=JSON.stringify({state:{profile:{geminiApiKey:'REMOVE',healthConnections:{'google-health':{consentVersion:1,accessToken:'PRIVATE',refreshToken:'PRIVATE'}}}}});
  const clean=JSON.parse(mod.stripWebCredentials(value));assert.equal(clean.state.profile.healthConnections['google-health'].accessToken,'PRIVATE');assert.equal(clean.state.profile.geminiApiKey,undefined);
  const {privacyExport}=load('src/utils/privacyExport.ts');assert.ok(!privacyExport(clean).includes('PRIVATE'));
  assert.equal(JSON.parse(mod.stripWebCredentials(value.replace('"consentVersion":1,',''))).state.profile.healthConnections['google-health'],undefined);
});
test('barcode permission button remains reachable through a non-interactive reticle overlay',async()=>{
  let requests=0,settings=0;const states=[];let index=0;let permission={granted:false,canAskAgain:true};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef:v=>({current:v}),useEffect:()=>{}};
  const animated={Value:class{interpolate(){return 0;}},View:'AnimatedView'};
  const rn={View:'View',Text:'Text',TextInput:'Input',Pressable:'Pressable',ScrollView:'ScrollView',ActivityIndicator:'Spinner',Animated:animated,Alert:{},Platform:{OS:'ios'},StyleSheet:{create:x=>x,absoluteFill:{}},AppState:{currentState:'active'},Linking:{openSettings:async()=>{settings++;}}};
  const component=load('src/components/care/BarcodeScannerModal.tsx',{
    react:{...react,default:react},'react-native':rn,'@expo/vector-icons/MaterialCommunityIcons':{default:'Icon'},
    'expo-camera':{CameraView:'Camera',useCameraPermissions:()=>[permission,async()=>{requests++;return permission;},async()=>permission]},
    '../../store/useSafeScaleStore':{useSafeScaleStore:selector=>selector({userAllergies:[]})},'../../services/BarcodeLookupService':{},'../../services/AllergenEngine':{},'./UI':{Sheet:'Sheet',Button:'Button',C:{},s:{}},
  }).default;
  const nodes=root=>!root||typeof root!=='object'?[]:[root,...(root.props?.children||[]).flat(Infinity).flatMap(nodes)];
  const text=node=>typeof node==='string'?node:(node?.props?.children||[]).flat(Infinity).map(text).join('');
  let tree=component({visible:true,onClose(){}});let elements=nodes(tree);assert.ok(elements.some(n=>n.props?.pointerEvents==='none'));
  await elements.find(n=>n.type==='Pressable'&&text(n)==='Enable Camera').props.onPress();assert.equal(requests,1);
  permission={granted:false,canAskAgain:false};index=0;tree=component({visible:true,onClose(){}});elements=nodes(tree);
  await elements.find(n=>n.type==='Pressable'&&text(n)==='Open Camera Settings').props.onPress();assert.equal(settings,1);assert.equal(requests,1);
});
test('meal camera selection keeps image bytes, cleans only its cache copy, and includes required native permissions',async()=>{
  let choices,selected,launchOptions,deleted;
  const picker=load('src/utils/mealPhotoPicker.ts',{
    'react-native':{Alert:{alert:(_a,_b,actions)=>{choices=actions;}},Platform:{OS:'ios'},Linking:{}},
    'expo-image-picker':{requestCameraPermissionsAsync:async()=>({granted:true}),launchCameraAsync:async options=>{launchOptions=options;return {canceled:false,assets:[{uri:'file:///cache/photo.jpg'}]};}},
    '../services/LocalPhotoStorage':{inlineLocalPhoto:async()=>({uri:'data:image/jpeg;base64,AAAA',temporaryFile:'file:///cache/photo.jpg'}),removePhotoCacheCopy:async uri=>{deleted=uri;}},
  },{setTimeout:resolve=>{resolve();return 1;}});
  picker.promptMealPhoto(uri=>{selected=uri;});await choices[0].onPress();
  assert.equal(launchOptions.base64,false);assert.equal(selected,'data:image/jpeg;base64,AAAA');assert.equal(deleted,'file:///cache/photo.jpg');
  const config=JSON.parse(fs.readFileSync('app.json','utf8')).expo;
  const plugin=config.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-image-picker');assert.ok(plugin[1].photosPermission);assert.equal(plugin[1].microphonePermission,false);
});
test('file cleanup and OAuth callbacks do not depend on a browser-only URL parser',async()=>{
  const deleted=[];const brokenURL=class{constructor(){throw Error('Native file/custom URL not supported');}};
  const photo=load('src/services/LocalPhotoStorage.ts',{
    'expo-file-system/legacy':{cacheDirectory:'file:///var/app/Library/Caches/',deleteAsync:async uri=>deleted.push(uri)},
    './OfflinePolicy':load('src/services/OfflinePolicy.ts'),
  },{URL:brokenURL});
  await photo.removePhotoCacheCopy('file:///private/var/app/Library/Caches/copy.jpg');
  await photo.removePhotoCacheCopy('file:///private/var/app/Documents/original.jpg');
  await photo.removePhotoCacheCopy('file:///private/var/app/Library/Caches/%2e%2e/original.jpg');
  assert.deepEqual(deleted,['file:///private/var/app/Library/Caches/copy.jpg']);
  const oauth=load('src/services/GoogleOAuth.ts',{'expo-crypto':{}},{URL:brokenURL});const redirect=oauth.googleRedirectUri(oauth.GOOGLE_IOS_CLIENT_ID);
  assert.equal(oauth.validateGoogleCallback(redirect+'?state=expected&code=synthetic',redirect,'expected'),'synthetic');
  assert.throws(()=>oauth.validateGoogleCallback(redirect.replace('oauthredirect','wrong')+'?state=expected&code=synthetic',redirect,'expected'));
  assert.throws(()=>oauth.validateGoogleCallback(redirect+'?state=expected&state=other&code=synthetic',redirect,'expected'));
});
test('inactive privacy cover preserves the mounted application across native permission dialogs',()=>{
  let covered=false,listener,removed=false;const cleanups=[];
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:()=>[covered,v=>{covered=v;}],useEffect:effect=>{if(!listener)cleanups.push(effect());}};
  const rn={View:'View',Text:'Text',Platform:{OS:'ios'},AppState:{currentState:'active',addEventListener:(_type,fn)=>{listener=fn;return {remove:()=>{removed=true;}};}}};
  const cover=load('src/components/AppPrivacyCover.tsx',{react:{...react,default:react},'react-native':rn}).default;
  const imports=[...fs.readFileSync('App.tsx','utf8').matchAll(/from ["']([^"']+)["']/g)].map(m=>m[1]);
  const mocks=Object.fromEntries(imports.map(name=>[name,{default:()=>null}]));mocks.react={...react,default:react};mocks['react-native']=rn;mocks['./src/components/AppPrivacyCover']={default:cover};
  const app=load('App.tsx',mocks).default;const tree=app();const contents=tree.props.children[0];
  assert.equal(cover(),null);listener('inactive');const overlay=cover();assert.ok(overlay);assert.equal(overlay.props.accessibilityViewIsModal,true);
  assert.equal(tree.props.children[0],contents);assert.equal(typeof contents.type,'function');
  listener('active');assert.equal(cover(),null);cleanups[0]();assert.equal(removed,true);
});
