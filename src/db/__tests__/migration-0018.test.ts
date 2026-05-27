/**
 * KII-126: Migration 0018 invariants.
 *
 * Two things this test guards against regressing:
 *   1. Backfilled `updated_at`/`created_at` must NOT exceed migration time
 *      (so a sync cursor based on `MAX(updated_at)` can't be pulled into
 *      the future by a scheduled transaction's `timestamp`).
 *   2. The actual SQLite column default must match the schema snapshot's
 *      `(unixepoch() * 1000)` — not the constant `0` that
 *      `ALTER TABLE ADD COLUMN` would otherwise force. This is the
 *      "safety net" for any insert that omits the column.
 *
 * We bypass the drizzle migrator (which applies all migrations on the
 * cached in-memory DB) and replay the SQL files directly against a fresh
 * `bun:sqlite` connection with FK enforcement enabled. This lets us seed
 * pre-0018 data and observe the rebuild behaviour.
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

describe('migration 0018: add_updated_at (KII-126)', () => {
	test('backfilled updated_at is clamped to migration time (future timestamps do not leak)', () => {
		const db = openWithMigrationsUpTo('0018');

		// Seed: an account to satisfy FKs + two transactions, one far in the
		// future. Without the fix, the backfilled `updated_at` would copy the
		// 2033 timestamp and poison any `MAX(updated_at)` sync cursor.
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
			VALUES ('past', 'e1', 'e1', 10, 'EUR', 1700000000000)`);
		db.run(`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
			VALUES ('future', 'e1', 'e1', 20, 'EUR', 2000000000000)`);

		const before = Date.now();
		applyMigration(db, '0018_add_updated_at.sql');
		const after = Date.now();

		const rows = db
			.query<{ id: string; timestamp: number; created_at: number; updated_at: number }, []>(
				'SELECT id, timestamp, created_at, updated_at FROM transactions ORDER BY id'
			)
			.all();

		for (const row of rows) {
			// Both stamps fall within the migration window — no leak from
			// `timestamp` (past or future).
			expect(row.created_at).toBeGreaterThanOrEqual(before - 2_000);
			expect(row.created_at).toBeLessThanOrEqual(after + 2_000);
			expect(row.updated_at).toBeGreaterThanOrEqual(before - 2_000);
			expect(row.updated_at).toBeLessThanOrEqual(after + 2_000);
		}
		// Defining property: the future-dated row's `updated_at` is NOT its
		// event timestamp. Without the clamp, this would be ~2033.
		const future = rows.find((r) => r.id === 'future')!;
		expect(future.updated_at).toBeLessThan(future.timestamp);
	});

	test('recurrence_templates.updated_at backfills from app-supplied created_at', () => {
		const db = openWithMigrationsUpTo('0018');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		// `created_at` is app-supplied write-time here, so mirroring it into
		// `updated_at` is honest (unlike `transactions.timestamp`).
		db.run(`INSERT INTO recurrence_templates (id, from_entity_id, to_entity_id, amount, currency, rule, start_date, horizon, created_at)
			VALUES ('tpl', 'e1', 'e1', 50, 'EUR', '{"type":"monthly"}', 1700000000000, 30, 1700000000000)`);

		applyMigration(db, '0018_add_updated_at.sql');

		const row = db
			.query<{ created_at: number; updated_at: number }, []>(
				`SELECT created_at, updated_at FROM recurrence_templates WHERE id = 'tpl'`
			)
			.get();
		expect(row?.created_at).toBe(1700000000000);
		expect(row?.updated_at).toBe(1700000000000);
	});

	test('column defaults are the canonical (unixepoch() * 1000), not the constant 0 fallback', () => {
		const db = openWithMigrationsUpTo('zzz_never'); // apply all
		const tables = [
			'entities',
			'plans',
			'transactions',
			'recurrence_templates',
			'market_value_snapshots',
		];
		for (const table of tables) {
			const info = db
				.query<{ name: string; dflt_value: string | null }, [string]>(
					`SELECT name, dflt_value FROM pragma_table_info(?)
					WHERE name IN ('created_at', 'updated_at')`
				)
				.all(table);
			expect(info.length).toBeGreaterThanOrEqual(1);
			for (const col of info) {
				// `recurrence_templates.created_at` is pre-existing app-supplied
				// (no SQL default by design); every other timestamp column must
				// have the canonical default.
				if (table === 'recurrence_templates' && col.name === 'created_at') {
					expect(col.dflt_value).toBeNull();
				} else {
					expect(col.dflt_value).toBe('unixepoch() * 1000');
				}
			}
		}
	});

	test('FK constraints are preserved across table-rebuild', () => {
		const db = openWithMigrationsUpTo('zzz_never');
		db.run('PRAGMA foreign_keys = ON');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		// Inserting a transaction that references a non-existent entity must
		// throw — proves FKs survived the rebuild.
		expect(() =>
			db.run(`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp)
				VALUES ('t1', 'ghost', 'e1', 10, 'EUR', 1700000000000)`)
		).toThrow(/FOREIGN KEY/i);
	});
});
