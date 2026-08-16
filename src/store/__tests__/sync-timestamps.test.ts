/**
 * KII-126: After every mutating store action, in-memory state must reflect
 * the same `created_at`/`updated_at` that DB persisted — otherwise sync,
 * export, or any future debug surface reading from store would see stale
 * or missing metadata until the next rehydrate.
 *
 * These tests poke each store action's optimistic state update and assert
 * the stored row equals what `db.get*` returns.
 */
import { describe, expect, test, beforeEach } from 'bun:test';
import { useStore } from '../index';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';
import type { Entity, MarketValueSnapshot, Plan, Transaction } from '@/src/types';
import { setRemindersEnabled } from '@/src/utils/app-prefs';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const baseEntity = (id: string, overrides: Partial<Entity> = {}): Entity => ({
	id,
	type: 'account',
	name: id,
	currency: 'USD',
	row: 0,
	position: 0,
	...overrides,
});

describe('store state mirrors DB-stamped timestamps (KII-126)', () => {
	beforeEach(async () => {
		// KII-144: drain any phase-2 hydration a PRIOR test left running in the
		// background (this file calls `initialize()` here and again inside
		// 'reorderEntitiesByIds' without awaiting `whenFullyHydrated()`) before
		// wiping the DB/store out from under it — see the longer explanation in
		// two-phase-hydration.test.ts's beforeEach.
		await useStore
			.getState()
			.whenFullyHydrated()
			.catch(() => {});
		resetDrizzleDb();
		await setRemindersEnabled(false);
		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			recurrenceTemplates: [],
			marketValueSnapshots: [],
			isLoading: false,
		});
		await db.createEntity(baseEntity('acct'));
		await db.createEntity(baseEntity('cat', { type: 'category', position: 1 }));
		await useStore.getState().initialize();
	});

	test('addEntity: state row matches DB row (with stamped timestamps)', async () => {
		await useStore.getState().addEntity(baseEntity('new', { position: 2 }));
		const stateRow = useStore.getState().entities.find((e) => e.id === 'new')!;
		const dbRow = await db.getEntityById('new');
		expect(stateRow.created_at).toBeTypeOf('number');
		expect(stateRow.updated_at).toBeTypeOf('number');
		expect(stateRow.created_at).toBe(dbRow!.created_at!);
		expect(stateRow.updated_at).toBe(dbRow!.updated_at!);
	});

	test('updateEntity: state updated_at advances and matches DB', async () => {
		const before = useStore.getState().entities.find((e) => e.id === 'acct')!;
		await sleep(2);
		await useStore.getState().updateEntity({ ...baseEntity('acct'), name: 'Renamed' });
		const after = useStore.getState().entities.find((e) => e.id === 'acct')!;
		const dbRow = await db.getEntityById('acct');
		expect(after.updated_at).toBeGreaterThan(before.updated_at!);
		expect(after.updated_at).toBe(dbRow!.updated_at!);
		expect(after.created_at).toBe(before.created_at!);
	});

	test('reorderEntitiesByIds: every touched row in state matches DB', async () => {
		const before = useStore.getState().entities.find((e) => e.id === 'acct')!;
		await sleep(2);
		await useStore.getState().reorderEntitiesByIds('account', ['acct'], 2);
		// The action only writes if a position would change. Force a change by
		// reordering with a second account.
		await db.createEntity(baseEntity('acct2', { position: 5 }));
		await useStore.getState().initialize();
		await sleep(2);
		await useStore.getState().reorderEntitiesByIds('account', ['acct2', 'acct'], 2);
		const after = useStore.getState().entities.find((e) => e.id === 'acct')!;
		const dbRow = await db.getEntityById('acct');
		expect(after.updated_at).toBeGreaterThan(before.updated_at!);
		expect(after.updated_at).toBe(dbRow!.updated_at!);
	});

	test('setPlan: state row matches DB row', async () => {
		const plan: Plan = {
			id: 'p1',
			entity_id: 'acct',
			period: 'all-time',
			period_start: '2026-01',
			planned_amount_minor: 10000,
		};
		await useStore.getState().setPlan(plan);
		const statePlan = useStore.getState().plans.find((p) => p.id === 'p1')!;
		const dbPlan = await db.getPlanForEntity('acct', '2026-01');
		expect(statePlan.created_at).toBe(dbPlan!.created_at!);
		expect(statePlan.updated_at).toBe(dbPlan!.updated_at!);
	});

	test('setPlan (conflict update): state advances updated_at, preserves created_at', async () => {
		const plan: Plan = {
			id: 'p1',
			entity_id: 'acct',
			period: 'all-time',
			period_start: '2026-01',
			planned_amount_minor: 10000,
		};
		await useStore.getState().setPlan(plan);
		const before = useStore.getState().plans.find((p) => p.id === 'p1')!;
		await sleep(2);
		await useStore.getState().setPlan({ ...plan, id: 'p2', planned_amount_minor: 20000 });
		// Conflict updates by (entity_id, period_start), so the existing plan
		// id stays — match by entity_id + period_start.
		const after = useStore
			.getState()
			.plans.find((p) => p.entity_id === 'acct' && p.period_start === '2026-01')!;
		expect(after.planned_amount_minor).toBe(20000);
		expect(after.updated_at).toBeGreaterThan(before.updated_at!);
		expect(after.created_at).toBe(before.created_at!);
	});

	test('addTransaction: state row matches DB row', async () => {
		const txn: Transaction = {
			id: 't1',
			from_entity_id: 'acct',
			to_entity_id: 'cat',
			amount_minor: 2500,
			currency: 'USD',
			timestamp: Date.now(),
		};
		await useStore.getState().addTransaction(txn);
		const stateTxn = useStore.getState().transactions.find((t) => t.id === 't1')!;
		const dbTxn = (await db.getAllTransactions()).find((t) => t.id === 't1')!;
		expect(stateTxn.created_at).toBe(dbTxn.created_at!);
		expect(stateTxn.updated_at).toBe(dbTxn.updated_at!);
	});

	test('updateTransaction: state advances updated_at to DB value', async () => {
		const txn: Transaction = {
			id: 't1',
			from_entity_id: 'acct',
			to_entity_id: 'cat',
			amount_minor: 2500,
			currency: 'USD',
			timestamp: Date.now(),
		};
		await useStore.getState().addTransaction(txn);
		const before = useStore.getState().transactions.find((t) => t.id === 't1')!;
		await sleep(2);
		await useStore.getState().updateTransaction('t1', { amount_minor: 5000 });
		const after = useStore.getState().transactions.find((t) => t.id === 't1')!;
		const dbTxn = (await db.getAllTransactions()).find((t) => t.id === 't1')!;
		expect(after.amount_minor).toBe(5000);
		expect(after.updated_at).toBeGreaterThan(before.updated_at!);
		expect(after.updated_at).toBe(dbTxn.updated_at!);
		expect(after.created_at).toBe(before.created_at!);
	});

	test('confirmTransaction: state advances updated_at to DB value', async () => {
		const txn: Transaction = {
			id: 't1',
			from_entity_id: 'acct',
			to_entity_id: 'cat',
			amount_minor: 2500,
			currency: 'USD',
			timestamp: Date.now() - 10_000,
			is_confirmed: false,
		};
		await useStore.getState().addTransaction(txn);
		const before = useStore.getState().transactions.find((t) => t.id === 't1')!;
		await sleep(2);
		await useStore.getState().confirmTransaction('t1');
		const after = useStore.getState().transactions.find((t) => t.id === 't1')!;
		const dbTxn = (await db.getAllTransactions()).find((t) => t.id === 't1')!;
		expect(after.is_confirmed).toBe(true);
		expect(after.updated_at).toBeGreaterThan(before.updated_at!);
		expect(after.updated_at).toBe(dbTxn.updated_at!);
	});

	test('setDefaultAccount: state for promoted account matches DB updated_at', async () => {
		const before = useStore.getState().entities.find((e) => e.id === 'acct')!;
		await sleep(2);
		await useStore.getState().setDefaultAccount('acct');
		const after = useStore.getState().entities.find((e) => e.id === 'acct')!;
		const dbRow = await db.getEntityById('acct');
		expect(after.is_default).toBe(true);
		expect(after.updated_at).toBeGreaterThan(before.updated_at!);
		expect(after.updated_at).toBe(dbRow!.updated_at!);
	});

	test('addMarketValueSnapshot: state row matches DB row', async () => {
		const snap: MarketValueSnapshot = {
			id: 's1',
			entity_id: 'acct',
			amount_minor: 100000,
			currency: 'USD',
			date: Date.now(),
		};
		await useStore.getState().addMarketValueSnapshot(snap);
		const stateRow = useStore.getState().marketValueSnapshots.find((s) => s.id === 's1')!;
		const dbRow = await db.getLatestMarketValueSnapshot('acct');
		expect(stateRow.created_at).toBe(dbRow!.created_at!);
		expect(stateRow.updated_at).toBe(dbRow!.updated_at!);
	});

	test('updateMarketValueSnapshot: state advances updated_at to DB value', async () => {
		const snap: MarketValueSnapshot = {
			id: 's1',
			entity_id: 'acct',
			amount_minor: 100000,
			currency: 'USD',
			date: Date.now(),
		};
		await useStore.getState().addMarketValueSnapshot(snap);
		const before = useStore.getState().marketValueSnapshots.find((s) => s.id === 's1')!;
		await sleep(2);
		await useStore.getState().updateMarketValueSnapshot('s1', { amount_minor: 200000 });
		const after = useStore.getState().marketValueSnapshots.find((s) => s.id === 's1')!;
		const dbRow = await db.getLatestMarketValueSnapshot('acct');
		expect(after.amount_minor).toBe(200000);
		expect(after.updated_at).toBeGreaterThan(before.updated_at!);
		expect(after.updated_at).toBe(dbRow!.updated_at!);
		expect(after.created_at).toBe(before.created_at!);
	});
});
