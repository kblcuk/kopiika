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
			console.info('Database migrations complete');
		} catch (e) {
			console.error('Migration error:', e);
			throw e;
		}
	}

	// Enable FK enforcement on the connection AFTER migrations.
	// SQLite ignores `PRAGMA foreign_keys` inside a transaction, and drizzle
	// wraps every migration in BEGIN/COMMIT — so setting it inside a migration
	// SQL file is a no-op. The pragma is per-connection and persists for the
	// lifetime of `rawExpoDb`.
	await rawExpoDb.execAsync('PRAGMA foreign_keys = ON');

	return db;
}

export function getRawDb(): SQLiteDatabase | null {
	return rawExpoDb;
}

export function resetDb() {
	// Intentional no-op on native. The export is kept so `resetDrizzleDb`
	// (re-exported from `./db`) keeps the same shape across platforms — tests
	// run against the bun build (`db.ts`) where the real reset lives.
	//
	// Do NOT call this to wipe user data: on device it does nothing, which is
	// exactly how "Reset All Data" silently became a no-op. Bulk wipes go
	// through the `import.replace_all` operation (empty payloads) instead.
}
