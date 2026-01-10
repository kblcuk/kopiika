import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../drizzle-schema';
import type * as SQLite from 'expo-sqlite';

/**
 * Mock implementation of expo-sqlite's SQLiteDatabase using better-sqlite3
 * This allows us to run database tests in-memory without expo-sqlite dependency
 */
class MockSQLiteDatabase {
	private db: Database.Database;

	constructor() {
		// Create in-memory database
		this.db = new Database(':memory:');
	}

	async getAllAsync<T>(sql: string, params?: any[]): Promise<T[]> {
		const stmt = this.db.prepare(sql);
		const result = params ? stmt.all(...params) : stmt.all();
		return result as T[];
	}

	async getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null> {
		const stmt = this.db.prepare(sql);
		const result = params ? stmt.get(...params) : stmt.get();
		return (result as T) ?? null;
	}

	async runAsync(sql: string, params?: any[]): Promise<void> {
		const stmt = this.db.prepare(sql);
		if (params) {
			stmt.run(...params);
		} else {
			stmt.run();
		}
	}

	async execAsync(sql: string): Promise<void> {
		this.db.exec(sql);
	}

	close(): void {
		this.db.close();
	}
}

/**
 * Create a fresh test database with schema initialized
 */
export async function createTestDatabase(): Promise<SQLite.SQLiteDatabase> {
	const mockDb = new MockSQLiteDatabase();

	// Initialize schema (copied from schema.ts)
	await mockDb.execAsync(`
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
	`);

	return mockDb as unknown as SQLite.SQLiteDatabase;
}

/**
 * Create a Drizzle test database using better-sqlite3
 * Usage in tests:
 *
 * jest.mock('@/src/db/drizzle-client');
 *
 * beforeEach(() => {
 *   testDb = createTestDrizzleDb();
 *   jest.mocked(getDrizzleDb).mockReturnValue(testDb);
 * });
 */
export function createTestDrizzleDb(): BetterSQLite3Database<typeof schema> {
	const sqlite = new Database(':memory:');

	// Initialize schema using raw SQL (matching production behavior)
	sqlite.exec(`
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
	`);

	return drizzle(sqlite, { schema });
}

/**
 * Mock the getDatabase function from schema.ts
 * Usage in tests:
 *
 * jest.mock('@/src/db/schema');
 *
 * beforeEach(async () => {
 *   testDb = await createTestDatabase();
 *   jest.mocked(getDatabase).mockResolvedValue(testDb);
 * });
 */
