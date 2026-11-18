const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), ...process.argv.slice(2)], {
  env: { ...process.env, EXPO_PUBLIC_WEB_DEMO: '1', EXPO_NO_DOTENV: '1' },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
