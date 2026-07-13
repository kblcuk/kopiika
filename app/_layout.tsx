import '@/src/global.css';
import 'react-native-reanimated';

import {
	Lexend_400Regular,
	Lexend_500Medium,
	Lexend_600SemiBold,
	Lexend_700Bold,
	useFonts,
} from '@expo-google-fonts/lexend';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { WhatsNewModal } from '@/src/components';
import { colors } from '@/src/theme/colors';
import { getLastSeenVersion, setLastSeenVersion } from '@/src/utils/app-prefs';
import { useMigrateOnboarding } from '@/src/hooks/use-migrate-onboarding';
import DatabaseProvider from '@/src/components/database-provider';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import { getRawDb } from '@/src/db/db';

import { requireOptionalNativeModule } from 'expo';

const DevMenuPreferences = requireOptionalNativeModule('DevMenuPreferences');
DevMenuPreferences?.setPreferencesAsync({ showFloatingActionButton: false });

void SplashScreen.preventAutoHideAsync();

// Paper-tone navigation theme. Without it, react-navigation's default white
// background shows through every transient navigator gap during cold start —
// the Stack→tabs→screen mount, and the frame where TabLayout returns null while
// its onboarding gate resolves — flashing white between our LoadingScreen and
// the painted dashboard. Paper makes the whole startup one continuous tone.
const paperTheme = {
	...DefaultTheme,
	colors: { ...DefaultTheme.colors, background: colors.paper.DEFAULT },
};

export const unstable_settings = {
	anchor: '(tabs)',
};

function App() {
	const [showWhatsNew, setShowWhatsNew] = useState(false);

	useDrizzleStudio(getRawDb());

	// App renders only once DatabaseProvider's gate passes (fonts + DB ready),
	// so migration and the what's-new check can run immediately on mount.

	// Show "What's New" modal after app update (skip on fresh install)
	useEffect(() => {
		const version = Constants.expoConfig?.version;
		if (!version) return;

		void (async () => {
			const lastSeen = await getLastSeenVersion();
			if (lastSeen === null) {
				return setLastSeenVersion(version);
			}
			if (lastSeen !== version) setShowWhatsNew(true);
		})();
	}, []);

	// Silently migrate existing users to hasCompletedOnboarding=true
	useMigrateOnboarding(true);

	const handleDismissWhatsNew = () => {
		setShowWhatsNew(false);
		const version = Constants.expoConfig?.version;
		if (version) void setLastSeenVersion(version);
	};

	return (
		<GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.paper.DEFAULT }}>
			<ThemeProvider value={paperTheme}>
				<Stack
					screenOptions={{
						headerShown: false,
						contentStyle: { backgroundColor: colors.paper.DEFAULT },
					}}
				>
					<Stack.Screen name="(tabs)" />
					<Stack.Screen name="onboarding" />
					<Stack.Screen name="help" />
				</Stack>
				<WhatsNewModal visible={showWhatsNew} onClose={handleDismissWhatsNew} />
				<StatusBar style="dark" />
			</ThemeProvider>
		</GestureHandlerRootView>
	);
}

export default function RootLayoutNav() {
	// Load fonts at the root so they hydrate in parallel with the database
	// (DatabaseProvider), rather than serially after it. The provider's gate
	// waits on both before painting content.
	const [fontsLoaded, fontError] = useFonts({
		Lexend_400Regular,
		Lexend_500Medium,
		Lexend_600SemiBold,
		Lexend_700Bold,
	});

	// Treat a font-load failure as "ready" so a corrupt/renamed asset can't
	// strand the app on the LoadingScreen forever — the OS falls back to a
	// system font, and this keeps the DB error screen reachable.
	const fontsReady = fontsLoaded || fontError !== null;

	return (
		<KeyboardProvider>
			<DatabaseProvider fontsLoaded={fontsReady}>
				<App />
			</DatabaseProvider>
		</KeyboardProvider>
	);
}
