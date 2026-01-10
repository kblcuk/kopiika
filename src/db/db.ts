import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './drizzle-schema';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

let drizzleDb: BaseSQLiteDatabase<'sync', unknown, typeof schema> | null = null;

export default function getExpoDb(SCHEMA_SQL: string) {
	if (drizzleDb) return drizzleDb;

	const sqlite = new Database(':memory:');
	sqlite.run('PRAGMA foreign_keys = ON;');
	sqlite.run(SCHEMA_SQL);
	drizzleDb = drizzle(sqlite, { schema });
	return drizzleDb;
}

export function resetDb() {
	drizzleDb = null;
}
