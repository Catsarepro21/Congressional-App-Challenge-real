const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, mocks = {}, globals = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports, Date, console, setTimeout, clearTimeout, AbortController, ...globals, require: name => { if(name in mocks) return mocks[name]; if (name === './OfflinePolicy') return load('src/services/OfflinePolicy.ts'); if (name === './RequestControl') return load('src/services/RequestControl.ts'); throw Error(name); }});
 return exports;
}
const daily = load('src/utils/daily.ts');
const timeline = load('src/utils/timeline.ts', {'./daily':daily});
const sleep = load('src/services/SleepAnalysisService.ts');
const workout = load('src/services/WorkoutService.ts');
const sample = (value,start,end) => ({value,startDate:`2026-09-13T${start}:00Z`,endDate:`2026-09-13T${end}:00Z`});
test('sleep unions duplicate samples, preserves unspecified sleep and does not invent missing efficiency', () => {
 const s = sample(4,'01:00','02:00');
 const result = sleep.parseSleepStageSamples([s,s,sample(1,'01:00','03:00'),sample(2,'02:30','03:00')]);
 assert.equal(result.deepMinutes,60); assert.equal(result.unspecifiedMinutes,30);
 assert.equal(result.coreMinutes,0); assert.equal(result.totalSleepMinutes,90);
 assert.equal(result.awakeMinutes,30); assert.equal(sleep.parseSleepStageSamples([]).efficiencyPercent,0);
 const conflict = sleep.parseSleepStageSamples([s,sample(5,'01:00','02:00')]);
 assert.equal(conflict.unspecifiedMinutes,60); assert.equal(conflict.totalSleepMinutes,60);
});
test('missing nights do not create sleep debt', () => {
 assert.equal(sleep.calculateSleepDebt([0,480,0,480]).debtMinutes,0);
 assert.equal(sleep.calculateSleepDebt([]).debtMinutes,0);
});
test('recovery needs actual inputs; a measured zero activity day is valid', () => {
 assert.equal(workout.computeRecoveryScore({}).hasEnoughData,false);
 assert.equal(workout.computeRecoveryScore({sleepMinutes:480,currentRHR:60,baselineRHR:60}).hasEnoughData,false);
 assert.equal(workout.computeRecoveryScore({sleepMinutes:480,currentRHR:60,baselineRHR:60,yesterdayStrainCalories:0}).hasEnoughData,true);
});
test('Today preferences preserve hidden-all and normalize old or duplicate values', () => {
 assert.equal(timeline.normalizeTodayCards().includes('fasting'),false);
 assert.equal(timeline.normalizeTodayCards([]).length,0);
 assert.equal(timeline.normalizeTodayCards(['sleep','sleep','bad']).join(','),'sleep');
});
test('timeline joins actual records, orders times and excludes undated meals', () => {
 const state={loggedItems:[{id:'1',type:'Meal',date:'2026-09-13',timestamp:'12:00 PM',name:'Lunch',value:'500 kcal'},{id:'old',type:'Meal',timestamp:'12:00',name:'Legacy',value:'500 kcal'}],symptomLogs:[],moodLogs:[{id:'m',timestamp:'2026-09-13',rating:6,stressLevel:'Low',feelings:[]}],vitalsLogs:[],doseEvents:[],workouts:[],weeklyHistory:[]};
 const result=timeline.buildTimeline(state); assert.equal(result.length,2); assert.equal(result[0].title,'Lunch'); assert.equal(result[0].time,'12:00'); assert.equal(result[1].time,undefined);
});
test('weekly report groups meals by day and excludes old and undated meals', async () => {
 const report=load('src/services/WeeklyReportService.ts').WeeklyReportService;
 const date=daily.localDate(); const yesterday=new Date(); yesterday.setDate(yesterday.getDate()-1);
 const meal=(id,date,calories)=>({id,type:'Meal',name:'Meal',date,calories,value:`${calories} kcal`,timestamp:'12:00'});
 const result=await report.generateReport([], [meal('a',date,300),meal('b',date,500),meal('c',daily.localDate(yesterday),400),meal('d','2000-01-01',9999),meal('e',undefined,9999)],[],[],{},false);
 assert.equal(result.avgDailyCalories,600); assert.match(result.narrative,/2 days/);
});
test('disabled photo routes never fabricate a nutrition result', async () => {
 const mocks={'./CloudPermissionGuard': {CloudPermissionGuard: {executeWithPermission: async (_details, action) => action()}}, 'expo-file-system/legacy':{readAsStringAsync:async()=> 'image',EncodingType:{Base64:'base64'}}};
 const fv=load('src/services/FoodVisionService.ts',mocks,{fetch:async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({foodName:'Meal',portionEstimate:'1',calories:300,carbs:-1,protein:4,fat:3,fiber:1,sugar:2,sodium:10,confidence:'low'})}]}}]})})}).FoodVisionService;
 await assert.rejects(fv.analyzeImage('file:///burger.jpg','opt-out'),/not available offline/);
 await assert.rejects(fv.analyzeImage('file:///x.jpg','cloud','test-only'),/disabled/);
});
