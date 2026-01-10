import getPlatformSpecificDb, { resetDb } from './db';

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
	return getPlatformSpecificDb(SCHEMA_SQL);
}

export function resetDrizzleDb(): void {
	// Reset singleton - next call to getDrizzleDb() will recreate
	resetDb();
}
