// Deliberately reports filenames only, never matched credential values.
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
const problems = new Set();
for (const file of files) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  // Existing Android development fixture; a different/release key must fail.
  if (file === 'android/app/debug.keystore' && createHash('sha256').update(fs.readFileSync(file)).digest('hex') === '221e0a3106aa4c3ccc154e0a418b55020b3f9ea6e84f92e8749cd9e2f39f5e58') continue;
  if (/(^|\/)\.env($|\.)/.test(file) && !/\.(example|sample|template)$/.test(file)) problems.add(file);
  if (/\.(p12|pfx|pem|key|mobileprovision|jks|keystore)$/i.test(file)) problems.add(file);
  if (fs.statSync(file).size > 2_000_000) continue;
  const contents = fs.readFileSync(file, 'utf8');
  if (/AIza[0-9A-Za-z_-]{35}/.test(contents) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)) problems.add(file);
}
if (problems.size) {
  console.error('Potential credentials found in: ' + [...problems].join(', '));
  process.exitCode = 1;
} else console.log('Credential file and common secret checks passed. This is not a complete secret audit.');
