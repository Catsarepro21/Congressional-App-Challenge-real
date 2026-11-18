const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const nativeHealthPackages = new Set(['react-native-health', 'react-native-health-connect']);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && nativeHealthPackages.has(moduleName)) {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
