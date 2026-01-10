import { drizzle as drizzleExpo } from 'drizzle-orm/expo-sqlite';
import { drizzle as drizzleBetterSqlite3 } from 'drizzle-orm/better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import Database from 'better-sqlite3';
import { openDatabaseSync } from 'expo-sqlite';
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

export function getDrizzleDb() {
	if (drizzleDb) {
		return drizzleDb;
	}

	if (isTestEnvironment) {
		// Use better-sqlite3 for tests (works in Node.js)
		const sqlite = new Database(':memory:');
		sqlite.exec(SCHEMA_SQL);
		drizzleDb = drizzleBetterSqlite3(sqlite, { schema });
	} else {
		const expoDb = openDatabaseSync(DATABASE_NAME, {
			enableChangeListener: true,
		});
		expoDb.execSync(SCHEMA_SQL);
		drizzleDb = drizzleExpo(expoDb, { schema });
	}
	return drizzleDb;
}

export function getExpoDb() {
	if (isTestEnvironment) {
		throw new Error('getExpoDb() is not available in test environment');
	}
	return openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
}

export function resetDrizzleDb(): void {
	drizzleDb = null;
	if (isTestEnvironment) {
		// For tests, just reset the singleton and let next call recreate
		return;
	}
	const db = getExpoDb();
	db.execSync(`
			DROP TABLE IF EXISTS transactions;
			DROP TABLE IF EXISTS plans;
			DROP TABLE IF EXISTS entities;
		`);
	db.execSync(SCHEMA_SQL);
	drizzleDb = null;
}
