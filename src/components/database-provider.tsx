import { View, Text, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { getDrizzleDb } from '../db';

export default function DatabaseProvider({ children }: { children: React.ReactNode }) {
	const [dbInitialized, setDbInitialized] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			try {
				await getDrizzleDb();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to initialize database');
			} finally {
				setDbInitialized(true);
			}
		})();
	}, []);

	if (!dbInitialized) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
				<ActivityIndicator size="large" />
				<Text>Loading database...</Text>
			</View>
		);
	}

	if (error) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
				<Text>Database migration error: {error}</Text>
			</View>
		);
	}

	return <>{children}</>;
}
