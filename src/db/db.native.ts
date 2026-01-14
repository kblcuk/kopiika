import * as schema from './drizzle-schema';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '@/drizzle/migrations';

const DATABASE_NAME = 'kopiika.db';

type DrizzleDb = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
let rawExpoDb: SQLiteDatabase | null = null;

// Cache the initialization promise to prevent race conditions.
// All concurrent calls will await the same promise.
let dbPromise: Promise<DrizzleDb> | null = null;

export default function getDrizzleDb(runMigrations = true): Promise<DrizzleDb> {
	if (!dbPromise) {
		console.info('Initializing new database connection');
		dbPromise = initializeDb(runMigrations);
	}
	return dbPromise;
}

async function initializeDb(runMigrations: boolean): Promise<DrizzleDb> {
	rawExpoDb = openDatabaseSync(DATABASE_NAME, {
		enableChangeListener: true,
	});

	const db = drizzle(rawExpoDb, { schema });

	if (runMigrations) {
		try {
			console.info('Running database migrations');
			await migrate(db, migrations);
			console.info('run successfully');
		} catch (e) {
			console.error('Migration error:', e);
			throw e;
		}
	}

	return db;
}

export function getRawDb(): SQLiteDatabase | null {
	return rawExpoDb;
}

export function resetDb() {
	dbPromise = null;
	rawExpoDb = null;
}
