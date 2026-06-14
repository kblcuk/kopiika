/**
 * KII-136: Migration 0021 — drop legacy materialized FUTURE recurrence
 * occurrences.
 *
 * Before de-materialization, future recurring occurrences were stored as real
 * `transactions` rows (series_id set, is_confirmed = 0, timestamp > now). They
 * are now derived on demand, so the migration deletes the lingering phantom
 * future rows so they don't double-count against derived occurrences.
 *
 * The migration must delete ONLY unconfirmed future *series* rows, preserving:
 *   - past-due unconfirmed series rows (real history awaiting confirmation),
 *   - confirmed series rows (real history),
 *   - future-dated one-off transactions (series_id IS NULL).
 *
 * Pattern follows `migration-0020.test.ts`: bypass drizzle's migrator and
 * replay the SQL files directly against a fresh `bun:sqlite` connection so we
 * can observe pre/post state.
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

const DAY = 86_400_000;

describe('migration 0021: cleanup_legacy_future_occurrences (KII-136)', () => {
	test('deletes only unconfirmed future series rows, preserving real history and one-offs', () => {
		const db = openWithMigrationsUpTo('0021');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e2', 'category', 'Food', 'EUR', 0, 0, 1)`);

		const now = Date.now();
		const future = now + 5 * DAY;
		const past = now - 5 * DAY;
		const older = now - 6 * DAY;

		const insert = (id: string, ts: number, confirmed: 0 | 1, seriesId: string | null) =>
			db.run(
				`INSERT INTO transactions
					(id, from_entity_id, to_entity_id, amount_minor, currency, timestamp, series_id, is_confirmed)
				 VALUES (?, 'e1', 'e2', 100, 'EUR', ?, ?, ?)`,
				[id, ts, seriesId, confirmed]
			);

		insert('phantom-future', future, 0, 's1'); // legacy future phantom → DELETE
		insert('pastdue-series', past, 0, 's1'); // real, awaiting confirmation → KEEP
		insert('confirmed-series', older, 1, 's1'); // real history → KEEP
		insert('future-oneoff', future, 0, null); // future one-off (no series) → KEEP

		applyMigration(db, '0021_cleanup_legacy_future_occurrences.sql');

		const ids = db
			.query<{ id: string }, []>('SELECT id FROM transactions ORDER BY id')
			.all()
			.map((r) => r.id);

		expect(ids).not.toContain('phantom-future');
		expect(ids).toContain('pastdue-series');
		expect(ids).toContain('confirmed-series');
		expect(ids).toContain('future-oneoff');
	});

	test('is a no-op on a database with no phantom future rows', () => {
		const db = openWithMigrationsUpTo('0021');
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e1', 'account', 'Cash', 'EUR', 0, 0, 0)`);
		db.run(`INSERT INTO entities (id, type, name, currency, "order", row, position)
			VALUES ('e2', 'category', 'Food', 'EUR', 0, 0, 1)`);
		db.run(
			`INSERT INTO transactions
				(id, from_entity_id, to_entity_id, amount_minor, currency, timestamp, series_id, is_confirmed)
			 VALUES ('keep', 'e1', 'e2', 100, 'EUR', ?, 's1', 1)`,
			[Date.now() - DAY]
		);

		applyMigration(db, '0021_cleanup_legacy_future_occurrences.sql');

		const count = db.query<{ c: number }, []>('SELECT COUNT(*) AS c FROM transactions').get();
		expect(count?.c).toBe(1);
	});
});
