import { describe, expect, test, beforeEach, spyOn } from 'bun:test';
import type { Entity, Transaction } from '@/src/types';
import { getPeriodRange, getCurrentPeriod } from '@/src/types';
import { useStore, _resetBackfillThrottleForTests } from '../index';
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

	test('startup backfill runs against the full table, not phase-1 partial rows, so a detached occurrence is not re-inserted under its own id', async () => {
		await seedDb();
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

		// A DETACHED materialized occurrence (e.g. left behind by a past
		// "delete future" scope edit that cleared series_id): it carries the
		// deterministic occurrence id backfillRecurrences would compute for the
		// template's first due slot (occurrenceId(templateId, civilDate)), but
		// series_id is null. Being confirmed, pre-period, AND series_id: null,
		// it is SEEDABLE (src/store/hydration-seed.ts) — collapsed into
		// balanceSeed and invisible to phase 1's row set. Only the full table
		// (phase 2) contains it.
		//
		// If backfillRecurrences ran against phase-1's partial view, neither
		// guard would see it: the per-series `existingSlots` check filters on
		// `series_id === template.id` (null here, so it's excluded), and the
		// `existingIds` PK backstop only works for rows actually loaded — which
		// this row is not, pre-phase-2. It would materialize a "new" occurrence
		// under the SAME id, and the INSERT would hit the primary key that's
		// already sitting in the (as yet unloaded) DB row — a PK collision.
		const detachedId = occurrenceId(templateId, toCivilDate(startDate));
		await db.createTransaction(
			tx(detachedId, {
				timestamp: startDate,
				series_id: null,
				is_confirmed: true,
				// Distinguishes "the original row survived untouched" from "a
				// freshly-backfilled row landed under the same id" — a fresh
				// backfill row would carry template.amount_minor (100).
				amount_minor: 999,
			})
		);

		const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		let errorCalls: unknown[][] = [];
		let warnCalls: unknown[][] = [];
		try {
			await useStore.getState().initialize();
			await useStore.getState().whenFullyHydrated();
			// Snapshot before restoring: `mockRestore()` clears `.mock.calls`
			// along with the implementation, so it must be read first.
			errorCalls = [...errorSpy.mock.calls];
			warnCalls = [...warnSpy.mock.calls];
		} finally {
			errorSpy.mockRestore();
			warnSpy.mockRestore();
		}

		// completePhase2 swallows failures internally (it must never reject —
		// whenFullyHydrated is awaited by callers that must not crash), so a PK
		// collision would surface as a logged failure, not a thrown rejection.
		const loggedBackfillFailure = [...errorCalls, ...warnCalls].some((args) =>
			args.some((arg) => typeof arg === 'string' && /backfill/i.test(arg))
		);
		expect(loggedBackfillFailure).toBe(false);

		// Exactly the original detached row occupies that slot: not duplicated,
		// and not silently replaced by a freshly-backfilled one.
		const atSlot = useStore.getState().transactions.filter((t) => t.id === detachedId);
		expect(atSlot).toHaveLength(1);
		expect(atSlot[0]).toMatchObject({
			id: detachedId,
			series_id: null,
			amount_minor: 999,
			is_confirmed: true,
		});
	});

	test('a re-initialize immediately clears the prior run isFullyHydrated/whenFullyHydrated, before phase 1 lands', async () => {
		await seedDb();
		await useStore.getState().initialize();
		await useStore.getState().whenFullyHydrated();
		expect(useStore.getState().isFullyHydrated).toBe(true);
		const staleWhenFullyHydrated = useStore.getState().whenFullyHydrated();

		// Calling initialize() runs synchronously up to its first internal
		// `await` (the Promise.all of the phase-1 reads) — so everything before
		// that point, including the isFullyHydrated/fullHydrationPromise reset,
		// has already executed by the time this call expression returns. A
		// caller reading state in this window (e.g. the reset-then-rehydrate
		// flow in replaceAllData callers) must NOT see the PREVIOUS run's
		// "fully hydrated" state and resolved promise.
		const second = useStore.getState().initialize();
		expect(useStore.getState().isFullyHydrated).toBe(false);
		expect(useStore.getState().whenFullyHydrated()).not.toBe(staleWhenFullyHydrated);

		await second;
		await useStore.getState().whenFullyHydrated();
		expect(useStore.getState().isFullyHydrated).toBe(true);
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

describe('phase-2 guards (KII-144)', () => {
	beforeEach(() => {
		resetDrizzleDb();
		_resetBackfillThrottleForTests();
		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			balanceSeed: [],
			currentPeriod: getCurrentPeriod(),
			isLoading: false,
			isFullyHydrated: false,
		});
	});

	test('a mutation landing during the phase-2 read triggers a re-read (no lost rows)', async () => {
		await seedDb();
		const realGetAll = db.getAllTransactions;
		let intercepted = false;
		const spy = spyOn(db, 'getAllTransactions').mockImplementation(async () => {
			const rows = await realGetAll();
			if (!intercepted) {
				intercepted = true;
				// Simulate a user write racing the read: lands after the query
				// resolved but before the swap.
				await useStore.getState().addTransaction(
					tx('mid-flight', {
						timestamp: PERIOD_START + 5000,
					})
				);
			}
			return rows;
		});

		await useStore.getState().initialize();
		await useStore.getState().whenFullyHydrated();
		// Snapshot before restoring: `mockRestore()` clears `.mock.calls` along
		// with the implementation, so it must be read first.
		const callCount = spy.mock.calls.length;
		spy.mockRestore();

		const ids = useStore.getState().transactions.map((t) => t.id);
		expect(ids).toContain('mid-flight');
		expect(callCount).toBe(2); // snapshot mismatch forced a re-read
	});

	test('phase-2 read failure retries once and succeeds', async () => {
		await seedDb();
		const realGetAll = db.getAllTransactions;
		let calls = 0;
		const spy = spyOn(db, 'getAllTransactions').mockImplementation(async () => {
			calls++;
			if (calls === 1) throw new Error('transient read failure');
			return realGetAll();
		});

		await useStore.getState().initialize();
		await useStore.getState().whenFullyHydrated();
		spy.mockRestore();

		expect(useStore.getState().isFullyHydrated).toBe(true);
		expect(calls).toBe(2);
	});

	test('persistent phase-2 failure keeps the painted phase-1 state without throwing', async () => {
		await seedDb();
		const spy = spyOn(db, 'getAllTransactions').mockImplementation(async () => {
			throw new Error('disk on fire');
		});

		await useStore.getState().initialize();
		await useStore.getState().whenFullyHydrated(); // must not reject

		spy.mockRestore();
		const state = useStore.getState();
		expect(state.isFullyHydrated).toBe(false);
		expect(state.transactions.map((t) => t.id).sort()).toEqual(['recent-1', 'unconf-1']);
		expect(state.balanceSeed).toHaveLength(1);
	});

	test('backfillRecurringIfStale no-ops until fully hydrated', async () => {
		// A template that IS due (start date well in the past) with valid
		// entities, so that — absent the guard — backfillRecurrences would
		// actually materialize an occurrence into `transactions`. This is what
		// makes the assertion below meaningful rather than vacuously true: with
		// no due template in scope, "transactions stayed empty" would hold
		// whether or not the guard exists.
		// Entities must exist in the DB (FK-enforced) for the transaction insert
		// below to succeed if the guard fails to stop it; the template itself is
		// only ever read from in-memory state (no FK on `series_id`), so it's
		// injected via setState below, not persisted.
		await db.createEntity(entity('acc-1', 'account'));
		await db.createEntity(entity('cat-1', 'category'));
		const templateId = 'tmpl-guard';
		const startDate = PERIOD_START - 40 * 86_400_000;
		useStore.setState({
			entities: [entity('acc-1', 'account'), entity('cat-1', 'category')],
			recurrenceTemplates: [
				{
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
					exclusions: [],
				},
			],
			transactions: [],
			isFullyHydrated: false,
		});
		const spy = spyOn(db, 'getAllTransactions');
		await useStore.getState().backfillRecurringIfStale();
		expect(useStore.getState().transactions).toEqual([]);
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
