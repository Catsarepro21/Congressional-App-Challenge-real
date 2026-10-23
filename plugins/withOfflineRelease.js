const {withDangerousMod} = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// Debug retains Metro access. A release APK has no INTERNET permission.
module.exports = config => withDangerousMod(config, ['android', async config => {
  const directory = path.join(config.modRequest.platformProjectRoot, 'app/src/release');
  await fs.mkdir(directory, {recursive:true});
  await fs.writeFile(path.join(directory, 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
</manifest>
`);
  return config;
}]);
