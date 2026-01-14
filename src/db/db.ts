import path from 'path';
import * as schema from './drizzle-schema';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { SQLiteDatabase } from 'expo-sqlite';

type DrizzleDb = BaseSQLiteDatabase<'sync', void, typeof schema>;

// Cache the initialization promise to prevent race conditions.
// All concurrent calls will await the same promise.
let dbPromise: Promise<DrizzleDb> | null = null;
let sqlite: Database | null = null;

export default function getBunSqlDb(runMigrations = true): Promise<DrizzleDb> {
	if (!dbPromise) {
		dbPromise = initializeDb(runMigrations);
	}
	return dbPromise;
}

async function initializeDb(runMigrations: boolean): Promise<DrizzleDb> {
	sqlite = new Database(':memory:');
	sqlite.run('PRAGMA foreign_keys = ON;');

	const db = drizzle(sqlite, { schema });
	if (runMigrations) {
		migrate(db, {
			migrationsFolder: path.resolve('./drizzle'),
		});
	}
	return db;
}

export function getRawDb(): SQLiteDatabase | null {
	return sqlite as SQLiteDatabase | null;
}

export function resetDb() {
	dbPromise = null;
}
