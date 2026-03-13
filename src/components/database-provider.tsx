import { View, Text, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { getDrizzleDb } from '../db';
import { useStore } from '@/src/store';

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
