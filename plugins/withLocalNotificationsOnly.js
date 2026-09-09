const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (mod) => {
    // Explicitly add HealthKit to the generated iOS entitlements.
    mod.modResults["com.apple.developer.healthkit"] = true;

    // The app uses local notifications and does not need APNs.
    delete mod.modResults["aps-environment"];

    return mod;
  });
};
