import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './drizzle-schema';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

const DATABASE_NAME = 'kopiika.db';

let drizzleDb: BaseSQLiteDatabase<'sync', unknown, typeof schema> | null = null;

export default function getExpoDb(SCHEMA_SQL: string) {
	if (drizzleDb) {
		return drizzleDb;
	}

	const expoDb = openDatabaseSync(DATABASE_NAME, {
		enableChangeListener: true,
	});
	expoDb.execSync(SCHEMA_SQL);
	drizzleDb = drizzle(expoDb, { schema });
	return drizzleDb;
}

export function resetDb() {
	drizzleDb = null;
}
