/**
 * Deterministic perf-fixture generator (KII-124 / KII-144).
 *
 * `generatePerfFixture()` builds an in-memory dataset (entities + transactions)
 * used by the balance-derivation perf guard
 * (src/store/__tests__/entities-with-balance.perf.test.ts) — the fixture is
 * generated at test time, not checked in.
 *
 * Run as a CLI to also write a combined-CSV file (byte-compatible with
 * src/utils/export.ts `buildCombinedCsv`) for manual on-device/simulator
 * testing of large histories via Settings → Import from CSV:
 *
 *   bun run scripts/gen-perf-fixture.ts [years] [outPath]
 *
 * Deterministic (fixed seed + fixed reference "now") so re-runs are identical
 * and the perf guard stays stable. Transaction pairs obey ALLOWED_COMBINATIONS
 * in transaction-validation.ts: income->account, account->category,
 * account->saving, account->account.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Entity, Transaction } from '@/src/types';

export interface PerfFixtureCounts {
	income: number;
	accounts: number;
	categories: number;
	savings: number;
}

export interface PerfFixtureOptions {
	/** Years of daily history to generate (default 5). */
	years?: number;
	/** PRNG seed — vary to get a different-but-deterministic dataset. */
	seed?: number;
	/** Fixed reference "now" (ms). Transactions land in [now - years, now]. */
	now?: number;
	/** Entity counts (default: production 5-year fixture). */
	counts?: PerfFixtureCounts;
}

export interface PerfFixture {
	entities: Entity[];
	transactions: Transaction[];
}

/** Typical-user board (KII-144 round 2): used for the realistic baseline. */
export const REALISTIC_COUNTS: PerfFixtureCounts = {
	income: 2,
	accounts: 4,
	categories: 12,
	savings: 6,
};

const CURRENCY = 'EUR';
const N_ACCOUNTS = 10;
const N_CATEGORIES = 30;
const N_SAVINGS = 20;
const N_INCOME = 4;
const MIN_TX_PER_DAY = 1;
const MAX_TX_PER_DAY = 15;
const DAY_MS = 86_400_000;
const DEFAULT_SEED = 0x9e3779b9;
// 2026-07-12T00:00:00Z — the date the fixture shape was fixed (KII-124).
const DEFAULT_NOW = 1_768_176_000_000;

/** mulberry32 — small deterministic PRNG. */
function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function generatePerfFixture(opts: PerfFixtureOptions = {}): PerfFixture {
	const years = opts.years ?? 5;
	const now = opts.now ?? DEFAULT_NOW;
	const rnd = mulberry32(opts.seed ?? DEFAULT_SEED);
	const randInt = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
	const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;

	const counts = opts.counts ?? {
		income: N_INCOME,
		accounts: N_ACCOUNTS,
		categories: N_CATEGORIES,
		savings: N_SAVINGS,
	};

	const entities: Entity[] = [];
	const add = (id: string, type: Entity['type'], name: string, position: number) => {
		entities.push({
			id,
			type,
			name,
			currency: CURRENCY,
			icon: null,
			color: null,
			row: 0,
			position,
			include_in_total: true,
			is_deleted: false,
			is_default: false,
			is_investment: false,
		});
	};
	for (let i = 1; i <= counts.income; i++)
		add(`inc-${pad(i)}`, 'income', `Income ${pad(i)}`, i - 1);
	for (let i = 1; i <= counts.accounts; i++)
		add(`acc-${pad(i)}`, 'account', `Account ${pad(i)}`, i - 1);
	for (let i = 1; i <= counts.categories; i++)
		add(`cat-${pad(i)}`, 'category', `Category ${pad(i)}`, i - 1);
	for (let i = 1; i <= counts.savings; i++)
		add(`sav-${pad(i)}`, 'saving', `Saving ${pad(i)}`, i - 1);

	const accounts = entities.filter((e) => e.type === 'account').map((e) => e.id);
	const cats = entities.filter((e) => e.type === 'category').map((e) => e.id);
	const savings = entities.filter((e) => e.type === 'saving').map((e) => e.id);
	const incomes = entities.filter((e) => e.type === 'income').map((e) => e.id);

	// Weighted transaction kinds → { from, to, amount } in minor units.
	const kinds: { w: number; make: () => { from: string; to: string; amt: number } }[] = [
		{ w: 72, make: () => ({ from: pick(accounts), to: pick(cats), amt: randInt(100, 20000) }) },
		{
			w: 12,
			make: () => ({ from: pick(accounts), to: pick(savings), amt: randInt(500, 40000) }),
		},
		{
			w: 8,
			make: () => {
				const from = pick(accounts);
				let to = pick(accounts);
				while (to === from) to = pick(accounts);
				return { from, to, amt: randInt(1000, 80000) };
			},
		},
		{
			w: 8,
			make: () => ({ from: pick(incomes), to: pick(accounts), amt: randInt(100000, 500000) }),
		},
	];
	const weightTotal = kinds.reduce((s, k) => s + k.w, 0);
	const pickKind = () => {
		let r = randInt(1, weightTotal);
		for (const k of kinds) {
			r -= k.w;
			if (r <= 0) return k;
		}
		return kinds[0]!;
	};

	const transactions: Transaction[] = [];
	const start = now - Math.round(years * 365.25 * DAY_MS);
	let seq = 0;
	for (let t = start; t <= now; t += DAY_MS) {
		const count = randInt(MIN_TX_PER_DAY, MAX_TX_PER_DAY);
		for (let j = 0; j < count; j++) {
			const { from, to, amt } = pickKind().make();
			seq++;
			transactions.push({
				id: `tx-${String(seq).padStart(7, '0')}`,
				from_entity_id: from,
				to_entity_id: to,
				amount_minor: amt,
				currency: CURRENCY,
				timestamp: Math.min(t + randInt(0, DAY_MS - 1), now),
				note: null,
				series_id: null,
				is_confirmed: true,
			});
		}
	}

	return { entities, transactions };
}

