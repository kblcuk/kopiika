import { View, AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from './text';
import { LoadingScreen } from './loading-screen';
import { useEffect, useState } from 'react';
import { getDrizzleDb } from '../db';
import { useStore, getUnconfirmedCount } from '@/src/store';
import { registerBackgroundTask } from '@/src/services/background-task';
import { setupNotificationChannel, updateBadgeCount } from '@/src/services/notifications';
import { getRemindersEnabled } from '@/src/utils/app-prefs';

function runWhenIdle(callback: () => void): () => void {
	const requestIdleCallback = globalThis.requestIdleCallback;
	const cancelIdleCallback = globalThis.cancelIdleCallback;

	if (requestIdleCallback && cancelIdleCallback) {
		const handle = requestIdleCallback(
			() => {
				callback();
			},
			{ timeout: 1500 }
		);

		return () => {
			cancelIdleCallback(handle);
		};
	}

	const handle = setTimeout(callback, 0);
	return () => {
		clearTimeout(handle);
	};
}

export default function DatabaseProvider({
	children,
	fontsLoaded,
}: {
	children: React.ReactNode;
	// Loaded in parallel with DB init (in the root layout). The app isn't ready
	// to paint until BOTH fonts and the store have hydrated, so this gate waits
	// on both and shows a single themed LoadingScreen until then.
	fontsLoaded: boolean;
}) {
	const initialize = useStore((state) => state.initialize);
	const backfillRecurringIfStale = useStore((state) => state.backfillRecurringIfStale);
	const [isReady, setIsReady] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const appReady = isReady && fontsLoaded;

	// Hold the native splash until fonts + DB are both ready, then hand off
	// straight to content — no unstyled intermediate frame. (If the splash has
	// already auto-hidden, the themed LoadingScreen below covers the gap.)
	useEffect(() => {
		if (appReady) void SplashScreen.hideAsync();
	}, [appReady]);

	useEffect(() => {
		let isMounted = true;

		void (async () => {
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
		const cancelIdleWork = runWhenIdle(() => {
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
			cancelIdleWork();
			if (registrationTimeout) {
				clearTimeout(registrationTimeout);
			}
		};
	}, [isReady]);

	// Materialize newly past-due recurrences when the user returns to the app.
	// `initialize` only runs once on cold start, so a long-lived warm process
	// would otherwise never materialize occurrences that fall due while it
	// stays open. The store action self-throttles to once per day.
	useEffect(() => {
		if (!isReady) return;
		const sub = AppState.addEventListener('change', (next) => {
			if (next === 'active') {
				void backfillRecurringIfStale();
			}
		});
		return () => sub.remove();
	}, [isReady, backfillRecurringIfStale]);

	// Check for a startup error before the loading gate: a DB init failure must
	// surface even if fonts never resolve, otherwise the only launch diagnostic
	// would be hidden behind an indefinite spinner.
	if (error) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
				<Text>App startup error: {error}</Text>
			</View>
		);
	}

	if (!appReady) {
		return <LoadingScreen />;
	}

	return <>{children}</>;
}
