/**
 * KII-146: Migration 0024 — backfill `split_id` on pre-existing split legs.
 *
 * A split was stored as N rows sharing `from_entity_id` + `timestamp` + `note`
 * with pairwise-distinct categories. The backfill reproduces exactly the
 * heuristic `reconcile.ts` used at runtime, so historical data keeps its
 * current behavior once that heuristic is deleted.
 *
 * Pattern follows `migration-0021.test.ts`: replay the SQL files directly
 * against a fresh `bun:sqlite` connection so we can observe pre/post state.
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
		// Prefix, not substring: a later migration whose *name* happens to contain
		// these digits would otherwise stop the replay early and silently.
		if (file.startsWith(stopBeforeTag)) break;
		applyMigration(db, file);
	}
	return db;
}

function seed(db: Database) {
	// Note: unlike migration-0021.test.ts (which stops before 0022 and still
	// has the `order` column), this harness runs past 0022_drop-unused-columns
	// where `order` was dropped from `entities` — so it is omitted here.
	db.run(`INSERT INTO entities (id, type, name, currency, row, position)
		VALUES ('acc', 'account', 'Cash', 'EUR', 0, 0)`);
	db.run(`INSERT INTO entities (id, type, name, currency, row, position)
		VALUES ('groceries', 'category', 'Groceries', 'EUR', 1, 0)`);
	db.run(`INSERT INTO entities (id, type, name, currency, row, position)
		VALUES ('household', 'category', 'Household', 'EUR', 1, 1)`);
	db.run(`INSERT INTO entities (id, type, name, currency, row, position)
		VALUES ('transport', 'category', 'Transport', 'EUR', 1, 2)`);
}

const TS = 1_700_000_000_000;

function insert(
	db: Database,
	id: string,
	to: string,
	amount: number,
	ts: number,
	note: string | null
) {
	db.run(
		`INSERT INTO transactions
			(id, from_entity_id, to_entity_id, amount_minor, currency, timestamp, note, is_confirmed, updated_at)
		 VALUES (?, 'acc', ?, ?, 'EUR', ?, ?, 1, 111)`,
		[id, to, amount, ts, note]
	);
}

function splitIdOf(db: Database, id: string): string | null {
	return (
		db
			.query<{ split_id: string | null }, [string]>(
				'SELECT split_id FROM transactions WHERE id = ?'
			)
			.get(id)?.split_id ?? null
	);
}

describe('migration 0024: backfill_split_id (KII-146)', () => {
	test('stamps one shared id on a genuine split', () => {
		const db = openWithMigrationsUpTo('0024');
		seed(db);
		insert(db, 'leg-a', 'groceries', 3000, TS, 'ATB');
		insert(db, 'leg-b', 'household', 2000, TS, 'ATB');

		applyMigration(db, '0024_backfill-split-id.sql');

		const a = splitIdOf(db, 'leg-a');
		expect(a).not.toBeNull();
		expect(splitIdOf(db, 'leg-b')).toBe(a);
	});

	test('stamps one shared id on a three-leg split', () => {
		// Exercises `COUNT(*) >= 2` above the boundary: every other backfill case
		// here is a 2-leg group, so nothing else pins that the predicate is a
		// minimum rather than an equality.
		const db = openWithMigrationsUpTo('0024');
		seed(db);
		insert(db, 'tri-a', 'groceries', 3000, TS, 'ATB');
		insert(db, 'tri-b', 'household', 2000, TS, 'ATB');
		insert(db, 'tri-c', 'transport', 1000, TS, 'ATB');

		applyMigration(db, '0024_backfill-split-id.sql');

		const a = splitIdOf(db, 'tri-a');
		expect(a).not.toBeNull();
		expect(splitIdOf(db, 'tri-b')).toBe(a);
		expect(splitIdOf(db, 'tri-c')).toBe(a);
	});

	test('skips a three-leg group entirely when any category repeats', () => {
		// `COUNT(DISTINCT to_entity_id) = COUNT(*)` is evaluated per group, not
		// per leg: one repeat disqualifies all three, including the leg whose
		// category is unique. Leaving them unstamped surfaces their totals as
		// `new` — reviewable, never a false positive.
		const db = openWithMigrationsUpTo('0024');
		seed(db);
		insert(db, 'rep-a', 'groceries', 3000, TS, 'ATB');
		insert(db, 'rep-b', 'groceries', 2000, TS, 'ATB');
		insert(db, 'rep-c', 'household', 1000, TS, 'ATB');

		applyMigration(db, '0024_backfill-split-id.sql');

		expect(splitIdOf(db, 'rep-a')).toBeNull();
		expect(splitIdOf(db, 'rep-b')).toBeNull();
		expect(splitIdOf(db, 'rep-c')).toBeNull();
	});

	test('skips a same-category pair — indistinguishable from duplicate charges', () => {
		const db = openWithMigrationsUpTo('0024');
		seed(db);
		insert(db, 'dup-a', 'groceries', 3000, TS, 'Cafe');
		insert(db, 'dup-b', 'groceries', 3000, TS, 'Cafe');

		applyMigration(db, '0024_backfill-split-id.sql');

		expect(splitIdOf(db, 'dup-a')).toBeNull();
		expect(splitIdOf(db, 'dup-b')).toBeNull();
	});

	test('skips a lone transaction', () => {
		const db = openWithMigrationsUpTo('0024');
		seed(db);
		insert(db, 'solo', 'groceries', 3000, TS, 'ATB');

		applyMigration(db, '0024_backfill-split-id.sql');

		expect(splitIdOf(db, 'solo')).toBeNull();
	});

	test('gives two distinct splits distinct ids', () => {
		const db = openWithMigrationsUpTo('0024');
		seed(db);
		insert(db, 's1-a', 'groceries', 3000, TS, 'ATB');
		insert(db, 's1-b', 'household', 2000, TS, 'ATB');
		insert(db, 's2-a', 'groceries', 3000, TS + 3_600_000, 'ATB');
		insert(db, 's2-b', 'household', 2000, TS + 3_600_000, 'ATB');

		applyMigration(db, '0024_backfill-split-id.sql');

		expect(splitIdOf(db, 's1-a')).toBe(splitIdOf(db, 's1-b'));
		expect(splitIdOf(db, 's2-a')).toBe(splitIdOf(db, 's2-b'));
		expect(splitIdOf(db, 's1-a')).not.toBe(splitIdOf(db, 's2-a'));
	});

	test('groups a null note the same as an empty note', () => {
		const db = openWithMigrationsUpTo('0024');
		seed(db);
		insert(db, 'n-a', 'groceries', 3000, TS, null);
		insert(db, 'n-b', 'household', 2000, TS, null);

		applyMigration(db, '0024_backfill-split-id.sql');

		const a = splitIdOf(db, 'n-a');
		expect(a).not.toBeNull();
		expect(splitIdOf(db, 'n-b')).toBe(a);
	});

	test('does not bump updated_at', () => {
		const db = openWithMigrationsUpTo('0024');
		seed(db);
		insert(db, 'leg-a', 'groceries', 3000, TS, 'ATB');
		insert(db, 'leg-b', 'household', 2000, TS, 'ATB');

		applyMigration(db, '0024_backfill-split-id.sql');

		const rows = db
			.query<{ updated_at: number }, []>('SELECT updated_at FROM transactions')
			.all();
		expect(rows.every((r) => r.updated_at === 111)).toBe(true);
	});
});
