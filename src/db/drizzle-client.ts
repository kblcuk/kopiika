import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './drizzle-schema';

const DATABASE_NAME = 'kopiika.db';

// Singleton pattern for database instance
let expoDb: ReturnType<typeof openDatabaseSync> | null = null;
let drizzleDb: ReturnType<typeof drizzle> | null = null;

export function getDrizzleDb() {
	if (!drizzleDb) {
		expoDb = openDatabaseSync(DATABASE_NAME, {
			enableChangeListener: true, // For potential live queries later
		});
		drizzleDb = drizzle(expoDb, { schema });
	}
	return drizzleDb;
}

export function getExpoDb() {
	if (!expoDb) {
		expoDb = openDatabaseSync(DATABASE_NAME, {
			enableChangeListener: true,
		});
	}
	return expoDb;
}
