const { withEntitlementsPlist } = require('expo/config-plugins');

// This app schedules local reminders; it does not register an APNs push token.
// APNs is not available to Personal Teams and is unnecessary for local reminders.
module.exports = config => withEntitlementsPlist(config, mod => {
  delete mod.modResults['aps-environment'];
  return mod;
});