/** Serialize a fixture to the combined-CSV format `parseImportCsv` accepts. */
export function toCombinedCsv({ entities, transactions }: PerfFixture): string {
	const entityLine = (e: Entity) =>
		[
			e.id,
			e.type,
			`"${e.name}"`,
			e.currency,
			'',
			'',
			e.row,
			e.position,
			e.include_in_total !== false,
			e.is_deleted === true,
			e.is_default === true,
			e.is_investment === true,
		].join(',');
	const txLine = (t: Transaction) =>
		[
			t.id,
			t.from_entity_id,
			t.to_entity_id,
			t.amount_minor,
			t.currency,
			t.timestamp,
			'',
			'',
			t.is_confirmed !== false,
		].join(',');

	return [
		'# ENTITIES',
		[
			'id,type,name,currency,icon,color,row,position,include_in_total,is_deleted,is_default,is_investment',
			...entities.map(entityLine),
		].join('\n'),
		'',
		'# PLANS',
		'id,entity_id,period,period_start,planned_amount_minor',
		'',
		'# TRANSACTIONS',
		[
			'id,from_entity_id,to_entity_id,amount_minor,currency,timestamp,note,series_id,is_confirmed',
			...transactions.map(txLine),
		].join('\n'),
		'',
		'# RECURRENCE_TEMPLATES',
		'id,from_entity_id,to_entity_id,amount_minor,currency,note,rule,start_date,end_date,end_count,is_deleted,created_at',
		'',
		'# RECURRENCE_EXCLUSIONS',
		'template_id,timestamp',
		'',
		'# MARKET_VALUE_SNAPSHOTS',
		'id,entity_id,amount_minor,currency,date',
	].join('\n');
}

// CLI: write a CSV for manual import testing. Skipped when imported (tests).
if (import.meta.main) {
	const flagArgs = process.argv.slice(2);
	const realistic = flagArgs.includes('--realistic');
	const positional = flagArgs.filter((a) => a !== '--realistic');
	const years = Number(positional[0] ?? (realistic ? 1 : 5));
	const defaultName = realistic
		? './fixtures/kopiika-realistic-fixture.csv'
		: './fixtures/kopiika-5yr-fixture.csv';
	const out = positional[1] ?? new URL(defaultName, import.meta.url).pathname;
	const fixture = generatePerfFixture({
		years,
		counts: realistic ? REALISTIC_COUNTS : undefined,
	});
	const csv = toCombinedCsv(fixture);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, csv);
	console.info(
		`Wrote ${out}\n` +
			`  entities: ${fixture.entities.length}\n` +
			`  transactions: ${fixture.transactions.length}\n` +
			`  size: ${(csv.length / 1_048_576).toFixed(2)} MiB`
	);
}
