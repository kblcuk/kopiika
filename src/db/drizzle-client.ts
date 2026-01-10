import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './drizzle-schema';

const DATABASE_NAME = 'kopiika.db';

// Environment detection - use better-sqlite3 in tests, expo-sqlite in production
const isTestEnvironment =
	process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// Singleton pattern for database instance
// Both BetterSQLite3Database and ExpoSQLiteDatabase extend BaseSQLiteDatabase
let drizzleDb: BaseSQLiteDatabase<'sync', unknown, typeof schema> | null = null;

const SCHEMA_SQL = `
	-- Entities table
	CREATE TABLE IF NOT EXISTS entities (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL CHECK(type IN ('income', 'account', 'category', 'saving')),
		name TEXT NOT NULL,
		currency TEXT NOT NULL,
		icon TEXT,
		color TEXT,
		owner_id TEXT,
		"order" INTEGER NOT NULL
	);

	-- Plans table
	CREATE TABLE IF NOT EXISTS plans (
		id TEXT PRIMARY KEY,
		entity_id TEXT NOT NULL,
		period TEXT NOT NULL,
		period_start TEXT NOT NULL,
		planned_amount REAL NOT NULL,
		FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
	);

	-- Transactions table
	CREATE TABLE IF NOT EXISTS transactions (
		id TEXT PRIMARY KEY,
		from_entity_id TEXT NOT NULL,
		to_entity_id TEXT NOT NULL,
		amount REAL NOT NULL,
		currency TEXT NOT NULL,
		timestamp INTEGER NOT NULL,
		note TEXT,
		FOREIGN KEY(from_entity_id) REFERENCES entities(id),
		FOREIGN KEY(to_entity_id) REFERENCES entities(id)
	);

	-- Indices for performance
	CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
	CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_entity_id);
	CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_entity_id);
	CREATE INDEX IF NOT EXISTS idx_plans_entity_period ON plans(entity_id, period_start);
	CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
`;

export async function getDrizzleDb() {
	if (drizzleDb) {
		return drizzleDb;
	}

	if (isTestEnvironment) {
		// Dynamic import to avoid loading Node.js modules in React Native
		const Database = (await import('better-sqlite3')).default;
		const { drizzle } = await import('drizzle-orm/better-sqlite3');

		const sqlite = new Database(':memory:');
		sqlite.exec(SCHEMA_SQL);
		drizzleDb = drizzle(sqlite, { schema });
	} else {
		// Dynamic import to avoid bundling Expo modules in tests
		const { openDatabaseSync } = await import('expo-sqlite');
		const { drizzle } = await import('drizzle-orm/expo-sqlite');

		const expoDb = openDatabaseSync(DATABASE_NAME, {
			enableChangeListener: true,
		});
		expoDb.execSync(SCHEMA_SQL);
		drizzleDb = drizzle(expoDb, { schema });
	}
	return drizzleDb;
}

export async function getExpoDb() {
	if (isTestEnvironment) {
		throw new Error('getExpoDb() is not available in test environment');
	}
	const { openDatabaseSync } = await import('expo-sqlite');
	return openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
}

export function resetDrizzleDb(): void {
	// Reset singleton - next call to getDrizzleDb() will recreate
	drizzleDb = null;
}
