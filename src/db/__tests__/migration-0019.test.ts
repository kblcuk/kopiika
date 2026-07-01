/**
 * KII-123: Migration 0019 invariants — normalize recurrence exclusions.
 *
 * Two behaviours this test pins down:
 *   1. Existing JSON-blob exclusions on `recurrence_templates.exclusions` are
 *      backfilled into the new `recurrence_exclusions(template_id, timestamp)`
 *      table — one row per timestamp.
 *   2. The legacy column is dropped from `recurrence_templates`, leaving the
 *      new table as the single source of truth.
 *
 * We bypass drizzle's migrator and replay the SQL files directly against a
 * fresh `bun:sqlite` connection so we can seed pre-0019 data shaped like the
 * old schema.
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

describe('migration 0019: recurrence_exclusions_table (KII-123)', () => {
	test('backfills JSON exclusions into the normalized table, one row per timestamp', () => {
		const db = openWithMigrationsUpTo('0019');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e2', 'category', 'Groceries', 'EUR', 0, 1, 0)`);
		// Three templates: one with exclusions, one with NULL, one with the
		// empty JSON array. Backfill must produce rows only for the first.
		db.run(`INSERT INTO recurrence_templates
			(id, from_entity_id, to_entity_id, amount, currency, rule, start_date, horizon, exclusions, created_at)
			VALUES ('tpl-1', 'e1', 'e2', 50, 'EUR', '{"type":"monthly"}', 1700000000000, 30, '[1000,2000,3000]', 1700000000000)`);
		db.run(`INSERT INTO recurrence_templates
			(id, from_entity_id, to_entity_id, amount, currency, rule, start_date, horizon, exclusions, created_at)
			VALUES ('tpl-2', 'e1', 'e2', 25, 'EUR', '{"type":"weekly"}', 1700000000000, 30, NULL, 1700000000000)`);
		db.run(`INSERT INTO recurrence_templates
			(id, from_entity_id, to_entity_id, amount, currency, rule, start_date, horizon, exclusions, created_at)
			VALUES ('tpl-3', 'e1', 'e2', 10, 'EUR', '{"type":"daily"}', 1700000000000, 30, '[]', 1700000000000)`);

		applyMigration(db, '0019_recurrence_exclusions_table.sql');

		const rows = db
			.query<{ template_id: string; timestamp: number }, []>(
				`SELECT template_id, timestamp FROM recurrence_exclusions ORDER BY template_id, timestamp`
			)
			.all();
		expect(rows).toEqual([
			{ template_id: 'tpl-1', timestamp: 1000 },
			{ template_id: 'tpl-1', timestamp: 2000 },
			{ template_id: 'tpl-1', timestamp: 3000 },
		]);
	});

	test('drops the legacy `exclusions` column from `recurrence_templates`', () => {
		const db = openWithMigrationsUpTo('zzz_never'); // apply all
		const cols = db
			.query<{ name: string }, []>(
				`SELECT name FROM pragma_table_info('recurrence_templates')`
			)
			.all();
		expect(cols.map((c) => c.name)).not.toContain('exclusions');
	});

	test('composite PK rejects duplicate (template_id, timestamp) inserts (set-union semantics)', () => {
		const db = openWithMigrationsUpTo('zzz_never');
		db.run(`INSERT INTO entities (id, type, name, currency, row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, row, position)
			VALUES ('e2', 'category', 'Groceries', 'EUR', 1, 0)`);
		db.run(`INSERT INTO recurrence_templates
			(id, from_entity_id, to_entity_id, amount_minor, currency, rule, start_date, created_at)
			VALUES ('tpl', 'e1', 'e2', 5000, 'EUR', '{"type":"monthly"}', 1700000000000, 1700000000000)`);

		db.run(`INSERT INTO recurrence_exclusions (template_id, timestamp) VALUES ('tpl', 1000)`);
		// INSERT OR IGNORE on the composite PK is the API surface the app uses;
		// here we verify the underlying constraint rejects a plain INSERT.
		expect(() =>
			db.run(
				`INSERT INTO recurrence_exclusions (template_id, timestamp) VALUES ('tpl', 1000)`
			)
		).toThrow(/UNIQUE|PRIMARY KEY/i);
		const rows = db
			.query<{ count: number }, []>(`SELECT COUNT(*) as count FROM recurrence_exclusions`)
			.all();
		expect(rows[0]?.count).toBe(1);
	});

	test('hard-deleting a template cascades to its exclusions', () => {
		const db = openWithMigrationsUpTo('zzz_never');
		db.run('PRAGMA foreign_keys = ON');
		db.run(`INSERT INTO entities (id, type, name, currency, row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, row, position)
			VALUES ('e2', 'category', 'Groceries', 'EUR', 1, 0)`);
		db.run(`INSERT INTO recurrence_templates
			(id, from_entity_id, to_entity_id, amount_minor, currency, rule, start_date, created_at)
			VALUES ('tpl', 'e1', 'e2', 5000, 'EUR', '{"type":"monthly"}', 1700000000000, 1700000000000)`);
		db.run(`INSERT INTO recurrence_exclusions (template_id, timestamp) VALUES ('tpl', 1000)`);
		db.run(`INSERT INTO recurrence_exclusions (template_id, timestamp) VALUES ('tpl', 2000)`);

		db.run(`DELETE FROM recurrence_templates WHERE id = 'tpl'`);

		const remaining = db
			.query<{ count: number }, []>(`SELECT COUNT(*) as count FROM recurrence_exclusions`)
			.all();
		expect(remaining[0]?.count).toBe(0);
	});
});
