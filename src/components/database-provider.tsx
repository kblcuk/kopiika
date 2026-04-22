import { View, ActivityIndicator } from 'react-native';
import { Text } from './text';
import { useEffect, useState } from 'react';
import { getDrizzleDb } from '../db';
import { useStore, getUnconfirmedCount } from '@/src/store';
import { registerBackgroundTask } from '@/src/services/background-task';
import { setupNotificationChannel, updateBadgeCount } from '@/src/services/notifications';
import { getRemindersEnabled } from '@/src/utils/app-prefs';

export default function DatabaseProvider({ children }: { children: React.ReactNode }) {
	const initialize = useStore((state) => state.initialize);
	const [isReady, setIsReady] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;

		(async () => {
			try {
				await getDrizzleDb();
				await initialize();

				// Set up notifications if enabled
				const remindersEnabled = await getRemindersEnabled();
				if (remindersEnabled) {
					await setupNotificationChannel();
					await registerBackgroundTask();
					// Sync app icon badge with current unconfirmed count
					const count = getUnconfirmedCount(useStore.getState().transactions);
					await updateBadgeCount(count);
				}
			} catch (err) {
				console.error('App startup error:', err);
				if (isMounted) {
					setError(err instanceof Error ? err.message : 'Failed to initialize app');
				}
			} finally {
				if (isMounted) {
					setIsReady(true);
				}
			}
		})();

		return () => {
			isMounted = false;
		};
	}, [initialize]);

	if (!isReady) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
				<ActivityIndicator size="large" />
				<Text>Loading app...</Text>
			</View>
		);
	}

	if (error) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
				<Text>App startup error: {error}</Text>
			</View>
		);
	}

	return <>{children}</>;
}
