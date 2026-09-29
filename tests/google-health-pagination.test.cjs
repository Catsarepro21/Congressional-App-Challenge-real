const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

test('Google Health reads all pages before calculating steps', async () => {
  const code = ts.transpileModule(
    fs.readFileSync('src/services/GoogleHealthService.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
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
  const exports = {};
  vm.runInNewContext(code, {
    exports, fetch, URL, URLSearchParams, Date, console,
    require: name => {
      if (name === 'expo-web-browser') return { maybeCompleteAuthSession() {} };
      if (name === 'react-native') return { Platform: { OS: 'ios', select: values => values.ios } };
      if (name === './GoogleOAuth') return { GOOGLE_IOS_CLIENT_ID: 'test' };
      throw Error('Unexpected import: ' + name);
    },
  });
  const result = await exports.GoogleHealthService.fetchFitnessData('test-token');
  assert.equal(result.steps, 5);
  assert.equal(urls.filter(url => url.pathname.endsWith('/steps/dataPoints:reconcile')).length, 2);
  assert.equal(urls.find(url => url.searchParams.has('pageToken')).searchParams.get('pageToken'), 'next-steps');
});
