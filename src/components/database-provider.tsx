import { View, ActivityIndicator, InteractionManager } from 'react-native';
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

	useEffect(() => {
		if (!isReady) {
			return;
		}

		let cancelled = false;
		let registrationTimeout: ReturnType<typeof setTimeout> | null = null;
		const interactionHandle = InteractionManager.runAfterInteractions(() => {
			registrationTimeout = setTimeout(() => {
				void (async () => {
					try {
						const remindersEnabled = await getRemindersEnabled();
						if (!remindersEnabled || cancelled) {
							return;
						}

						await setupNotificationChannel();
						const count = getUnconfirmedCount(useStore.getState().transactions);
						await updateBadgeCount(count);

						if (cancelled) {
							return;
						}

						await registerBackgroundTask();
					} catch (err) {
						console.warn('Reminder startup error:', err);
					}
				})();
			}, 1000);
		});

		return () => {
			cancelled = true;
			interactionHandle.cancel();
			if (registrationTimeout) {
				clearTimeout(registrationTimeout);
			}
		};
	}, [isReady]);

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
