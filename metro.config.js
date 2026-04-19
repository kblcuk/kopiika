const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Add .sql to source extensions for Drizzle migration files
config.resolver.sourceExts = [...config.resolver.sourceExts, 'sql'];

// Exclude E2E fixture routes from non-E2E builds so they don't end up in the production bundle
if (process.env.EXPO_PUBLIC_E2E !== 'true') {
	config.resolver.blockList = [...(config.resolver.blockList ?? []), /\/app\/e2e\//];
}

module.exports = withNativeWind(config, { input: './src/global.css' });
