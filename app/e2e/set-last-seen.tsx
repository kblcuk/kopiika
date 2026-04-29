import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { setLastSeenVersion } from '@/src/utils/app-prefs';

// Accessible only in E2E builds (built with EXPO_PUBLIC_E2E=true).
// Sets the "last seen version" preference to the given value so that
// on the next launch the What's New modal appears (when the stored version
// differs from the current app version).
//
// Usage: device.openURL({ url: 'kopiika://e2e/set-last-seen?version=0.0.0' })
// Then device.launchApp({ newInstance: true }) → modal will be visible.

export default function E2ESetLastSeenScreen() {
	const { version } = useLocalSearchParams<{ version: string }>();

	useEffect(() => {
		async function run() {
			try {
				await setLastSeenVersion(version ?? '0.0.0');
			} catch (e) {
				console.error('[E2E set-last-seen] error:', e);
			}
			router.replace('/(tabs)');
		}
		void run();
	}, [version]);

	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<Text>Setting last seen version…</Text>
		</View>
	);
}
