const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

function service(fetch, DateImpl = Date) {
  const code = ts.transpileModule(
    fs.readFileSync('src/services/GoogleHealthService.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, fetch, URL, URLSearchParams, Date: DateImpl, console,
    require: name => {
      // Exercise the retained parser with synthetic responses; production transport stays blocked.
      if (name === './OfflinePolicy') return {offlineFetch:fetch,blockExternalService:()=>{throw Error('External services disabled');}};
      if (name === 'expo-web-browser') return { maybeCompleteAuthSession() {} };
      if (name === 'react-native') return { Platform: { OS: 'ios', select: values => values.ios } };
      if (name === './GoogleOAuth') return { GOOGLE_IOS_CLIENT_ID: 'test' };
      throw Error('Unexpected import: ' + name);
    },
  });
  return exports.GoogleHealthService;
}

test('Google Health reads all pages before calculating steps', async () => {
  const urls = [];
  const fetch = async url => {
    const parsed = new URL(url);
    urls.push(parsed);
    const isSteps = parsed.pathname.endsWith('/steps/dataPoints:reconcile');
    const second = parsed.searchParams.get('pageToken') === 'next-steps';
    return {
      ok: true,
      json: async () => isSteps
        ? second
          ? { dataPoints: [{ steps: { count: '3' } }] }
          : { dataPoints: [{ steps: { count: '2' } }], nextPageToken: 'next-steps' }
        : { dataPoints: [] },
    };
  };
  const result = await service(fetch).fetchFitnessData('test-token');
  assert.equal(result.steps, 5);
  assert.equal(urls.filter(url => url.pathname.endsWith('/steps/dataPoints:reconcile')).length, 2);
  assert.equal(urls.find(url => url.searchParams.has('pageToken')).searchParams.get('pageToken'), 'next-steps');
});

test('Google Health reports request failures instead of saving partial zero readings', async () => {
  const fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(service(fetch).fetchFitnessData('test-token'), /Google Health steps request failed \(HTTP 503\)/);
});

test('Google Health uses the next calendar date across daylight saving time', async () => {
  const priorTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const fixed = '2026-11-01T04:30:00Z'; // 00:30 local, before the fall-back transition.
    class FixedDate extends Date {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return Date.parse(fixed); }
    }
    let stepFilter;
    const fetch = async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/steps/dataPoints:reconcile')) {
        stepFilter = parsed.searchParams.get('filter');
      }
      return { ok: true, json: async () => ({ dataPoints: [] }) };
    };
    await service(fetch, FixedDate).fetchFitnessData('test-token');
    assert.match(stepFilter, /civil_start_time >= "2026-11-01"/);
    assert.match(stepFilter, /civil_start_time < "2026-11-02"/);
  } finally {
    if (priorTZ === undefined) delete process.env.TZ;
    else process.env.TZ = priorTZ;
  }
});

test('sampled heart rate is not misreported as resting heart rate', async () => {
  const fetch = async url => ({
    ok: true,
    json: async () => new URL(url).pathname.endsWith('/heart-rate/dataPoints:reconcile')
      ? { dataPoints: [{ heartRate: { beatsPerMinute: '72' } }, { heartRate: { beatsPerMinute: '84' } }] }
      : { dataPoints: [] },
  });
  const result = await service(fetch).fetchFitnessData('test-token');
  assert.equal(result.heartRate, 78);
  assert.equal(result.restingHeartRate, 0);
});
