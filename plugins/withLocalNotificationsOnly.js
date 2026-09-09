const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.developer.healthkit"] = true;
    delete mod.modResults["aps-environment"];
    return mod;
  });
};
