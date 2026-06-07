/**
 * KII-120: Migration 0020 invariants.
 *
 * The migration converts every monetary REAL column to INTEGER minor units
 * (cents for EUR). This test seeds pre-0020 data with intentionally drifty
 * float amounts, replays the migration, and asserts:
 *
 *   1. Every monetary column's SQLite type is now INTEGER (not REAL).
 *   2. Backfill = `CAST(ROUND(amount * 100) AS INTEGER)`: cleanly absorbs
 *      float drift like `43.21000000001 → 4321` and preserves the sign.
 *   3. All four affected tables (transactions, plans, recurrence_templates,
 *      market_value_snapshots) are migrated together so plan/actual math
 *      stays in a single unit system.
 *   4. Indexes survive the rebuild.
 *   5. Sums computed by SQLite on the new column are EXACT integers — the
 *      whole point of the refactor.
 *
 * Pattern follows `migration-0018.test.ts` / `migration-0019.test.ts`:
 * bypass drizzle's migrator and replay the SQL files directly against a
 * fresh `bun:sqlite` connection so we can observe pre/post state.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';

const drizzleDir = path.resolve('./drizzle');

function applyMigration(db: Database, file: string) {
	const sql = readFileSync(path.join(drizzleDir, file), 'utf8');
	for (const stmt of sql.split('--> statement-breakpoint')) {
		const trimmed = stmt.trim();
		if (trimmed) db.run(trimmed);
	}
}

function openWithMigrationsUpTo(stopBeforeTag: string): Database {
	const db = new Database(':memory:');
	db.run('PRAGMA foreign_keys = ON');
	const files = readdirSync(drizzleDir)
		.filter((f) => f.endsWith('.sql'))
		.sort();
	for (const file of files) {
		if (file.includes(stopBeforeTag)) break;
		applyMigration(db, file);
	}
	return db;
}

interface ColumnInfo {
	cid: number;
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
}

function columnType(db: Database, table: string, column: string): string {
	const cols = db.query<ColumnInfo, []>(`PRAGMA table_info(${table})`).all();
	const col = cols.find((c) => c.name === column);
	if (!col) throw new Error(`Column ${table}.${column} not found`);
	// SQLite returns the case as declared in CREATE TABLE; normalize.
	return col.type.toLowerCase();
}

describe('migration 0020: money_to_minor_units (KII-120)', () => {
	test('every monetary column is INTEGER (not REAL) post-migration', () => {
		const db = openWithMigrationsUpTo('0020');
		applyMigration(db, '0020_money_to_minor_units.sql');

		expect(columnType(db, 'transactions', 'amount_minor')).toBe('integer');
		expect(columnType(db, 'plans', 'planned_amount_minor')).toBe('integer');
		expect(columnType(db, 'recurrence_templates', 'amount_minor')).toBe('integer');
		expect(columnType(db, 'market_value_snapshots', 'amount_minor')).toBe('integer');

		// Old column names should be gone — guards against an accidental
		// half-applied rebuild.
		const txCols = db
			.query<ColumnInfo, []>('PRAGMA table_info(transactions)')
			.all()
			.map((c) => c.name);
		expect(txCols).not.toContain('amount');
		const planCols = db
			.query<ColumnInfo, []>('PRAGMA table_info(plans)')
			.all()
			.map((c) => c.name);
		expect(planCols).not.toContain('planned_amount');
	});

	test('backfill absorbs float drift via ROUND(amount * 100)', () => {
		const db = openWithMigrationsUpTo('0020');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e2', 'category', 'Food', 'EUR', 0, 0, 1)`);

		// Three classic drift sources:
		//   - 43.21 stored cleanly → 4321
		//   - 43.21 + 1e-11 (ulp-level drift from prior arithmetic) → 4321
		//   - 0.1 + 0.2 = 0.30000000000000004 stored as a literal → 30
		db.run(`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
			VALUES ('clean', 'e1', 'e2', 43.21, 'EUR', 1700000000000)`);
		db.run(`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
			VALUES ('drifty', 'e1', 'e2', 43.21000000001, 'EUR', 1700000000001)`);
		db.run(`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
			VALUES ('binary', 'e1', 'e2', 0.30000000000000004, 'EUR', 1700000000002)`);

		applyMigration(db, '0020_money_to_minor_units.sql');

		const rows = db
			.query<{ id: string; amount_minor: number }, []>(
				'SELECT id, amount_minor FROM transactions ORDER BY id'
			)
			.all();
		const byId = Object.fromEntries(rows.map((r) => [r.id, r.amount_minor]));

		expect(byId.clean).toBe(4321);
		expect(byId.drifty).toBe(4321);
		expect(byId.binary).toBe(30);

		// All values are actual JS integers, not floats that happen to look
		// integer-shaped — guards against a regression that drops the CAST.
		for (const row of rows) {
			expect(Number.isInteger(row.amount_minor)).toBe(true);
		}
	});

	test('backfill applies to all four monetary tables together', () => {
		const db = openWithMigrationsUpTo('0020');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e2', 'category', 'Food', 'EUR', 0, 0, 1)`);

		db.run(`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
			VALUES ('tx', 'e1', 'e2', 12.34, 'EUR', 1700000000000)`);
		db.run(`INSERT INTO plans (id, entity_id, period, period_start, planned_amount)
			VALUES ('p', 'e2', 'all-time', '2026-01', 500.00)`);
		db.run(`INSERT INTO recurrence_templates
			(id, from_entity_id, to_entity_id, amount, currency, rule, start_date, horizon, created_at)
			VALUES ('rt', 'e1', 'e2', 99.99, 'EUR', '{"type":"monthly"}', 1700000000000, 30, 1700000000000)`);
		db.run(`INSERT INTO market_value_snapshots (id, entity_id, amount, currency, date)
			VALUES ('mv', 'e1', 1234.56, 'EUR', 1700000000000)`);

		applyMigration(db, '0020_money_to_minor_units.sql');

		const tx = db
			.query<{ amount_minor: number }, []>(
				`SELECT amount_minor FROM transactions WHERE id='tx'`
			)
			.get();
		const pl = db
			.query<{ planned_amount_minor: number }, []>(
				`SELECT planned_amount_minor FROM plans WHERE id='p'`
			)
			.get();
		const rt = db
			.query<{ amount_minor: number }, []>(
				`SELECT amount_minor FROM recurrence_templates WHERE id='rt'`
			)
			.get();
		const mv = db
			.query<{ amount_minor: number }, []>(
				`SELECT amount_minor FROM market_value_snapshots WHERE id='mv'`
			)
			.get();

		expect(tx?.amount_minor).toBe(1234);
		expect(pl?.planned_amount_minor).toBe(50000);
		expect(rt?.amount_minor).toBe(9999);
		expect(mv?.amount_minor).toBe(123456);
	});

	test('SUM over many integer minor units is bit-exact (the bug this migration fixes)', () => {
		const db = openWithMigrationsUpTo('0020');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e2', 'category', 'Food', 'EUR', 0, 0, 1)`);

		// 1000 transactions of 0.1 EUR each. Pre-migration, REAL sum drifts
		// (0.1 is non-representable in IEEE 754 binary). Post-migration, each
		// row is 10 cents and SUM is integer addition.
		for (let i = 0; i < 1000; i++) {
			db.run(
				`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
				 VALUES ('t${i}', 'e1', 'e2', 0.1, 'EUR', ${1700000000000 + i})`
			);
		}

		applyMigration(db, '0020_money_to_minor_units.sql');

		const row = db
			.query<{ total: number }, []>(`SELECT SUM(amount_minor) AS total FROM transactions`)
			.get();
		// Exactly 10 cents × 1000 = 10000 cents (= €100). Pre-migration a REAL
		// SUM would land on 99.9999999999986 or similar.
		expect(row?.total).toBe(10000);
		expect(Number.isInteger(row?.total)).toBe(true);
	});

	test('indexes survive the table rebuild', () => {
		const db = openWithMigrationsUpTo('0020');
		applyMigration(db, '0020_money_to_minor_units.sql');

		const indexes = db
			.query<{ name: string; tbl_name: string }, []>(
				`SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`
			)
			.all();
		const names = new Set(indexes.map((i) => i.name));

		// Every index the schema declares must come back after the rebuild —
		// otherwise queries silently table-scan post-migration.
		expect(names).toContain('idx_transactions_timestamp');
		expect(names).toContain('idx_transactions_from');
		expect(names).toContain('idx_transactions_to');
		expect(names).toContain('idx_transactions_series');
		expect(names).toContain('unq_plans_entity_period');
		expect(names).toContain('idx_recurrence_templates_deleted');
		expect(names).toContain('idx_market_value_snapshots_entity');
	});

	test('FK from recurrence_exclusions to recurrence_templates survives the rebuild', () => {
		const db = openWithMigrationsUpTo('0020');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e2', 'category', 'Food', 'EUR', 0, 0, 1)`);
		db.run(`INSERT INTO recurrence_templates
			(id, from_entity_id, to_entity_id, amount, currency, rule, start_date, horizon, created_at)
			VALUES ('tpl', 'e1', 'e2', 50, 'EUR', '{"type":"monthly"}', 1700000000000, 30, 1700000000000)`);
		db.run(`INSERT INTO recurrence_exclusions (template_id, timestamp) VALUES ('tpl', 1000)`);

		applyMigration(db, '0020_money_to_minor_units.sql');

		// Exclusion row still references the rebuilt template.
		const excl = db
			.query<{ template_id: string; timestamp: number }, []>(
				`SELECT template_id, timestamp FROM recurrence_exclusions WHERE template_id='tpl'`
			)
			.get();
		expect(excl).toEqual({ template_id: 'tpl', timestamp: 1000 });

		// FK enforcement is still ON on the rebuilt table — inserting an
		// exclusion against a non-existent template throws.
		expect(() =>
			db.run(
				`INSERT INTO recurrence_exclusions (template_id, timestamp) VALUES ('ghost', 2000)`
			)
		).toThrow(/FOREIGN KEY/i);
	});

	test('FK from transactions to entities survives the rebuild', () => {
		const db = openWithMigrationsUpTo('0020');
		applyMigration(db, '0020_money_to_minor_units.sql');

		// FK enforcement still active on rebuilt transactions table.
		expect(() =>
			db.run(`INSERT INTO transactions
				(id, from_entity_id, to_entity_id, amount_minor, currency, timestamp)
				VALUES ('tx', 'ghost', 'ghost', 100, 'EUR', 1700000000000)`)
		).toThrow(/FOREIGN KEY/i);
	});

	test('preserves sign on backfill (negative amounts, if any, stay negative)', () => {
		// Defensive: app never stores negative amounts (sign is encoded by
		// from/to direction), but if a buggy historical row exists, the
		// migration shouldn't silently flip its sign.
		const db = openWithMigrationsUpTo('0020');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e2', 'category', 'Food', 'EUR', 0, 0, 1)`);
		db.run(`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
			VALUES ('neg', 'e1', 'e2', -12.34, 'EUR', 1700000000000)`);

		applyMigration(db, '0020_money_to_minor_units.sql');

		const row = db
			.query<{ amount_minor: number }, []>(
				`SELECT amount_minor FROM transactions WHERE id='neg'`
			)
			.get();
		expect(row?.amount_minor).toBe(-1234);
	});
});
