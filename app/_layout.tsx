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
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WhatsNewModal } from '@/src/components';
import { getLastSeenVersion, setLastSeenVersion } from '@/src/utils/app-prefs';
import DatabaseProvider from '@/src/components/database-provider';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import { getRawDb } from '@/src/db/db';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
	anchor: '(tabs)',
};

function App() {
	const [fontsLoaded] = useFonts({
		Lexend_400Regular,
		Lexend_500Medium,
		Lexend_600SemiBold,
		Lexend_700Bold,
	});
	const [showWhatsNew, setShowWhatsNew] = useState(false);

	useDrizzleStudio(getRawDb());

	useEffect(() => {
		if (fontsLoaded) {
			SplashScreen.hideAsync();
		}
	}, [fontsLoaded]);

	// Show "What's New" modal after app update (skip on fresh install)
	useEffect(() => {
		if (!fontsLoaded) return;

		const version = Constants.expoConfig?.version;
		if (!version) return;

		getLastSeenVersion().then((lastSeen) => {
			if (lastSeen === null) {
				setLastSeenVersion(version);
				return;
			}
			if (lastSeen !== version) setShowWhatsNew(true);
		});
	}, [fontsLoaded]);

	if (!fontsLoaded) {
		return null;
	}

	const handleDismissWhatsNew = () => {
		setShowWhatsNew(false);
		const version = Constants.expoConfig?.version;
		if (version) setLastSeenVersion(version);
	};

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Screen name="(tabs)" />
			</Stack>
			<WhatsNewModal visible={showWhatsNew} onClose={handleDismissWhatsNew} />
			<StatusBar style="dark" />
		</GestureHandlerRootView>
	);
}

export default function RootLayoutNav() {
	return (
		<DatabaseProvider>
			<App />
		</DatabaseProvider>
	);
}
