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
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useStore } from '@/src/store';
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
	const initialize = useStore((state) => state.initialize);

	useDrizzleStudio(getRawDb());

	// Initialize store from database on app start
	useEffect(() => {
		console.info('Initializing store from database...');
		initialize();
	}, [initialize]);

	useEffect(() => {
		if (fontsLoaded) {
			SplashScreen.hideAsync();
		}
	}, [fontsLoaded]);

	if (!fontsLoaded) {
		return null;
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Screen name="(tabs)" />
				<Stack.Screen name="modal" options={{ presentation: 'modal' }} />
			</Stack>
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
