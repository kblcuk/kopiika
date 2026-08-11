import { describe, expect, test, beforeEach } from 'bun:test';
import type { Entity, Transaction } from '@/src/types';
import { getPeriodRange, getCurrentPeriod } from '@/src/types';
import { useStore } from '../index';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';
import { occurrenceId, toCivilDate } from '@/src/utils/recurrence';

const PERIOD_START = getPeriodRange(getCurrentPeriod()).start;

const entity = (id: string, type: Entity['type']): Entity => ({
	id,
	type,
	name: id,
	currency: 'EUR',
	row: 0,
	position: 0,
});

const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
	id,
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount_minor: 100,
	currency: 'EUR',
	timestamp: PERIOD_START - 86_400_000,
	note: null,
	is_confirmed: true,
	...over,
});

async function seedDb() {
	await db.createEntity(entity('acc-1', 'account'));
	await db.createEntity(entity('cat-1', 'category'));
	await db.createTransaction(tx('old-1', { amount_minor: 300 }));
	await db.createTransaction(tx('old-2', { amount_minor: 200 }));
	await db.createTransaction(
		tx('recent-1', { timestamp: PERIOD_START + 1000, amount_minor: 50 })
	);
	await db.createTransaction(tx('unconf-1', { is_confirmed: false, amount_minor: 70 }));
}

describe('two-phase initialize (KII-144)', () => {
	beforeEach(() => {
		resetDrizzleDb();
		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			balanceSeed: [],
			// Other test files' beforeEach hooks pin currentPeriod to a fixed
			// month (e.g. '2026-01'); the store singleton persists that across
			// files, so it must be reset here or PERIOD_START (computed from the
			// real current period) drifts from the store's period cutoff.
			currentPeriod: getCurrentPeriod(),
			isLoading: false,
			isFullyHydrated: false,
		});
	});

	test('phase 1 opens the gate with partial rows + seed; phase 2 completes with the full table', async () => {
		await seedDb();
		await useStore.getState().initialize();

		// Gate is open on phase-1 data.
		const afterPhase1 = useStore.getState();
		expect(afterPhase1.isLoading).toBe(false);
		expect(afterPhase1.isFullyHydrated).toBe(false);
		expect(afterPhase1.transactions.map((t) => t.id).sort()).toEqual(['recent-1', 'unconf-1']);
		expect(afterPhase1.balanceSeed).toEqual([
			{
				id: '__balance_seed__:acc-1:cat-1:EUR',
				from_entity_id: 'acc-1',
				to_entity_id: 'cat-1',
				amount_minor: 500,
				currency: 'EUR',
				timestamp: PERIOD_START - 1,
				note: null,
				is_confirmed: true,
			},
		]);

		await useStore.getState().whenFullyHydrated();
		const afterPhase2 = useStore.getState();
		expect(afterPhase2.isFullyHydrated).toBe(true);
		expect(afterPhase2.balanceSeed).toEqual([]);
		expect(afterPhase2.transactions.map((t) => t.id).sort()).toEqual([
			'old-1',
			'old-2',
			'recent-1',
			'unconf-1',
		]);
	});

	test('backfill of past-due recurrences runs after phase 2 and does not duplicate pre-period occurrences', async () => {
		await seedDb();
		// A monthly template whose first occurrence is already materialized with a
		// pre-period timestamp and confirmed — invisible to phase 1's row set if it
		// weren't a series row. If backfill regenerated this slot it would collide
		// on the deterministic occurrence id (PK collision).
		const templateId = 'tmpl-1';
		const startDate = PERIOD_START - 40 * 86_400_000;
		await db.createRecurrenceTemplate({
			id: templateId,
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 100,
			currency: 'EUR',
			note: null,
			rule: JSON.stringify({ type: 'monthly' }),
			start_date: startDate,
			end_date: null,
			end_count: null,
			created_at: startDate,
		});
		// Materialized pre-period occurrence, confirmed (user confirmed it long
		// ago). Its id is the deterministic occurrence id backfillRecurrences uses:
		// occurrenceId(templateId, toCivilDate(ts)) for the first due occurrence
		// (the template's start_date, since the rule has no earlier due date).
		await db.createTransaction(
			tx(occurrenceId(templateId, toCivilDate(startDate)), {
				timestamp: startDate,
				series_id: templateId,
				is_confirmed: true,
			})
		);

		await useStore.getState().initialize();
		await useStore.getState().whenFullyHydrated();

		const state = useStore.getState();
		const occurrences = state.transactions.filter((t) => t.series_id === templateId);
		const slots = occurrences.map((t) => t.id).sort();
		// No duplicate ids, and initialize did not throw (PK collision would).
		expect(new Set(slots).size).toBe(slots.length);
	});

	test('replaceAllData marks the store fully hydrated with an empty seed', async () => {
		await seedDb();
		await useStore.getState().initialize();
		await useStore.getState().whenFullyHydrated();
		await useStore
			.getState()
			.replaceAllData(
				[entity('acc-1', 'account'), entity('cat-1', 'category')],
				[],
				[tx('imported-1')],
				[],
				[]
			);
		const state = useStore.getState();
		expect(state.isFullyHydrated).toBe(true);
		expect(state.balanceSeed).toEqual([]);
		expect(state.transactions.map((t) => t.id)).toEqual(['imported-1']);
	});
});
