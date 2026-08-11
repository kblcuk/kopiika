import { describe, expect, test } from 'bun:test';
import type { EntityType, Plan, Transaction } from '@/src/types';
import { getPeriodRange } from '@/src/types';
import { getEntitiesWithBalance } from '../index';
import { buildBalanceSeed, isSameEntitiesWithBalance, partitionForPhase1 } from '../hydration-seed';
import { generatePerfFixture, REALISTIC_COUNTS } from '../../../scripts/gen-perf-fixture';

// The fixture's deterministic "now" is 2026-07-12; use its month as the period.
const PERIOD = '2026-07';
const { start: PERIOD_START } = getPeriodRange(PERIOD);
const TYPES: EntityType[] = ['income', 'account', 'category', 'saving'];

function phase1Rows(all: Transaction[]): Transaction[] {
	const { recent, seedGroups } = partitionForPhase1(all, PERIOD_START);
	return [...recent, ...buildBalanceSeed(seedGroups, PERIOD_START)];
}

describe('two-phase hydration derivation equivalence (KII-144)', () => {
	const scenarios = [
		{ name: 'heavy fixture', opts: { years: 2 } },
		{ name: 'realistic fixture', opts: { years: 1, counts: REALISTIC_COUNTS } },
		{ name: 'alt seed', opts: { years: 1, seed: 42 } },
	];

	for (const { name, opts } of scenarios) {
		test(`phase-1 rows + seed derive identical balances to the full array (${name})`, () => {
			const { entities, transactions } = generatePerfFixture(opts);
			// Exercise every bucket: an in-period unconfirmed row, an out-of-period
			// unconfirmed row, a future (upcoming) row, and a series row whose
			// timestamp was edited to before the period (must stay a real row).
			const extra: Transaction[] = [
				{
					id: 'x-unconf-in',
					from_entity_id: 'acc-01',
					to_entity_id: 'cat-01',
					amount_minor: 1111,
					currency: 'EUR',
					timestamp: PERIOD_START + 1000,
					note: null,
					is_confirmed: false,
				},
				{
					id: 'x-unconf-old',
					from_entity_id: 'acc-01',
					to_entity_id: 'cat-02',
					amount_minor: 2222,
					currency: 'EUR',
					timestamp: PERIOD_START - 86_400_000,
					note: null,
					is_confirmed: false,
				},
				{
					id: 'x-future',
					from_entity_id: 'acc-02',
					to_entity_id: 'cat-01',
					amount_minor: 3333,
					currency: 'EUR',
					timestamp: PERIOD_START + 5 * 86_400_000,
					note: null,
					is_confirmed: true,
				},
				{
					id: 'x-series-old',
					from_entity_id: 'acc-02',
					to_entity_id: 'cat-03',
					amount_minor: 4444,
					currency: 'EUR',
					timestamp: PERIOD_START - 3 * 86_400_000,
					note: null,
					series_id: 'tmpl-1',
					is_confirmed: true,
				},
			];
			const all = [...transactions, ...extra];
			const plans: Plan[] = [
				{
					id: 'plan-cat-01',
					entity_id: 'cat-01',
					period: 'all-time',
					period_start: PERIOD,
					planned_amount_minor: 50_000,
				},
			];

			const partial = phase1Rows(all);
			expect(partial.length).toBeLessThan(all.length); // the seed actually compresses

			for (const type of TYPES) {
				const fromPartial = getEntitiesWithBalance(entities, plans, partial, PERIOD, type);
				const fromFull = getEntitiesWithBalance(entities, plans, all, PERIOD, type);
				expect(fromPartial).toEqual(fromFull);
			}
		});
	}

	test('partition keeps unconfirmed, in-period, and series rows real; seeds the rest', () => {
		const rows: Transaction[] = [
			{
				id: 'old-conf',
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount_minor: 100,
				currency: 'EUR',
				timestamp: PERIOD_START - 10,
				note: null,
				is_confirmed: true,
			},
			{
				id: 'old-conf-2',
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount_minor: 250,
				currency: 'EUR',
				timestamp: PERIOD_START - 20,
				note: null,
				is_confirmed: true,
			},
			{
				id: 'old-other-currency',
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount_minor: 70,
				currency: 'USD',
				timestamp: PERIOD_START - 30,
				note: null,
				is_confirmed: true,
			},
			{
				id: 'old-unconf',
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount_minor: 999,
				currency: 'EUR',
				timestamp: PERIOD_START - 40,
				note: null,
				is_confirmed: false,
			},
			{
				id: 'old-series',
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount_minor: 500,
				currency: 'EUR',
				timestamp: PERIOD_START - 50,
				note: null,
				series_id: 's1',
				is_confirmed: true,
			},
			{
				id: 'in-period',
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount_minor: 10,
				currency: 'EUR',
				timestamp: PERIOD_START + 10,
				note: null,
				is_confirmed: true,
			},
		];
		const { recent, seedGroups } = partitionForPhase1(rows, PERIOD_START);
		expect(recent.map((t) => t.id).sort()).toEqual(['in-period', 'old-series', 'old-unconf']);
		expect(seedGroups).toEqual([
			{ from_entity_id: 'a', to_entity_id: 'b', currency: 'EUR', total_minor: 350 },
			{ from_entity_id: 'a', to_entity_id: 'b', currency: 'USD', total_minor: 70 },
		]);
	});

	test('buildBalanceSeed stamps synthetic ids, pre-period timestamp, confirmed', () => {
		const seed = buildBalanceSeed(
			[{ from_entity_id: 'a', to_entity_id: 'b', currency: 'EUR', total_minor: 350 }],
			PERIOD_START
		);
		expect(seed).toEqual([
			{
				id: '__balance_seed__:a:b:EUR',
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount_minor: 350,
				currency: 'EUR',
				timestamp: PERIOD_START - 1,
				note: null,
				is_confirmed: true,
			},
		]);
	});

	test('isSameEntitiesWithBalance: equal values true, any field drift false', () => {
		const { entities, transactions } = generatePerfFixture({ years: 1 });
		const a = getEntitiesWithBalance(entities, [], transactions, PERIOD, 'account');
		const b = getEntitiesWithBalance(entities, [], [...transactions], PERIOD, 'account');
		expect(a).not.toBe(b);
		expect(isSameEntitiesWithBalance(a, b)).toBe(true);
		const drifted = b.map((e, i) => (i === 0 ? { ...e, actual: e.actual + 1 } : e));
		expect(isSameEntitiesWithBalance(a, drifted)).toBe(false);
		const renamed = b.map((e, i) => (i === 0 ? { ...e, name: 'renamed' } : e));
		expect(isSameEntitiesWithBalance(a, renamed)).toBe(false);
		expect(isSameEntitiesWithBalance(a, a.slice(1))).toBe(false);
	});
});
