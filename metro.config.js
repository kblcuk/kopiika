const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Add .sql to source extensions for Drizzle migration files
config.resolver.sourceExts = [...config.resolver.sourceExts, 'sql'];

module.exports = withNativeWind(config, { input: './src/global.css' });
