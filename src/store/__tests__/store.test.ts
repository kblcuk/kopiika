import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { Entity, Plan, Transaction, MarketValueSnapshot } from '@/src/types';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import { useStore, getEntitiesWithBalance, _resetBackfillThrottleForTests } from '../index';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import * as notifications from '@/src/services/notifications';
import { deriveVirtualOccurrences } from '@/src/utils/recurrence-derivation';
import { toCivilDate } from '@/src/utils/recurrence';
import { formatAmount } from '@/src/utils/format';
import {
	getHasRequestedPermission,
	getScheduledReminderKey,
	setHasRequestedPermission,
	setLastBackgroundNotificationKey,
	setRemindersEnabled,
	setScheduledReminderKey,
} from '@/src/utils/app-prefs';

describe('Store Data Integrity', () => {
	beforeEach(async () => {
		// KII-144: drain any phase-2 hydration left running in the background by
		// the PREVIOUS test. Most tests here call `initialize()` without awaiting
		// `whenFullyHydrated()` (they only care about phase-1 state), so
		// `completePhase2` keeps running after the test body returns. Phase 2 now
		// pages the read with real idle/frame yields (KII-144), so it can still be
		// in flight when the next test's `resetDrizzleDb()` below wipes the
		// database out from under it — its eventual `set({ transactions: ... })`
		// would then land mid-test and corrupt unrelated state. Awaiting it here
		// first (against the PREVIOUS test's still-live DB) lets it finish
		// harmlessly before anything is reset.
		await useStore
			.getState()
			.whenFullyHydrated()
			.catch(() => {});

		// Reset database and store state before each test
		resetDrizzleDb();
		await setRemindersEnabled(false);
		await setHasRequestedPermission(false);
		await setLastBackgroundNotificationKey(null);

		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			balanceSeed: [],
			isFullyHydrated: false,
			currentPeriod: '2026-01',
			isLoading: false,
			draggedEntity: null,
			incomeVisible: false,
		});
	});

	describe('initialize', () => {
		test('should filter out orphaned plans during initialization', async () => {
			// Setup: Create entities, then manually delete one after creating its plan
			const entities: Entity[] = [
				{
					id: 'entity-1',
					type: 'account',
					name: 'Checking',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'entity-temp',
					type: 'category',
					name: 'Temp',
					currency: 'USD',
					row: 0,
					position: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount_minor: 100000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-temp',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount_minor: 50000,
				},
			];

			// Add data to database
			for (const entity of entities) {
				await db.createEntity(entity);
			}
			for (const plan of plans) {
				await db.upsertPlan(plan);
			}

			// Delete entity-temp (cascade deletes plan-2)
			await db.deleteEntity('entity-temp');

			await useStore.getState().initialize();

			const state = useStore.getState();
			// Should have entity-1 + soft-deleted entity-temp + system entity
			expect(state.entities).toHaveLength(3);
			expect(state.entities.find((e) => e.id === 'entity-temp')?.is_deleted).toBe(true);
			// Should filter out orphaned plan
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0]!.id).toBe('plan-1');
		});

		test('should load all data when no orphaned plans exist', async () => {
			const entities: Entity[] = [
				{
					id: 'entity-1',
					type: 'account',
					name: 'Checking',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'entity-2',
					type: 'category',
					name: 'Groceries',
					currency: 'USD',
					row: 0,
					position: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount_minor: 100000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount_minor: 50000,
				},
			];

			// Add data to database
			for (const entity of entities) {
				await db.createEntity(entity);
			}
			for (const plan of plans) {
				await db.upsertPlan(plan);
			}

			await useStore.getState().initialize();

			const state = useStore.getState();
			// Should have entity-1, entity-2 + system entity
			expect(state.entities).toHaveLength(3);
			expect(state.plans).toHaveLength(2);
			expect(state.transactions).toHaveLength(0);
		});

		test('should deduplicate concurrent initialization calls', async () => {
			const originalInfo = console.info;
			const hydrationLogs: string[] = [];
			console.info = (...args) => {
				hydrationLogs.push(args.join(' '));
			};

			try {
				await Promise.all([
					useStore.getState().initialize(),
					useStore.getState().initialize(),
				]);
			} finally {
				console.info = originalInfo;
			}

			expect(
				hydrationLogs.filter((message) => message === 'Hydrating store from database')
			).toHaveLength(1);
		});
	});

	describe('setPlan', () => {
		test('should prevent setting plan for non-existent entity', async () => {
			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'non-existent-entity',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 100000,
			};

			await useStore.getState().setPlan(plan);

			const state = useStore.getState();
			expect(state.plans).toHaveLength(0);

			// Verify it wasn't written to database
			const dbPlan = await db.getPlanForEntity('non-existent-entity', '2026-01');
			expect(dbPlan).toBeNull();
		});

		test('should allow setting plan for existing entity', async () => {
			const entity: Entity = {
				id: 'entity-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			useStore.setState({ entities: [entity] });
			await db.createEntity(entity);

			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 100000,
			};

			await useStore.getState().setPlan(plan);

			const state = useStore.getState();
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0]).toMatchObject(plan);

			// Verify it was written to database
			const dbPlan = await db.getPlanForEntity('entity-1', '2026-01');
			expect(dbPlan).toMatchObject(plan);
		});

		test('should update existing plan', async () => {
			const entity: Entity = {
				id: 'entity-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 100000,
			};

			useStore.setState({ entities: [entity], plans: [plan] });
			await db.createEntity(entity);
			await db.upsertPlan(plan);

			const updatedPlan: Plan = {
				...plan,
				planned_amount_minor: 200000,
			};

			await useStore.getState().setPlan(updatedPlan);

			const state = useStore.getState();
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0]!.planned_amount_minor).toBe(200000);

			// Verify it was updated in database
			const dbPlan = await db.getPlanForEntity('entity-1', '2026-01');
			expect(dbPlan?.planned_amount_minor).toBe(200000);
		});
	});

	describe('addTransaction', () => {
		test('should reject transaction with non-existent from_entity', async () => {
			useStore.setState({
				entities: [
					{
						id: 'entity-1',
						type: 'account',
						name: 'Checking',
						currency: 'USD',
						row: 0,
						position: 0,
					},
				],
			});

			const transaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'non-existent',
				to_entity_id: 'entity-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await expect(useStore.getState().addTransaction(transaction)).rejects.toMatchObject({
				name: 'TransactionValidationError',
				code: 'MISSING_FROM',
			});

			expect(useStore.getState().transactions).toHaveLength(0);
			expect(await db.getAllTransactions()).toHaveLength(0);
		});

		test('should reject transaction with non-existent to_entity', async () => {
			useStore.setState({
				entities: [
					{
						id: 'entity-1',
						type: 'account',
						name: 'Checking',
						currency: 'USD',
						row: 0,
						position: 0,
					},
				],
			});

			const transaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'entity-1',
				to_entity_id: 'non-existent',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await expect(useStore.getState().addTransaction(transaction)).rejects.toMatchObject({
				name: 'TransactionValidationError',
				code: 'MISSING_TO',
			});

			expect(useStore.getState().transactions).toHaveLength(0);
			expect(await db.getAllTransactions()).toHaveLength(0);
		});

		test('should allow transaction between existing entities', async () => {
			const entities: Entity[] = [
				{
					id: 'entity-1',
					type: 'income',
					name: 'Salary',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'entity-2',
					type: 'account',
					name: 'Checking',
					currency: 'USD',
					row: 0,
					position: 0,
				},
			];

			useStore.setState({ entities });
			for (const entity of entities) {
				await db.createEntity(entity);
			}

			const transaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'entity-1',
				to_entity_id: 'entity-2',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await useStore.getState().addTransaction(transaction);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0]).toMatchObject(transaction);
			expect(state.transactions[0]!.is_confirmed).toBe(true);

			// Verify it was written to database
			const dbTransactions = await db.getAllTransactions();
			expect(dbTransactions).toHaveLength(1);
			expect(dbTransactions[0]).toMatchObject(transaction);
		});
	});

	describe('createTransactionBatch (KII-116 atomicity)', () => {
		const seedSplitEntities = async (): Promise<Entity[]> => {
			const entities: Entity[] = [
				{
					id: 'acct-1',
					type: 'account',
					name: 'Main',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'cat-groceries',
					type: 'category',
					name: 'Groceries',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'cat-fuel',
					type: 'category',
					name: 'Fuel',
					currency: 'USD',
					row: 0,
					position: 1,
				},
			];
			for (const e of entities) await db.createEntity(e);
			useStore.setState({ entities });
			return entities;
		};

		test('persists every row when all pass validation', async () => {
			await seedSplitEntities();

			const ts = Date.now();
			const txns: Transaction[] = [
				{
					id: 'batch-ok-1',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-groceries',
					amount_minor: 1000,
					currency: 'USD',
					timestamp: ts,
				},
				{
					id: 'batch-ok-2',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-fuel',
					amount_minor: 2000,
					currency: 'USD',
					timestamp: ts,
				},
				{
					id: 'batch-ok-3',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-groceries',
					amount_minor: 3000,
					currency: 'USD',
					timestamp: ts,
				},
			];

			await useStore.getState().createTransactionBatch(txns);

			const ids = new Set((await db.getAllTransactions()).map((t) => t.id));
			expect(ids.has('batch-ok-1')).toBe(true);
			expect(ids.has('batch-ok-2')).toBe(true);
			expect(ids.has('batch-ok-3')).toBe(true);
			expect(useStore.getState().transactions).toHaveLength(3);
		});

		test('rejects whole batch and persists nothing when a later row fails validation', async () => {
			await seedSplitEntities();

			const ts = Date.now();
			const good1: Transaction = {
				id: 'batch-rb-1',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-groceries',
				amount_minor: 1100,
				currency: 'USD',
				timestamp: ts,
			};
			const good2: Transaction = {
				id: 'batch-rb-2',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-fuel',
				amount_minor: 2200,
				currency: 'USD',
				timestamp: ts,
			};
			// Third row references a non-existent destination — validation must reject
			// before any DB write happens.
			const bad: Transaction = {
				id: 'batch-rb-3',
				from_entity_id: 'acct-1',
				to_entity_id: 'does-not-exist',
				amount_minor: 3300,
				currency: 'USD',
				timestamp: ts,
			};

			await expect(
				useStore.getState().createTransactionBatch([good1, good2, bad])
			).rejects.toMatchObject({
				name: 'TransactionValidationError',
				code: 'MISSING_TO',
			});

			// No partial split — neither store nor DB has any of the three.
			expect(useStore.getState().transactions).toHaveLength(0);
			const ids = new Set((await db.getAllTransactions()).map((t) => t.id));
			expect(ids.has('batch-rb-1')).toBe(false);
			expect(ids.has('batch-rb-2')).toBe(false);
			expect(ids.has('batch-rb-3')).toBe(false);
		});

		test('rolls back DB-level on a constraint violation mid-batch', async () => {
			await seedSplitEntities();

			// Pre-insert an id that the batch will collide with on the second row.
			// The first row of the batch is valid and unique, so without an
			// atomic SQL transaction it would persist; with one, the collision
			// rolls back the entire batch.
			const ts = Date.now();
			await db.createTransaction({
				id: 'collision-id',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-groceries',
				amount_minor: 500,
				currency: 'USD',
				timestamp: ts,
			});

			const batch: Transaction[] = [
				{
					id: 'batch-col-1',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-groceries',
					amount_minor: 700,
					currency: 'USD',
					timestamp: ts,
				},
				{
					// Same id as the pre-existing row → PRIMARY KEY collision when
					// the batch's INSERT runs.
					id: 'collision-id',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-fuel',
					amount_minor: 900,
					currency: 'USD',
					timestamp: ts,
				},
			];

			await expect(useStore.getState().createTransactionBatch(batch)).rejects.toBeDefined();

			// Only the pre-existing row should remain; the batch's first row
			// must not have leaked through.
			const all = await db.getAllTransactions();
			expect(all.map((t) => t.id)).toEqual(['collision-id']);

			// And the store must also be clean — if `set(...)` ran before the DB
			// throw, the partial-state bug we're fixing would still ship.
			expect(useStore.getState().transactions.map((t) => t.id)).not.toContain('batch-col-1');
		});

		test('first row failing validation rejects the whole batch (symmetric to last-row case)', async () => {
			await seedSplitEntities();

			const ts = Date.now();
			const bad: Transaction = {
				id: 'first-bad',
				from_entity_id: 'does-not-exist',
				to_entity_id: 'cat-groceries',
				amount_minor: 100,
				currency: 'USD',
				timestamp: ts,
			};
			const good: Transaction = {
				id: 'first-bad-tail',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-groceries',
				amount_minor: 200,
				currency: 'USD',
				timestamp: ts,
			};

			await expect(
				useStore.getState().createTransactionBatch([bad, good])
			).rejects.toMatchObject({
				name: 'TransactionValidationError',
				code: 'MISSING_FROM',
			});

			expect(useStore.getState().transactions).toHaveLength(0);
			expect(await db.getAllTransactions()).toHaveLength(0);
		});

		test('pre-existing transactions survive a failed batch', async () => {
			await seedSplitEntities();

			// Establish a healthy pre-existing row through the public store API so
			// in-memory state and DB are aligned, then attempt a batch that must fail.
			const ts = Date.now();
			const existing: Transaction = {
				id: 'pre-existing-1',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-groceries',
				amount_minor: 4200,
				currency: 'USD',
				timestamp: ts,
			};
			await useStore.getState().addTransaction(existing);

			const bad: Transaction = {
				id: 'should-not-persist',
				from_entity_id: 'acct-1',
				to_entity_id: 'does-not-exist',
				amount_minor: 9900,
				currency: 'USD',
				timestamp: ts,
			};
			await expect(useStore.getState().createTransactionBatch([bad])).rejects.toMatchObject({
				name: 'TransactionValidationError',
			});

			// Pre-existing row must still be present in both store and DB; a buggy
			// implementation that overwrites state on failure would wipe it.
			const storeIds = useStore.getState().transactions.map((t) => t.id);
			expect(storeIds).toEqual(['pre-existing-1']);
			const dbIds = (await db.getAllTransactions()).map((t) => t.id);
			expect(dbIds).toEqual(['pre-existing-1']);
		});

		test('preserves explicit is_confirmed values (true and false) regardless of timestamp', async () => {
			await seedSplitEntities();

			// `buildSavingsReleases` always sets `is_confirmed: true` even on
			// past-dated releases. If a future refactor swaps `??` for a check that
			// only honours explicit values when undefined, this test catches it.
			// Conversely, an explicit `false` on a past timestamp must not be
			// silently flipped to true by `defaultIsConfirmed`.
			const past = Date.now() - 86400000;
			await useStore.getState().createTransactionBatch([
				{
					id: 'confirm-explicit-true-past',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-groceries',
					amount_minor: 100,
					currency: 'USD',
					timestamp: past,
					is_confirmed: true,
				},
				{
					id: 'confirm-explicit-false-past',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-fuel',
					amount_minor: 200,
					currency: 'USD',
					timestamp: past,
					is_confirmed: false,
				},
			]);

			const all = await db.getAllTransactions();
			expect(all.find((t) => t.id === 'confirm-explicit-true-past')?.is_confirmed).toBe(true);
			expect(all.find((t) => t.id === 'confirm-explicit-false-past')?.is_confirmed).toBe(
				false
			);
		});

		test('duplicate IDs within the same batch roll back the whole batch', async () => {
			await seedSplitEntities();

			// Builder bug scenario: two rows generated with the same id. PRIMARY KEY
			// conflict must abort the transaction with neither row persisting.
			const ts = Date.now();
			const batch: Transaction[] = [
				{
					id: 'dup-within-batch',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-groceries',
					amount_minor: 300,
					currency: 'USD',
					timestamp: ts,
				},
				{
					id: 'dup-within-batch',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-fuel',
					amount_minor: 400,
					currency: 'USD',
					timestamp: ts,
				},
			];

			await expect(useStore.getState().createTransactionBatch(batch)).rejects.toBeDefined();

			expect(useStore.getState().transactions).toHaveLength(0);
			const dbIds = (await db.getAllTransactions()).map((t) => t.id);
			expect(dbIds).not.toContain('dup-within-batch');
		});

		test('real-world mixed-direction batch (split rows + saving→account release)', async () => {
			// Mirrors what `handleSubmit` produces in split mode with funded savings:
			// N account→category split rows followed by M saving→account release rows
			// all in a single atomic batch.
			const entities: Entity[] = [
				{
					id: 'acct-mix',
					type: 'account',
					name: 'Main',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'cat-groc',
					type: 'category',
					name: 'Groceries',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'cat-fuel',
					type: 'category',
					name: 'Fuel',
					currency: 'USD',
					row: 0,
					position: 1,
				},
				{
					id: 'sav-buf',
					type: 'saving',
					name: 'Buffer',
					currency: 'USD',
					row: 0,
					position: 0,
				},
			];
			for (const e of entities) await db.createEntity(e);
			useStore.setState({ entities });

			const ts = Date.now();
			await useStore.getState().createTransactionBatch([
				{
					id: 'mix-split-1',
					from_entity_id: 'acct-mix',
					to_entity_id: 'cat-groc',
					amount_minor: 2500,
					currency: 'USD',
					timestamp: ts,
				},
				{
					id: 'mix-split-2',
					from_entity_id: 'acct-mix',
					to_entity_id: 'cat-fuel',
					amount_minor: 1500,
					currency: 'USD',
					timestamp: ts,
				},
				{
					id: 'mix-release',
					from_entity_id: 'sav-buf',
					to_entity_id: 'acct-mix',
					amount_minor: 4000,
					currency: 'USD',
					timestamp: ts,
					is_confirmed: true,
				},
			]);

			const all = await db.getAllTransactions();
			const byId = new Map(all.map((t) => [t.id, t]));
			expect(byId.get('mix-split-1')?.amount_minor).toBe(2500);
			expect(byId.get('mix-split-2')?.amount_minor).toBe(1500);
			expect(byId.get('mix-release')?.from_entity_id).toBe('sav-buf');
			expect(byId.get('mix-release')?.is_confirmed).toBe(true);
		});

		test('no-op on empty array', async () => {
			await seedSplitEntities();
			await useStore.getState().createTransactionBatch([]);
			expect(useStore.getState().transactions).toHaveLength(0);
			expect(await db.getAllTransactions()).toHaveLength(0);
		});

		test('applies defaultIsConfirmed per row', async () => {
			await seedSplitEntities();

			const past = Date.now() - 86400000;
			const future = Date.now() + 86400000;
			await useStore.getState().createTransactionBatch([
				{
					id: 'batch-conf-past',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-groceries',
					amount_minor: 100,
					currency: 'USD',
					timestamp: past,
				},
				{
					id: 'batch-conf-future',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-fuel',
					amount_minor: 200,
					currency: 'USD',
					timestamp: future,
				},
			]);

			const all = await db.getAllTransactions();
			expect(all.find((t) => t.id === 'batch-conf-past')?.is_confirmed).toBe(true);
			expect(all.find((t) => t.id === 'batch-conf-future')?.is_confirmed).toBe(false);
		});
	});

	describe('replaceTransactionWithSplit (KII-110)', () => {
		const seedAccountCategory = async (): Promise<void> => {
			const entities: Entity[] = [
				{
					id: 'acct-1',
					type: 'account',
					name: 'Main',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'cat-1',
					type: 'category',
					name: 'Food',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'cat-2',
					type: 'category',
					name: 'Drinks',
					currency: 'USD',
					row: 0,
					position: 1,
				},
			];
			for (const e of entities) await db.createEntity(e);
			useStore.setState({ entities });
		};

		test('replaces the original with N new rows in the store and DB', async () => {
			await seedAccountCategory();
			const ts = Date.now();
			const original: Transaction = {
				id: 'orig',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-1',
				amount_minor: 2000,
				currency: 'USD',
				timestamp: ts,
				note: 'lunch',
			};
			await db.createTransaction(original);
			useStore.setState({ transactions: [original] });

			const children: Transaction[] = [
				{
					id: 'c1',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-1',
					amount_minor: 1200,
					currency: 'USD',
					timestamp: ts,
					note: 'lunch',
				},
				{
					id: 'c2',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-2',
					amount_minor: 800,
					currency: 'USD',
					timestamp: ts,
					note: 'lunch',
				},
			];

			await useStore.getState().replaceTransactionWithSplit('orig', children);

			const ids = new Set(useStore.getState().transactions.map((t) => t.id));
			expect(ids.has('orig')).toBe(false);
			expect(ids.has('c1')).toBe(true);
			expect(ids.has('c2')).toBe(true);

			const dbIds = new Set((await db.getAllTransactions()).map((t) => t.id));
			expect(dbIds.has('orig')).toBe(false);
			expect(dbIds.has('c1')).toBe(true);
			expect(dbIds.has('c2')).toBe(true);
		});

		test('does not error when the original has a notification_id (notification path runs)', async () => {
			// Mirrors the existing deleteTransaction tests: the codebase does not spy on
			// cancelNotification (Bun's ESM bindings make it unreliable to patch the
			// store's already-bound import). We assert the happy-path behavior — the
			// action completes and the original is removed — when notification_id is
			// present, exercising the cancellation branch without mocking it.
			await seedAccountCategory();

			const ts = Date.now() + 7 * 86_400_000; // future, so it's unconfirmed
			const original: Transaction = {
				id: 'orig-n',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-1',
				amount_minor: 3000,
				currency: 'USD',
				timestamp: ts,
				is_confirmed: false,
				notification_id: 'sys-notif-1',
			};
			await db.createTransaction(original);
			useStore.setState({ transactions: [original] });

			const children: Transaction[] = [
				{
					id: 'cn1',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-1',
					amount_minor: 1800,
					currency: 'USD',
					timestamp: ts,
				},
				{
					id: 'cn2',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-2',
					amount_minor: 1200,
					currency: 'USD',
					timestamp: ts,
				},
			];

			await expect(
				useStore.getState().replaceTransactionWithSplit('orig-n', children)
			).resolves.toBeUndefined();

			const ids = new Set(useStore.getState().transactions.map((t) => t.id));
			expect(ids.has('orig-n')).toBe(false);
			expect(ids.has('cn1')).toBe(true);
			expect(ids.has('cn2')).toBe(true);
		});

		test('adds an exclusion to the recurrence template when the original has series_id', async () => {
			await seedAccountCategory();

			const templateId = 'tmpl-split';
			const template = {
				id: templateId,
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-1',
				amount_minor: 2500,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: 1_000_000,
				end_date: null,
				end_count: null,
				created_at: 0,
			};
			await db.createRecurrenceTemplate(template);
			useStore.setState({
				recurrenceTemplates: [{ ...template, exclusions: [], is_deleted: false }],
			});

			const occurrenceTs = 1_500_000;
			const original: Transaction = {
				id: 'rec-1',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-1',
				amount_minor: 2500,
				currency: 'USD',
				timestamp: occurrenceTs,
				series_id: templateId,
			};
			await db.createTransaction(original);
			useStore.setState({ transactions: [original] });

			const children: Transaction[] = [
				{
					id: 'rs1',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-1',
					amount_minor: 1500,
					currency: 'USD',
					timestamp: occurrenceTs,
					series_id: templateId, // caller mistakenly passed series_id; action must strip it
				},
				{
					id: 'rs2',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-2',
					amount_minor: 1000,
					currency: 'USD',
					timestamp: occurrenceTs,
					series_id: templateId, // caller mistakenly passed series_id; action must strip it
				},
			];

			await useStore.getState().replaceTransactionWithSplit('rec-1', children);

			const tmplFromState = useStore
				.getState()
				.recurrenceTemplates.find((t) => t.id === templateId);
			expect(tmplFromState).toBeTruthy();
			expect(tmplFromState!.exclusions ?? []).toContain(occurrenceTs);

			// Children should not inherit series_id (DB normalises to null;
			// the action sets it to undefined before insert — either is "no
			// series" semantically).
			const newChildren = useStore
				.getState()
				.transactions.filter((t) => t.id === 'rs1' || t.id === 'rs2');
			for (const c of newChildren) {
				expect(c.series_id == null).toBe(true);
			}
		});

		test('splits an orphaned occurrence whose template is gone', async () => {
			await seedAccountCategory();

			// A recurring occurrence whose template no longer exists (series_id has
			// no FK — e.g. an export/import round-trip dropped the template). The
			// split must still succeed instead of failing with "template not found".
			const occurrenceTs = Date.now();
			const original: Transaction = {
				id: 'orphan-split',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-1',
				amount_minor: 2500,
				currency: 'USD',
				timestamp: occurrenceTs,
				series_id: 'ghost-template',
			};
			await db.createTransaction(original);
			useStore.setState({ transactions: [original], recurrenceTemplates: [] });

			const children: Transaction[] = [
				{
					id: 'os1',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-1',
					amount_minor: 1500,
					currency: 'USD',
					timestamp: occurrenceTs,
				},
				{
					id: 'os2',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-2',
					amount_minor: 1000,
					currency: 'USD',
					timestamp: occurrenceTs,
				},
			];

			await useStore.getState().replaceTransactionWithSplit('orphan-split', children);

			const ids = new Set(useStore.getState().transactions.map((t) => t.id));
			expect(ids.has('orphan-split')).toBe(false);
			expect(ids.has('os1')).toBe(true);
			expect(ids.has('os2')).toBe(true);
			expect((await db.getAllTransactions()).map((t) => t.id)).not.toContain('orphan-split');
		});

		test('warns and no-ops when called for a non-existent transaction', async () => {
			await seedAccountCategory();
			const before = useStore.getState().transactions.length;
			await useStore.getState().replaceTransactionWithSplit('does-not-exist', [
				{
					id: 'noop-1',
					from_entity_id: 'acct-1',
					to_entity_id: 'cat-1',
					amount_minor: 100,
					currency: 'USD',
					timestamp: Date.now(),
				},
			]);
			expect(useStore.getState().transactions.length).toBe(before);
		});

		test('warns and no-ops when rows is empty', async () => {
			await seedAccountCategory();
			const ts = Date.now();
			const original: Transaction = {
				id: 'orig-empty',
				from_entity_id: 'acct-1',
				to_entity_id: 'cat-1',
				amount_minor: 500,
				currency: 'USD',
				timestamp: ts,
			};
			await db.createTransaction(original);
			useStore.setState({ transactions: [original] });

			await useStore.getState().replaceTransactionWithSplit('orig-empty', []);

			// Original survives (no-op), state unchanged.
			const ids = new Set(useStore.getState().transactions.map((t) => t.id));
			expect(ids.has('orig-empty')).toBe(true);
		});
	});

	describe('deleteEntity', () => {
		test('should remove entity and its plans from store', async () => {
			const entities: Entity[] = [
				{
					id: 'entity-1',
					type: 'account',
					name: 'Checking',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'entity-2',
					type: 'category',
					name: 'Groceries',
					currency: 'USD',
					row: 0,
					position: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount_minor: 100000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount_minor: 50000,
				},
			];

			useStore.setState({ entities, plans });
			for (const entity of entities) {
				await db.createEntity(entity);
			}
			for (const plan of plans) {
				await db.upsertPlan(plan);
			}

			await useStore.getState().deleteEntity('entity-1');

			const state = useStore.getState();
			expect(state.entities).toHaveLength(3);
			expect(state.entities.find((e) => e.id === 'entity-2')).toBeTruthy();
			expect(state.entities.find((e) => e.id === 'entity-1')?.is_deleted).toBe(true);
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0]!.id).toBe('plan-2');

			// Verify it was soft-deleted in the database
			const dbEntity = await db.getEntityById('entity-1');
			expect(dbEntity?.is_deleted).toBe(true);
			const dbPlan = await db.getPlanForEntity('entity-1', '2026-01');
			expect(dbPlan).toBeNull();
		});

		test('should preserve transactions when deleting an entity with history', async () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			const transaction: Transaction = {
				id: 'tx-1',
				from_entity_id: income.id,
				to_entity_id: account.id,
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			useStore.setState({ entities: [income, account], transactions: [transaction] });
			await db.createEntity(income);
			await db.createEntity(account);
			await db.createTransaction(transaction);

			await useStore.getState().deleteEntity(account.id);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0]!.to_entity_id).toBe(account.id);
			expect(state.entities.find((e) => e.id === account.id)?.is_deleted).toBe(true);
		});
	});

	describe('Period filtering for entity balances', () => {
		test('should use period-filtered transactions for income and categories', async () => {
			// Create entities
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			// Create plans for current period (2026-01)
			const incomePlan: Plan = {
				id: 'plan-income',
				entity_id: 'income-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 500000,
			};

			const categoryPlan: Plan = {
				id: 'plan-category',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 50000,
			};

			// Create transactions:
			// - One in current period (2026-01)
			// - One in previous period (2025-12)
			const currentPeriodTx: Transaction = {
				id: 'tx-current',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			const previousPeriodTx: Transaction = {
				id: 'tx-previous',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 450000,
				currency: 'USD',
				timestamp: new Date('2025-12-15').getTime(),
			};

			const categoryTxCurrent: Transaction = {
				id: 'tx-category-current',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 30000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			const categoryTxPrevious: Transaction = {
				id: 'tx-category-previous',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 20000,
				currency: 'USD',
				timestamp: new Date('2025-12-20').getTime(),
			};

			// Set up store state
			useStore.setState({
				entities: [income, category, account],
				plans: [incomePlan, categoryPlan],
				transactions: [
					currentPeriodTx,
					previousPeriodTx,
					categoryTxCurrent,
					categoryTxPrevious,
				],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			// Get current state
			const state = useStore.getState();

			// Manually compute what useEntitiesWithBalance would compute for income
			const incomeEntities = state.entities.filter((e) => e.type === 'income');
			expect(incomeEntities).toHaveLength(1);

			const incomePlanData = state.plans.find(
				(p) => p.entity_id === 'income-1' && p.period_start === '2026-01'
			);
			expect(incomePlanData?.planned_amount_minor).toBe(500000);

			// Income should only count current period transactions
			const jan2026Start = new Date('2026-01-01').getTime();
			const jan2026End = new Date('2026-01-31T23:59:59.999').getTime();
			const incomeTransactionsInPeriod = state.transactions.filter(
				(t) =>
					t.timestamp >= jan2026Start &&
					t.timestamp <= jan2026End &&
					[t.from_entity_id, t.to_entity_id].includes('income-1')
			);
			expect(incomeTransactionsInPeriod).toHaveLength(1);
			expect(incomeTransactionsInPeriod[0]!.amount_minor).toBe(500000);

			// Categories should only count current period transactions
			const categoryTransactionsInPeriod = state.transactions.filter(
				(t) =>
					t.timestamp >= jan2026Start &&
					t.timestamp <= jan2026End &&
					t.to_entity_id === 'category-1'
			);
			expect(categoryTransactionsInPeriod).toHaveLength(1);
			expect(categoryTransactionsInPeriod[0]!.amount_minor).toBe(30000);
		});

		test('should use all-time transactions for accounts and savings', async () => {
			// Create entities
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			// Create all-time plan for saving
			const savingPlan: Plan = {
				id: 'plan-saving',
				entity_id: 'saving-1',
				period: 'all-time',
				period_start: '2025-12', // Date when goal was created
				planned_amount_minor: 1000000,
			};

			// Create transactions across multiple periods
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: new Date('2025-12-15').getTime(),
			};

			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount_minor: 200000,
				currency: 'USD',
				timestamp: new Date('2025-12-20').getTime(),
			};

			const tx4: Transaction = {
				id: 'tx-4',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount_minor: 300000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			// Set up store state
			useStore.setState({
				entities: [account, saving, income],
				plans: [savingPlan],
				transactions: [tx1, tx2, tx3, tx4],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();

			// Account should count ALL transactions (not period-filtered)
			const accountTransactions = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			expect(accountTransactions).toHaveLength(4);

			// Calculate account balance: money in - money out
			const accountBalance = accountTransactions.reduce((sum, t) => {
				return t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor;
			}, 0);
			// +5000 +5000 -2000 -3000 = 5000
			expect(accountBalance).toBe(500000);

			// Saving should count ALL transactions (not period-filtered)
			const savingTransactions = state.transactions.filter(
				(t) => t.to_entity_id === 'saving-1'
			);
			expect(savingTransactions).toHaveLength(2);

			const savingBalance = savingTransactions.reduce((sum, t) => sum + t.amount_minor, 0);
			// 2000 + 3000 = 5000
			expect(savingBalance).toBe(500000);

			// Verify the plan is using 'all-time' period
			const plan = state.plans.find(
				(p) => p.entity_id === 'saving-1' && p.period === 'all-time'
			);
			expect(plan?.planned_amount_minor).toBe(1000000);
		});

		test('should use all-time period for savings plans', async () => {
			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			// Create plan with period='all-time'
			const savingPlan: Plan = {
				id: 'plan-saving',
				entity_id: 'saving-1',
				period: 'all-time',
				period_start: '2026-01', // Date when goal was created
				planned_amount_minor: 1500000,
			};

			// Also create a monthly plan (should be ignored for savings)
			const monthlyPlan: Plan = {
				id: 'plan-saving-monthly',
				entity_id: 'saving-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount_minor: 50000,
			};

			useStore.setState({
				entities: [saving],
				plans: [savingPlan, monthlyPlan],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();

			// For savings, should use the plan with period='all-time' (15000), not period='month' (500)
			const allTimePlan = state.plans.find(
				(p) => p.entity_id === 'saving-1' && p.period === 'all-time'
			);
			expect(allTimePlan?.planned_amount_minor).toBe(1500000);
			expect(allTimePlan?.period_start).toBe('2026-01'); // Preserves creation date

			const monthPlan = state.plans.find(
				(p) => p.entity_id === 'saving-1' && p.period === 'month'
			);
			expect(monthPlan?.planned_amount_minor).toBe(50000);

			// Verify that both plans exist but we expect the implementation to use period='all-time'
			expect(state.plans).toHaveLength(2);
		});
	});

	describe('Balance calculations with transaction changes', () => {
		test('should update balances when adding current period transactions', async () => {
			// Set up entities
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			// Create entities in store
			useStore.setState({
				entities: [income, account, category, saving],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			// Create them in DB
			for (const entity of [income, account, category, saving]) {
				await db.createEntity(entity);
			}

			// Add transaction: Income -> Account (5000)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			await useStore.getState().addTransaction(tx1);

			let state = useStore.getState();
			expect(state.transactions).toHaveLength(1);

			// Expected balances after tx1:
			// Income: -5000 (money out, for current period)
			// Account: +5000 (money in, all-time)
			const jan2026Start = new Date('2026-01-01').getTime();
			const jan2026End = new Date('2026-01-31T23:59:59.999').getTime();

			const incomeTx = state.transactions.filter(
				(t) =>
					t.timestamp >= jan2026Start &&
					t.timestamp <= jan2026End &&
					[t.from_entity_id, t.to_entity_id].includes('income-1')
			);
			const incomeBalance = incomeTx.reduce(
				(sum, t) =>
					t.from_entity_id === 'income-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(incomeBalance).toBe(500000);

			const accountTx = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			const accountBalance = accountTx.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance).toBe(500000);

			// Add transaction: Account -> Category (300)
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 30000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};
			await useStore.getState().addTransaction(tx2);

			state = useStore.getState();
			expect(state.transactions).toHaveLength(2);

			// Expected balances after tx2:
			// Account: +5000 -300 = 4700 (all-time)
			// Category: +300 (current period)
			const accountTx2 = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			const accountBalance2 = accountTx2.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance2).toBe(470000);

			const categoryTx = state.transactions.filter(
				(t) =>
					t.timestamp >= jan2026Start &&
					t.timestamp <= jan2026End &&
					t.to_entity_id === 'category-1'
			);
			const categoryBalance = categoryTx.reduce((sum, t) => sum + t.amount_minor, 0);
			expect(categoryBalance).toBe(30000);

			// Add transaction: Account -> Saving (1000)
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount_minor: 100000,
				currency: 'USD',
				timestamp: new Date('2026-01-25').getTime(),
			};
			await useStore.getState().addTransaction(tx3);

			state = useStore.getState();
			expect(state.transactions).toHaveLength(3);

			// Expected balances after tx3:
			// Account: +5000 -300 -1000 = 3700 (all-time)
			// Saving: +1000 (all-time)
			const accountTx3 = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			const accountBalance3 = accountTx3.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance3).toBe(370000);

			const savingTx = state.transactions.filter((t) => t.to_entity_id === 'saving-1');
			const savingBalance = savingTx.reduce((sum, t) => sum + t.amount_minor, 0);
			expect(savingBalance).toBe(100000);
		});

		test('should handle previous period transactions correctly for different entity types', async () => {
			// Set up entities
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			useStore.setState({
				entities: [account, category, saving],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			for (const entity of [account, category, saving]) {
				await db.createEntity(entity);
			}

			// Add current period transaction: Account -> Category (500)
			const currentTx: Transaction = {
				id: 'tx-current',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 50000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			await useStore.getState().addTransaction(currentTx);

			// Add previous period transaction: Account -> Category (300)
			const previousTx: Transaction = {
				id: 'tx-previous',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 30000,
				currency: 'USD',
				timestamp: new Date('2025-12-15').getTime(),
			};
			await useStore.getState().addTransaction(previousTx);

			// Add previous period transaction: Account -> Saving (1000)
			const previousSavingTx: Transaction = {
				id: 'tx-prev-saving',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount_minor: 100000,
				currency: 'USD',
				timestamp: new Date('2025-12-20').getTime(),
			};
			await useStore.getState().addTransaction(previousSavingTx);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(3);

			// Verify account uses all transactions (all-time)
			const accountTx = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			expect(accountTx).toHaveLength(3);
			const accountBalance = accountTx.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			// Account: -500 (current) -300 (previous) -1000 (previous) = -1800
			expect(accountBalance).toBe(-180000);

			// Verify category uses only current period
			const jan2026Start = new Date('2026-01-01').getTime();
			const jan2026End = new Date('2026-01-31T23:59:59.999').getTime();
			const categoryTx = state.transactions.filter(
				(t) =>
					t.timestamp >= jan2026Start &&
					t.timestamp <= jan2026End &&
					t.to_entity_id === 'category-1'
			);
			expect(categoryTx).toHaveLength(1); // Only current period transaction
			const categoryBalance = categoryTx.reduce((sum, t) => sum + t.amount_minor, 0);
			expect(categoryBalance).toBe(50000); // Not 800!

			// Verify saving uses all transactions (all-time)
			const savingTx = state.transactions.filter((t) => t.to_entity_id === 'saving-1');
			expect(savingTx).toHaveLength(1);
			const savingBalance = savingTx.reduce((sum, t) => sum + t.amount_minor, 0);
			expect(savingBalance).toBe(100000);
		});

		test('should update balances when deleting transactions', async () => {
			// Set up entities
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			// Add multiple transactions
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 50000,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 30000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 20000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			await useStore.getState().addTransaction(tx1);
			await useStore.getState().addTransaction(tx2);
			await useStore.getState().addTransaction(tx3);

			let state = useStore.getState();
			expect(state.transactions).toHaveLength(3);

			// Initial balance: -1000 for account, +1000 for category
			let accountBalance = state.transactions.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance).toBe(-100000);

			// Delete one transaction
			await useStore.getState().deleteTransaction('tx-2');

			state = useStore.getState();
			expect(state.transactions).toHaveLength(2);

			// Balance after deletion: -700 for account, +700 for category
			accountBalance = state.transactions.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance).toBe(-70000);

			const categoryBalance = state.transactions
				.filter((t) => t.to_entity_id === 'category-1')
				.reduce((sum, t) => sum + t.amount_minor, 0);
			expect(categoryBalance).toBe(70000);
		});

		test('should update balances when updating transaction amounts', async () => {
			// Set up entities
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			// Add transaction
			const tx: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 50000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			await useStore.getState().addTransaction(tx);

			let state = useStore.getState();
			let accountBalance = state.transactions.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance).toBe(-50000);

			// Update transaction amount
			await useStore.getState().updateTransaction('tx-1', { amount_minor: 75000 });

			state = useStore.getState();
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0]!.amount_minor).toBe(75000);

			// Balance should reflect updated amount
			accountBalance = state.transactions.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance).toBe(-75000);

			const categoryBalance = state.transactions
				.filter((t) => t.to_entity_id === 'category-1')
				.reduce((sum, t) => sum + t.amount_minor, 0);
			expect(categoryBalance).toBe(75000);
		});

		test('should correctly calculate negative balance when account spends money', async () => {
			// This tests the specific bug report: account value increases when spending
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			// Start with 0 balance
			let state = useStore.getState();
			let accountBalance = state.transactions
				.filter((t) => [t.from_entity_id, t.to_entity_id].includes('account-1'))
				.reduce(
					(sum, t) =>
						t.to_entity_id === 'account-1'
							? sum + t.amount_minor
							: sum - t.amount_minor,
					0
				);
			expect(accountBalance).toBe(0);

			// Spend money: Account -> Category (500)
			const tx: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 50000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			await useStore.getState().addTransaction(tx);

			state = useStore.getState();

			// Account balance should be NEGATIVE (spent money)
			accountBalance = state.transactions
				.filter((t) => [t.from_entity_id, t.to_entity_id].includes('account-1'))
				.reduce(
					(sum, t) =>
						t.to_entity_id === 'account-1'
							? sum + t.amount_minor
							: sum - t.amount_minor,
					0
				);
			expect(accountBalance).toBe(-50000); // Should be -500, NOT +500!

			// Category should have received the money
			const categoryBalance = state.transactions
				.filter((t) => t.to_entity_id === 'category-1')
				.reduce((sum, t) => sum + t.amount_minor, 0);
			expect(categoryBalance).toBe(50000);
		});
	});

	describe('getEntitiesWithBalance function', () => {
		test('should filter entities by type and calculate balances correctly', () => {
			// Set up entities of different types
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 2,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 3,
			};

			// Set up plans - all plans use 'all-time' period
			const incomePlan: Plan = {
				id: 'plan-income',
				entity_id: 'income-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 500000,
			};

			const categoryPlan: Plan = {
				id: 'plan-category',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 30000,
			};

			const savingPlan: Plan = {
				id: 'plan-saving',
				entity_id: 'saving-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 1000000,
			};

			// Set up transactions (January 2026)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 20000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			// account -> saving transaction provides reservation-like balance
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount_minor: 100000,
				currency: 'USD',
				timestamp: new Date('2026-01-22').getTime(),
			};

			useStore.setState({
				entities: [income, account, category, saving],
				plans: [incomePlan, categoryPlan, savingPlan],
				transactions: [tx1, tx2, tx3],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			// Test income entities
			const state = useStore.getState();
			const incomeEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'income'
			);
			expect(incomeEntities).toHaveLength(1);
			expect(incomeEntities[0]!.id).toBe('income-1');
			expect(incomeEntities[0]!.planned).toBe(500000);
			expect(incomeEntities[0]!.actual).toBe(500000); // Money out from income
			expect(incomeEntities[0]!.remaining).toBe(0);

			// Test account entities (all-time balance, reserved derived from account->saving txns)
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(accountEntities).toHaveLength(1);
			expect(accountEntities[0]!.id).toBe('account-1');
			expect(accountEntities[0]!.planned).toBe(0); // No plan
			expect(accountEntities[0]!.actual).toBe(380000); // +5000 -200 -1000 (txns) = 3800 (full bank balance)
			expect(accountEntities[0]!.reserved).toBe(100000); // derived from account->saving txns
			expect(accountEntities[0]!.remaining).toBe(-380000);

			// Test category entities (current period only)
			const categoryEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			expect(categoryEntities).toHaveLength(1);
			expect(categoryEntities[0]!.id).toBe('category-1');
			expect(categoryEntities[0]!.planned).toBe(30000);
			expect(categoryEntities[0]!.actual).toBe(20000);
			expect(categoryEntities[0]!.remaining).toBe(10000);

			// Test saving entities (balance from account->saving transactions)
			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			expect(savingEntities).toHaveLength(1);
			expect(savingEntities[0]!.id).toBe('saving-1');
			expect(savingEntities[0]!.planned).toBe(1000000);
			expect(savingEntities[0]!.actual).toBe(100000);
			expect(savingEntities[0]!.remaining).toBe(900000);
		});

		test('should use all-time transactions for accounts and savings, current period for income and categories', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 2,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 3,
			};

			// December 2025 transactions (previous month)
			const txDec1: Transaction = {
				id: 'tx-dec-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 400000,
				currency: 'USD',
				timestamp: new Date('2025-12-15').getTime(),
			};

			const txDec2: Transaction = {
				id: 'tx-dec-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 30000,
				currency: 'USD',
				timestamp: new Date('2025-12-20').getTime(),
			};

			// January 2026 transactions (current month)
			const txJan1: Transaction = {
				id: 'tx-jan-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			const txJan2: Transaction = {
				id: 'tx-jan-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 20000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			// account -> saving transaction to test reserved
			const txSaving: Transaction = {
				id: 'tx-saving',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount_minor: 150000,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};

			useStore.setState({
				entities: [income, account, category, saving],
				plans: [],
				transactions: [txDec1, txDec2, txJan1, txJan2, txSaving],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			// Income: only January transactions (5000)
			const state = useStore.getState();
			const incomeEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'income'
			);
			expect(incomeEntities[0]!.actual).toBe(500000); // Only Jan, not Dec

			// Account: all txns (4000 - 300 + 5000 - 200 - 1500 = 7000), reserved derived from txns
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(accountEntities[0]!.actual).toBe(700000); // All-time balance
			expect(accountEntities[0]!.reserved).toBe(150000); // Derived from account->saving txns

			// Category: only January transactions (200)
			const categoryEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			expect(categoryEntities[0]!.actual).toBe(20000); // Only Jan, not Dec

			// Saving: balance from account->saving transactions (1500)
			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			expect(savingEntities[0]!.actual).toBe(150000); // From transactions
		});

		test('should look up plans with correct period type', () => {
			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			// Category has all-time plan (the standard)
			const categoryPlanAllTime: Plan = {
				id: 'plan-cat-alltime',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 30000,
			};

			// Category also has a monthly plan (should be ignored - kept for potential future override feature)
			const categoryPlanMonthly: Plan = {
				id: 'plan-cat-monthly',
				entity_id: 'category-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount_minor: 25000,
			};

			// Saving has all-time plan
			const savingPlanAllTime: Plan = {
				id: 'plan-saving-alltime',
				entity_id: 'saving-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 1000000,
			};

			// Saving also has monthly plan (should be ignored - kept for potential future override feature)
			const savingPlanMonthly: Plan = {
				id: 'plan-saving-monthly',
				entity_id: 'saving-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount_minor: 50000,
			};

			useStore.setState({
				entities: [category, saving],
				plans: [
					categoryPlanAllTime,
					categoryPlanMonthly,
					savingPlanAllTime,
					savingPlanMonthly,
				],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			// Category should use all-time plan (300), not monthly plan (250)
			const state = useStore.getState();
			const categoryEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			expect(categoryEntities[0]!.planned).toBe(30000);

			// Saving should use all-time plan (10000), not monthly plan (500)
			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			expect(savingEntities[0]!.planned).toBe(1000000);
		});

		test('should handle entities with no plans', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			const tx: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 100000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			useStore.setState({
				entities: [income, account],
				plans: [], // No plans
				transactions: [tx],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();
			const incomeEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'income'
			);
			expect(incomeEntities[0]!.planned).toBe(0);
			expect(incomeEntities[0]!.actual).toBe(100000);
			expect(incomeEntities[0]!.remaining).toBe(-100000);

			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(accountEntities[0]!.planned).toBe(0);
			expect(accountEntities[0]!.actual).toBe(100000);
			expect(accountEntities[0]!.remaining).toBe(-100000);
		});

		test('should handle entities with no transactions', () => {
			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const categoryPlan: Plan = {
				id: 'plan-1',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 50000,
			};

			useStore.setState({
				entities: [category],
				plans: [categoryPlan],
				transactions: [], // No transactions
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();
			const categoryEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			expect(categoryEntities[0]!.planned).toBe(50000);
			expect(categoryEntities[0]!.actual).toBe(0);
			expect(categoryEntities[0]!.remaining).toBe(50000);
		});

		test('should handle multiple entities of the same type', () => {
			const cat1: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const cat2: Entity = {
				id: 'category-2',
				type: 'category',
				name: 'Transport',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			const cat3: Entity = {
				id: 'category-3',
				type: 'category',
				name: 'Entertainment',
				currency: 'USD',
				row: 0,
				position: 2,
			};

			const plan1: Plan = {
				id: 'plan-1',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 30000,
			};

			const plan2: Plan = {
				id: 'plan-2',
				entity_id: 'category-2',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 15000,
			};

			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'category-1',
				amount_minor: 20000,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};

			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'income-1',
				to_entity_id: 'category-2',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			useStore.setState({
				entities: [cat1, cat2, cat3],
				plans: [plan1, plan2],
				transactions: [tx1, tx2],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();
			const categories = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			expect(categories).toHaveLength(3);

			// Check they're sorted by order
			expect(categories[0]!.id).toBe('category-1');
			expect(categories[1]!.id).toBe('category-2');
			expect(categories[2]!.id).toBe('category-3');

			// Check balances
			expect(categories[0]!.planned).toBe(30000);
			expect(categories[0]!.actual).toBe(20000);
			expect(categories[0]!.remaining).toBe(10000);

			expect(categories[1]!.planned).toBe(15000);
			expect(categories[1]!.actual).toBe(10000);
			expect(categories[1]!.remaining).toBe(5000);

			expect(categories[2]!.planned).toBe(0); // No plan
			expect(categories[2]!.actual).toBe(0); // No transactions
			expect(categories[2]!.remaining).toBe(0);
		});

		test('should calculate income balance correctly (money flowing out is positive)', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			// Income -> Account (money out from income = positive)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			// Account -> Income (money in to income = negative, unusual but possible)
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'income-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			useStore.setState({
				entities: [income, account],
				plans: [],
				transactions: [tx1, tx2],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();
			const incomeEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'income'
			);
			// Income: +5000 (out) -100 (in) = 4900
			expect(incomeEntities[0]!.actual).toBe(490000);
		});

		test('should calculate account balance correctly (money in is positive, money out is negative)', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 2,
			};

			// Income -> Account (money in = positive)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			// Account -> Category (money out = negative)
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 150000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			useStore.setState({
				entities: [income, account, category],
				plans: [],
				transactions: [tx1, tx2],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			// Account: +5000 (in) -1500 (out) = 3500
			expect(accountEntities[0]!.actual).toBe(350000);
		});

		test('account->account transfer debits source and credits destination in one pass', () => {
			// KII-124: locks the both-sides-same-type case before the single-pass
			// balance rewrite — the source account must go -amt and the
			// destination +amt from the *same* transaction row.
			const source: Entity = {
				id: 'account-src',
				type: 'account',
				name: 'Source',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const destination: Entity = {
				id: 'account-dst',
				type: 'account',
				name: 'Destination',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			const transfer: Transaction = {
				id: 'tx-transfer',
				from_entity_id: 'account-src',
				to_entity_id: 'account-dst',
				amount_minor: 200000,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};

			useStore.setState({
				entities: [source, destination],
				plans: [],
				transactions: [transfer],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();
			const accounts = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			const src = accounts.find((a) => a.id === 'account-src');
			const dst = accounts.find((a) => a.id === 'account-dst');
			expect(src!.actual).toBe(-200000);
			expect(dst!.actual).toBe(200000);
		});

		test('should only count incoming transactions for categories and savings', () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 2,
			};

			// Account -> Category (should count)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 30000,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};

			// Category -> Account (unusual, should NOT count for category)
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'category-1',
				to_entity_id: 'account-1',
				amount_minor: 5000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			// account -> saving transaction provides saving balance
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount_minor: 100000,
				currency: 'USD',
				timestamp: new Date('2026-01-05').getTime(),
			};

			useStore.setState({
				entities: [account, category, saving],
				plans: [],
				transactions: [tx1, tx2, tx3],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});

			const state = useStore.getState();
			const categoryEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			// Category: only incoming (300), not outgoing (50)
			expect(categoryEntities[0]!.actual).toBe(30000);

			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			// Saving: balance from account->saving transactions (net flow)
			expect(savingEntities[0]!.actual).toBe(100000);
		});
	});

	describe('Balance Adjustment System Entity', () => {
		test('should include balance adjustment entity in store but filter from account lists', async () => {
			// Create a regular account
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			await db.createEntity(account);

			// Initialize store (this should create the system entity)
			await useStore.getState().initialize();

			const state = useStore.getState();

			// System entity should be in state.entities
			const systemEntity = state.entities.find((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID);
			expect(systemEntity).toBeDefined();
			expect(systemEntity?.name).toBe('Balance Adjustments');

			// System entity should exist in database
			const dbSystemEntity = await db.getEntityById(BALANCE_ADJUSTMENT_ENTITY_ID);
			expect(dbSystemEntity).not.toBeNull();

			// Should have both the regular account AND the system entity
			expect(state.entities).toHaveLength(2);

			// But getEntitiesWithBalance should filter out the system entity
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(accountEntities).toHaveLength(1);
			expect(accountEntities[0]!.id).toBe('account-1');
		});

		test('should prevent deletion of system entity', async () => {
			// Initialize to create system entity
			await useStore.getState().initialize();

			// Try to delete system entity
			await useStore.getState().deleteEntity(BALANCE_ADJUSTMENT_ENTITY_ID);

			// System entity should still exist in database
			const dbEntity = await db.getEntityById(BALANCE_ADJUSTMENT_ENTITY_ID);
			expect(dbEntity).not.toBeNull();
		});

		test('should allow transactions with balance adjustment entity to affect account balance', async () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			// Set up store
			await db.createEntity(account);
			await useStore.getState().initialize();

			// Create adjustment transaction: system -> account (+500)
			const adjustment: Transaction = {
				id: 'tx-adjust',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount_minor: 50000,
				currency: 'USD',
				timestamp: Date.now(),
				note: 'Balance correction: 0 → 500',
			};

			await useStore.getState().addTransaction(adjustment);

			const state = useStore.getState();

			// Account balance should be +500
			const accountTx = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			const accountBalance = accountTx.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance).toBe(50000);
		});

		test('should handle multiple adjustments correctly', async () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			await db.createEntity(account);
			await useStore.getState().initialize();

			// First adjustment: +1000
			const adjustment1: Transaction = {
				id: 'tx-adjust-1',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount_minor: 100000,
				currency: 'USD',
				timestamp: Date.now(),
				note: 'Balance correction: 0 → 1000',
			};
			await useStore.getState().addTransaction(adjustment1);

			// Second adjustment: -200 (correction downward)
			const adjustment2: Transaction = {
				id: 'tx-adjust-2',
				from_entity_id: 'account-1',
				to_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				amount_minor: 20000,
				currency: 'USD',
				timestamp: Date.now() + 1000,
				note: 'Balance correction: 1000 → 800',
			};
			await useStore.getState().addTransaction(adjustment2);

			const state = useStore.getState();

			// Account balance should be +1000 -200 = 800
			const accountTx = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			const accountBalance = accountTx.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(accountBalance).toBe(80000);

			// Should have 2 transactions
			expect(state.transactions).toHaveLength(2);
		});

		test('should handle adjustments for multiple accounts independently', async () => {
			const account1: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const account2: Entity = {
				id: 'account-2',
				type: 'account',
				name: 'Savings',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			await db.createEntity(account1);
			await db.createEntity(account2);
			await useStore.getState().initialize();

			// Adjustment for account 1: +500
			const adjustment1: Transaction = {
				id: 'tx-adjust-1',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount_minor: 50000,
				currency: 'USD',
				timestamp: Date.now(),
				note: 'Balance correction for account 1',
			};
			await useStore.getState().addTransaction(adjustment1);

			// Adjustment for account 2: +1000
			const adjustment2: Transaction = {
				id: 'tx-adjust-2',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-2',
				amount_minor: 100000,
				currency: 'USD',
				timestamp: Date.now() + 1000,
				note: 'Balance correction for account 2',
			};
			await useStore.getState().addTransaction(adjustment2);

			const state = useStore.getState();

			// Account 1 balance should be +500
			const account1Tx = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			const account1Balance = account1Tx.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-1' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(account1Balance).toBe(50000);

			// Account 2 balance should be +1000
			const account2Tx = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-2')
			);
			const account2Balance = account2Tx.reduce(
				(sum, t) =>
					t.to_entity_id === 'account-2' ? sum + t.amount_minor : sum - t.amount_minor,
				0
			);
			expect(account2Balance).toBe(100000);

			// Should have 2 transactions
			expect(state.transactions).toHaveLength(2);
		});

		test('should recreate system entity on initialize if missing (e.g. after data reset)', async () => {
			// Simulate data reset: system entity removed from DB
			await useStore.getState().initialize();
			resetDrizzleDb();

			// Re-initialize — should recreate the system entity
			await useStore.getState().initialize();

			const state = useStore.getState();
			const systemEntity = state.entities.find((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID);
			expect(systemEntity).toBeDefined();

			// And balance adjustments should work
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			await db.createEntity(account);
			await useStore.getState().initialize();

			const adjustment: Transaction = {
				id: 'tx-adjust-after-reset',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount_minor: 50000,
				currency: 'USD',
				timestamp: Date.now(),
				note: 'Balance correction after reset',
			};
			await useStore.getState().addTransaction(adjustment);

			expect(useStore.getState().transactions).toHaveLength(1);
			expect(useStore.getState().transactions[0]!.amount_minor).toBe(50000);
		});

		test('should include adjustment transactions in account balance calculations via getEntitiesWithBalance', async () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			await db.createEntity(account);
			await db.createEntity(income);
			await useStore.getState().initialize();

			// Regular transaction: income -> account (5000)
			const regularTx: Transaction = {
				id: 'tx-regular',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 500000,
				currency: 'USD',
				timestamp: Date.now(),
			};
			await useStore.getState().addTransaction(regularTx);

			// Adjustment transaction: system -> account (+200)
			const adjustmentTx: Transaction = {
				id: 'tx-adjust',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount_minor: 20000,
				currency: 'USD',
				timestamp: Date.now() - 1000,
				note: 'Balance correction',
			};
			await useStore.getState().addTransaction(adjustmentTx);

			const state = useStore.getState();

			// Use getEntitiesWithBalance to get account with calculated balance
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);

			// Account balance should include both regular and adjustment transactions
			// +5000 (from income) +200 (adjustment) = 5200
			expect(accountEntities[0]!.actual).toBe(520000);
		});

		test('should return upcoming: 0 when no future transactions exist', () => {
			const category: Entity = {
				id: 'cat-1',
				type: 'category',
				name: 'Groceries',
				currency: 'EUR',
				row: 0,
				position: 0,
			};
			const account: Entity = {
				id: 'acc-1',
				type: 'account',
				name: 'Checking',
				currency: 'EUR',
				row: 0,
				position: 1,
			};
			const tx: Transaction = {
				id: 'tx-past',
				from_entity_id: 'acc-1',
				to_entity_id: 'cat-1',
				amount_minor: 5000,
				currency: 'EUR',
				timestamp: new Date('2026-01-10').getTime(), // past
			};
			useStore.setState({
				entities: [category, account],
				plans: [],
				transactions: [tx],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});
			const state = useStore.getState();
			const cats = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				'2026-01',
				'category'
			);
			expect(cats[0]!.upcoming).toBe(0);
			expect(cats[0]!.actual).toBe(5000);
		});
		test('should handle decimal amounts without floating point precision issues', async () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'EUR',
				row: 0,
				position: 0,
			};
			await db.createEntity(account);
			await useStore.getState().initialize();

			// Create multiple small decimal transactions that can cause floating point issues
			// Classic example: 0.1 + 0.2 = 0.30000000000000004 in JavaScript
			const transactions: Transaction[] = [
				{
					id: 'tx-1',
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'account-1',
					amount_minor: 10,
					currency: 'EUR',
					timestamp: Date.now(),
				},
				{
					id: 'tx-2',
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'account-1',
					amount_minor: 20,
					currency: 'EUR',
					timestamp: Date.now() - 1000,
				},
				{
					id: 'tx-3',
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'account-1',
					amount_minor: 115,
					currency: 'EUR',
					timestamp: Date.now() - 2000,
				},
			];

			for (const tx of transactions) {
				await useStore.getState().addTransaction(tx);
			}

			const state = useStore.getState();
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);

			const account1 = accountEntities.find((e) => e.id === 'account-1');
			expect(account1).toBeDefined();

			// Pre-KII-120 the equivalent float sum (0.1 + 0.2 + 1.15) landed on
			// 1.4500000000000002 and was papered over with `toBeCloseTo(1.45, 2)`.
			// Now: integer minor-unit sum is exact.
			expect(account1!.actual).toBe(145);
		});

		test('decimal sums stay exact across thousands of transactions (KII-120)', async () => {
			// 1000 × 10-cent rows. Pre-KII-120 this would drift to ~99.999... in
			// REAL accumulation; in integer minor units the SUM lands exactly on
			// 10,000 cents (€100). This is the primary motivation for the
			// migration — drift compounds with N and the sync op-log (KII-96)
			// needs bit-stable replay across devices.
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'EUR',
				row: 0,
				position: 0,
			};
			await db.createEntity(account);
			await useStore.getState().initialize();

			const N = 1000;
			// Anchor every timestamp safely in the past so each row is
			// `is_confirmed: true` (defaultIsConfirmed flips on `<= now`).
			const baseTs = Date.now() - N - 1000;
			const batch: Transaction[] = [];
			for (let i = 0; i < N; i++) {
				batch.push({
					id: `tx-${i}`,
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'account-1',
					amount_minor: 10, // €0.10
					currency: 'EUR',
					timestamp: baseTs + i,
				});
			}
			await useStore.getState().createTransactionBatch(batch);

			const state = useStore.getState();
			const [account1] = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(account1!.actual).toBe(N * 10);
			expect(Number.isInteger(account1!.actual)).toBe(true);
		});
	});

	// ─────────────────────────────────────────────────────────
	// Upcoming transactions
	// ─────────────────────────────────────────────────────────
	describe('Upcoming transactions (future-dated)', () => {
		const NOW = new Date('2026-01-15T12:00:00Z').getTime();
		const PAST = new Date('2026-01-10T12:00:00Z').getTime();
		const FUTURE = new Date('2026-01-20T12:00:00Z').getTime();

		beforeEach(() => {
			spyOn(Date, 'now').mockReturnValue(NOW);
		});

		afterEach(() => {
			mock.restore();
		});

		const baseEntities: Entity[] = [
			{
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'EUR',
				row: 0,
				position: 0,
			},
			{
				id: 'acc-1',
				type: 'account',
				name: 'Checking',
				currency: 'EUR',
				row: 0,
				position: 1,
			},
			{
				id: 'cat-1',
				type: 'category',
				name: 'Rent',
				currency: 'EUR',
				row: 0,
				position: 2,
			},
			{
				id: 'sav-1',
				type: 'saving',
				name: 'Holiday',
				currency: 'EUR',
				row: 0,
				position: 3,
			},
		];

		const basePlans: Plan[] = [
			{
				id: 'plan-cat',
				entity_id: 'cat-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 100000,
			},
			{
				id: 'plan-sav',
				entity_id: 'sav-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 500000,
			},
			{
				id: 'plan-inc',
				entity_id: 'income-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 300000,
			},
		];

		function setup(transactions: Transaction[]) {
			useStore.setState({
				entities: baseEntities,
				plans: basePlans,
				transactions,
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});
			const state = useStore.getState();
			// `[0]!` is safe — every test seeds baseEntities with one of each type.
			return {
				income: getEntitiesWithBalance(
					state.entities,
					state.plans,
					transactions,
					'2026-01',
					'income'
				)[0]!,
				account: getEntitiesWithBalance(
					state.entities,
					state.plans,
					transactions,
					'2026-01',
					'account'
				)[0]!,
				category: getEntitiesWithBalance(
					state.entities,
					state.plans,
					transactions,
					'2026-01',
					'category'
				)[0]!,
				saving: getEntitiesWithBalance(
					state.entities,
					state.plans,
					transactions,
					'2026-01',
					'saving'
				)[0]!,
			};
		}

		test('future transaction is NOT counted in actual', () => {
			const { category } = setup([
				{
					id: 'tx-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 40000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			expect(category.actual).toBe(0);
			expect(category.remaining).toBe(100000); // planned unchanged
		});

		test('future transaction is counted in upcoming', () => {
			const { category } = setup([
				{
					id: 'tx-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 40000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			expect(category.upcoming).toBe(40000);
		});

		test('past + future transactions: actual excludes future, upcoming excludes past', () => {
			const { category } = setup([
				{
					id: 'tx-past',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 20000,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 15000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			expect(category.actual).toBe(20000);
			expect(category.upcoming).toBe(15000);
			expect(category.remaining).toBe(80000); // 1000 - 200 (actual only)
		});

		test('remaining is based on actual only, not actual + upcoming', () => {
			const { category } = setup([
				{
					id: 'tx-past',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 30000,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 90000, // would overspend if counted
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			// planned = 1000; actual = 300 → remaining = 700, NOT -200
			expect(category.remaining).toBe(70000);
		});

		test('account actual excludes future inflows', () => {
			const { account } = setup([
				{
					id: 'tx-income-past',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount_minor: 300000,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-income-future',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount_minor: 100000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			expect(account.actual).toBe(300000);
			expect(account.upcoming).toBe(100000);
		});

		test('account actual excludes future outflows', () => {
			const { account } = setup([
				{
					id: 'tx-in',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount_minor: 500000,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-out-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 200000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			// actual = +5000 only; upcoming = -2000 (outflow)
			expect(account.actual).toBe(500000);
			expect(account.upcoming).toBe(-200000);
		});

		test('income upcoming counts inflow that has not yet left income', () => {
			const { income } = setup([
				{
					id: 'tx-past',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount_minor: 100000,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-future',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount_minor: 200000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			// income "actual" = money that has left income = 1000
			// income "upcoming" = money scheduled to leave = 2000
			expect(income.actual).toBe(100000);
			expect(income.upcoming).toBe(200000);
		});

		test('saving balance comes from account->saving transactions', () => {
			const { saving } = setup([
				{
					id: 'tx-reserve',
					from_entity_id: 'acc-1',
					to_entity_id: 'sav-1',
					amount_minor: 50000,
					currency: 'EUR',
					timestamp: PAST,
				},
			]);
			expect(saving.actual).toBe(50000);
			expect(saving.upcoming).toBe(0);
		});

		test('multiple future transactions are summed in upcoming', () => {
			const { category } = setup([
				{
					id: 'tx-f1',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 10000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
				{
					id: 'tx-f2',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 25000,
					currency: 'EUR',
					timestamp: FUTURE + 1000,
				},
			]);
			expect(category.upcoming).toBe(35000);
			expect(category.actual).toBe(0);
		});

		test('future transactions outside current period are not counted', () => {
			// Category uses current-period (month) scoping.
			// A future tx in Feb 2026 should not appear in Jan 2026 upcoming.
			const { category } = setup([
				{
					id: 'tx-future-wrong-month',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount_minor: 99900,
					currency: 'EUR',
					timestamp: new Date('2026-02-15').getTime(), // Feb — outside Jan period
				},
			]);
			// period = '2026-01'; Feb tx is outside that range entirely
			expect(category.upcoming).toBe(0);
			expect(category.actual).toBe(0);
		});

		test('account upcoming excludes future txns outside current period', () => {
			// Accounts show upcoming only for the current month (KII-89)
			const { account } = setup([
				{
					id: 'tx-acc-future',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount_minor: 80000,
					currency: 'EUR',
					timestamp: new Date('2026-04-01').getTime(), // April — outside Jan period
				},
			]);
			expect(account.upcoming).toBe(0);
		});

		test('account upcoming includes future txns within current period', () => {
			const { account } = setup([
				{
					id: 'tx-acc-future-same-month',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount_minor: 50000,
					currency: 'EUR',
					timestamp: new Date('2026-01-20T12:00:00Z').getTime(), // Jan 20 — within Jan period, after NOW (Jan 15)
				},
			]);
			expect(account.upcoming).toBe(50000);
		});

		test('saving upcoming excludes future txns outside current period', () => {
			const { saving } = setup([
				{
					id: 'tx-sav-future-far',
					from_entity_id: 'acc-1',
					to_entity_id: 'sav-1',
					amount_minor: 30000,
					currency: 'EUR',
					timestamp: new Date('2026-06-01').getTime(), // June — outside Jan period
				},
			]);
			expect(saving.upcoming).toBe(0);
		});
	});

	describe('reserveToSaving action', () => {
		const account: Entity = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			row: 0,
			position: 0,
		};

		const saving1: Entity = {
			id: 'saving-1',
			type: 'saving',
			name: 'Vacation',
			currency: 'USD',
			row: 0,
			position: 0,
		};

		const saving2: Entity = {
			id: 'saving-2',
			type: 'saving',
			name: 'Emergency',
			currency: 'USD',
			row: 0,
			position: 1,
		};

		async function setupSavingEntities() {
			useStore.setState({
				entities: [account, saving1, saving2],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				incomeVisible: false,
			});
			for (const entity of [account, saving1, saving2]) {
				await db.createEntity(entity);
			}
		}

		test('creates account -> saving transaction when desiredTotal > current net', async () => {
			await setupSavingEntities();

			await useStore.getState().reserveToSaving('account-1', 'saving-1', 50000);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0]!.from_entity_id).toBe('account-1');
			expect(state.transactions[0]!.to_entity_id).toBe('saving-1');
			expect(state.transactions[0]!.amount_minor).toBe(50000);
		});

		test('creates saving -> account transaction when desiredTotal < current net', async () => {
			await setupSavingEntities();

			// First reserve 50000
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 50000);
			expect(useStore.getState().transactions).toHaveLength(1);

			// Now reduce to 20000 — should create saving -> account for delta (30000)
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 20000);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(2);
			const releaseTx = state.transactions[0]!; // newest first
			expect(releaseTx.from_entity_id).toBe('saving-1');
			expect(releaseTx.to_entity_id).toBe('account-1');
			expect(releaseTx.amount_minor).toBe(30000);
		});

		test('is a no-op when desiredTotal equals current net', async () => {
			await setupSavingEntities();

			await useStore.getState().reserveToSaving('account-1', 'saving-1', 50000);
			expect(useStore.getState().transactions).toHaveLength(1);

			// Reserve same amount again — no new transaction
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 50000);
			expect(useStore.getState().transactions).toHaveLength(1);
		});

		test('with desiredTotal=0 creates saving -> account for full amount', async () => {
			await setupSavingEntities();

			// Reserve 80000
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 80000);
			expect(useStore.getState().transactions).toHaveLength(1);

			// Set desired to 0 — release everything
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 0);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(2);
			const releaseTx = state.transactions[0]!; // newest first
			expect(releaseTx.from_entity_id).toBe('saving-1');
			expect(releaseTx.to_entity_id).toBe('account-1');
			expect(releaseTx.amount_minor).toBe(80000);
		});

		test('account reserved field reflects transaction-derived savings', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};

			const txns: Transaction[] = [
				{
					id: 'tx-income',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount_minor: 500000,
					currency: 'USD',
					timestamp: new Date('2026-01-15').getTime(),
				},
				{
					id: 'tx-res-1',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-1',
					amount_minor: 50000,
					currency: 'USD',
					timestamp: new Date('2026-01-16').getTime(),
				},
				{
					id: 'tx-res-2',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-2',
					amount_minor: 30000,
					currency: 'USD',
					timestamp: new Date('2026-01-17').getTime(),
				},
			];

			const accountEntities = getEntitiesWithBalance(
				[income, account, saving1, saving2],
				[],
				txns,
				'2026-01',
				'account'
			);

			// actual = 5000 - 500 - 300 = 4200
			expect(accountEntities[0]!.actual).toBe(420000);
			// reserved = sum of net account->saving flows (800)
			expect(accountEntities[0]!.reserved).toBe(80000);

			// Savings get their balance from transactions
			const savingEntities = getEntitiesWithBalance(
				[income, account, saving1, saving2],
				[],
				txns,
				'2026-01',
				'saving'
			);

			expect(savingEntities[0]!.actual).toBe(50000); // saving-1
			expect(savingEntities[1]!.actual).toBe(30000); // saving-2
		});

		test('saving balance aggregates transactions from multiple accounts', () => {
			const account2: Entity = {
				id: 'account-2',
				type: 'account',
				name: 'Cash',
				currency: 'USD',
				row: 0,
				position: 1,
			};

			const txns: Transaction[] = [
				{
					id: 'tx-res-1',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-1',
					amount_minor: 50000,
					currency: 'USD',
					timestamp: new Date('2026-01-10').getTime(),
				},
				{
					id: 'tx-res-2',
					from_entity_id: 'account-2',
					to_entity_id: 'saving-1',
					amount_minor: 20000,
					currency: 'USD',
					timestamp: new Date('2026-01-11').getTime(),
				},
			];

			const savingEntities = getEntitiesWithBalance(
				[account, account2, saving1, saving2],
				[],
				txns,
				'2026-01',
				'saving'
			);

			// saving-1 should sum both accounts' transactions
			expect(savingEntities[0]!.actual).toBe(70000);
			// saving-2 has no transactions
			expect(savingEntities[1]!.actual).toBe(0);

			// Each account's reserved field should only reflect its own savings txns
			const accountEntities = getEntitiesWithBalance(
				[account, account2, saving1, saving2],
				[],
				txns,
				'2026-01',
				'account'
			);

			expect(accountEntities[0]!.reserved).toBe(50000); // account-1
			expect(accountEntities[1]!.reserved).toBe(20000); // account-2
		});
	});

	describe('Transaction confirmation (KII-65)', () => {
		const NOW = new Date('2026-04-15T12:00:00Z').getTime();

		const incomeEntity: Entity = {
			id: 'income-1',
			type: 'income',
			name: 'Salary',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const accountEntity: Entity = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const categoryEntity: Entity = {
			id: 'category-1',
			type: 'category',
			name: 'Groceries',
			currency: 'USD',
			row: 0,
			position: 0,
		};

		beforeEach(async () => {
			spyOn(Date, 'now').mockReturnValue(NOW);

			const entities = [incomeEntity, accountEntity, categoryEntity];
			useStore.setState({ entities });
			for (const entity of entities) {
				await db.createEntity(entity);
			}
		});

		afterEach(() => {
			mock.restore();
		});

		test('addTransaction: past-dated transaction is confirmed', async () => {
			await useStore.getState().addTransaction({
				id: 'tx-past',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now() - 86400000,
			});

			expect(useStore.getState().transactions[0]!.is_confirmed).toBe(true);
		});

		test('addTransaction: future-dated transaction is unconfirmed', async () => {
			await useStore.getState().addTransaction({
				id: 'tx-future',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
			});

			expect(useStore.getState().transactions[0]!.is_confirmed).toBe(false);
		});

		test('addTransaction: explicit is_confirmed is preserved', async () => {
			await useStore.getState().addTransaction({
				id: 'tx-explicit',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
				is_confirmed: true,
			});

			expect(useStore.getState().transactions[0]!.is_confirmed).toBe(true);
		});

		test('confirmTransaction: flips is_confirmed in store and DB', async () => {
			await useStore.getState().addTransaction({
				id: 'tx-unconfirmed',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
			});

			expect(useStore.getState().transactions[0]!.is_confirmed).toBe(false);

			await useStore.getState().confirmTransaction('tx-unconfirmed');

			expect(useStore.getState().transactions[0]!.is_confirmed).toBe(true);

			const dbTxns = await db.getAllTransactions();
			expect(dbTxns.find((t) => t.id === 'tx-unconfirmed')?.is_confirmed).toBe(true);
		});

		test('confirmAllDueTransactions: confirms only past-due unconfirmed', async () => {
			const now = Date.now();

			// Past unconfirmed (should be confirmed)
			await db.createTransaction({
				id: 'tx-past-unconfirmed',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 5000,
				currency: 'USD',
				timestamp: now - 86400000,
				is_confirmed: false,
			});

			// Future unconfirmed (should NOT be confirmed)
			await db.createTransaction({
				id: 'tx-future-unconfirmed',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 7500,
				currency: 'USD',
				timestamp: now + 86400000,
				is_confirmed: false,
			});

			// Past confirmed (should stay confirmed)
			await db.createTransaction({
				id: 'tx-past-confirmed',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: now - 86400000,
				is_confirmed: true,
			});

			useStore.setState({
				transactions: await db.getAllTransactions(),
			});

			await useStore.getState().confirmAllDueTransactions();

			const txns = useStore.getState().transactions;
			expect(txns.find((t) => t.id === 'tx-past-unconfirmed')?.is_confirmed).toBe(true);
			expect(txns.find((t) => t.id === 'tx-future-unconfirmed')?.is_confirmed).toBe(false);
			expect(txns.find((t) => t.id === 'tx-past-confirmed')?.is_confirmed).toBe(true);
		});

		test('getEntitiesWithBalance: unconfirmed past-due excluded from actual', () => {
			const now = Date.now();
			const txns: Transaction[] = [
				{
					id: 'tx-confirmed',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount_minor: 20000,
					currency: 'USD',
					timestamp: now - 86400000,
					is_confirmed: true,
				},
				{
					id: 'tx-unconfirmed',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount_minor: 30000,
					currency: 'USD',
					timestamp: now - 86400000,
					is_confirmed: false,
				},
			];

			const categories = getEntitiesWithBalance(
				[accountEntity, categoryEntity],
				[],
				txns,
				'2026-04',
				'category'
			);

			// Only the confirmed 200 should be in actual
			expect(categories[0]!.actual).toBe(20000);
			// The unconfirmed 300 should be in unconfirmed
			expect(categories[0]!.unconfirmed).toBe(30000);
		});

		test('updateTransaction: editing future tx date to past keeps is_confirmed false', async () => {
			// Create a future-dated transaction (auto-unconfirmed)
			await useStore.getState().addTransaction({
				id: 'tx-future-edit',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
			});

			expect(useStore.getState().transactions[0]!.is_confirmed).toBe(false);

			// Edit the date to the past — is_confirmed should stay false (needs manual confirm)
			await useStore.getState().updateTransaction('tx-future-edit', {
				timestamp: Date.now() - 86400000,
			});

			const tx = useStore.getState().transactions.find((t) => t.id === 'tx-future-edit');
			expect(tx?.is_confirmed).toBe(false);
			expect(tx?.timestamp).toBeLessThan(Date.now());
		});

		// KII-159: due-ness became a civil-day predicate, which moved an unconfirmed
		// occurrence dated LATER TODAY out of `upcoming` and into `unconfirmed` —
		// the one behavior change on this branch with money on screen. NOW is pinned
		// by this describe's beforeEach, so the "later today" fixture can't drift.
		test('getEntitiesWithBalance: unconfirmed later today counts as unconfirmed, not upcoming', () => {
			const nowLocal = new Date(NOW);
			// The last minute of the current LOCAL civil day: still ahead of NOW in
			// every timezone, but the same civil date, which is what `isDue` compares.
			const laterToday = new Date(
				nowLocal.getFullYear(),
				nowLocal.getMonth(),
				nowLocal.getDate(),
				23,
				59,
				0,
				0
			).getTime();
			expect(laterToday).toBeGreaterThan(NOW);

			const txns: Transaction[] = [
				{
					id: 'tx-later-today',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount_minor: 12500,
					currency: 'USD',
					timestamp: laterToday,
					is_confirmed: false,
				},
			];

			const categories = getEntitiesWithBalance(
				[accountEntity, categoryEntity],
				[],
				txns,
				'2026-04',
				'category'
			);

			expect(categories[0]!.unconfirmed).toBe(12500);
			expect(categories[0]!.upcoming).toBe(0);
			expect(categories[0]!.actual).toBe(0);
		});

		test('getEntitiesWithBalance: future unconfirmed stays in upcoming, not unconfirmed', () => {
			const now = Date.now();
			const futureTimestamp = now + 86400000 * 7;
			const futureDate = new Date(futureTimestamp);
			const period = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
			const txns: Transaction[] = [
				{
					id: 'tx-future',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount_minor: 15000,
					currency: 'USD',
					timestamp: futureTimestamp,
					is_confirmed: false,
				},
			];

			const categories = getEntitiesWithBalance(
				[accountEntity, categoryEntity],
				[],
				txns,
				period,
				'category'
			);

			expect(categories[0]!.actual).toBe(0);
			expect(categories[0]!.upcoming).toBe(15000);
			expect(categories[0]!.unconfirmed).toBe(0);
		});
	});

	describe('addRecurringTransaction', () => {
		test('does not mark notification permission as requested when reminders are disabled', async () => {
			const entities = [
				{
					id: 'entity-1',
					type: 'account' as const,
					name: 'Checking',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'entity-2',
					type: 'category' as const,
					name: 'Groceries',
					currency: 'USD',
					row: 0,
					position: 0,
				},
			];

			for (const entity of entities) {
				await db.createEntity(entity);
			}

			useStore.setState({ entities });
			await setRemindersEnabled(false);
			await setHasRequestedPermission(false);

			await useStore.getState().addRecurringTransaction(
				{
					from_entity_id: 'entity-1',
					to_entity_id: 'entity-2',
					amount_minor: 10000,
					currency: 'USD',
					timestamp: Date.now(),
				},
				{
					rule: { type: 'monthly' },
					endDate: null,
					endCount: null,
				}
			);

			expect(getHasRequestedPermission()).resolves.toBe(false);
		});

		test("materializes today's occurrence as an unconfirmed row, none in the future", async () => {
			const entities = [
				{
					id: 'entity-1',
					type: 'account' as const,
					name: 'Checking',
					currency: 'USD',
					row: 0,
					position: 0,
				},
				{
					id: 'entity-2',
					type: 'category' as const,
					name: 'Groceries',
					currency: 'USD',
					row: 0,
					position: 0,
				},
			];

			for (const entity of entities) {
				await db.createEntity(entity);
			}

			useStore.setState({ entities });

			const now = Date.now();

			await useStore.getState().addRecurringTransaction(
				{
					from_entity_id: 'entity-1',
					to_entity_id: 'entity-2',
					amount_minor: 10000,
					currency: 'USD',
					timestamp: now,
				},
				{
					rule: { type: 'monthly' },
					endDate: null,
					endCount: null,
				}
			);

			const state = useStore.getState();
			const seriesTxns = state.transactions.filter((t) => t.series_id);

			// The due occurrence (today) is materialized as an unconfirmed row —
			// user confirms it via the normal badge/confirmAll flow.
			expect(seriesTxns.length).toBe(1);
			const todayTxn = seriesTxns[0]!;
			expect(todayTxn.is_confirmed).toBe(false);

			// No future phantom rows — future occurrences are derived on demand.
			const futureTxns = seriesTxns.filter((t) => t.timestamp > now);
			expect(futureTxns.length).toBe(0);
		});

		test('addRecurringTransaction does not materialize future occurrences', async () => {
			const acc: Entity = {
				id: 'acc2',
				type: 'account',
				name: 'A',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const cat: Entity = {
				id: 'cat2',
				type: 'category',
				name: 'C',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			await db.createEntity(acc);
			await db.createEntity(cat);
			useStore.setState({ entities: [acc, cat], transactions: [], recurrenceTemplates: [] });

			const future = Date.now() + 7 * 86_400_000; // starts in 7 days
			await useStore.getState().addRecurringTransaction(
				{
					from_entity_id: 'acc2',
					to_entity_id: 'cat2',
					amount_minor: 800,
					currency: 'USD',
					timestamp: future,
				},
				{ rule: { type: 'monthly' }, endDate: null, endCount: null }
			);

			// Template created…
			expect(
				useStore.getState().recurrenceTemplates.some((t) => t.from_entity_id === 'acc2')
			).toBe(true);
			// …but NO future transaction rows materialized for it.
			const seriesId = useStore
				.getState()
				.recurrenceTemplates.find((t) => t.from_entity_id === 'acc2')!.id;
			const rows = (await db.getAllTransactions()).filter((t) => t.series_id === seriesId);
			expect(rows).toEqual([]);
		});
	});

	describe('Untested store actions', () => {
		const makeEntity = (
			id: string,
			type: Entity['type'],
			overrides: Partial<Entity> = {}
		): Entity => ({
			id,
			type,
			name: id,
			currency: 'USD',
			row: 0,
			position: 0,
			...overrides,
		});

		test('replaceAllData swaps imported data and clears recurrence templates', async () => {
			const oldAccount = makeEntity('old-account', 'account');
			const oldCategory = makeEntity('old-category', 'category', { position: 1 });
			const oldPlan: Plan = {
				id: 'old-plan',
				entity_id: oldCategory.id,
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 10000,
			};
			const oldTransaction: Transaction = {
				id: 'old-tx',
				from_entity_id: oldAccount.id,
				to_entity_id: oldCategory.id,
				amount_minor: 4000,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};
			const oldTemplate: RecurrenceTemplate = {
				id: 'old-series',
				from_entity_id: oldAccount.id,
				to_entity_id: oldCategory.id,
				amount_minor: 4000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-10').getTime(),
				created_at: Date.now(),
			};

			for (const entity of [oldAccount, oldCategory]) {
				await db.createEntity(entity);
			}
			await db.upsertPlan(oldPlan);
			await db.createTransaction(oldTransaction);
			await db.createRecurrenceTemplate(oldTemplate);

			const importedAccount = makeEntity('import-account', 'account');
			const importedCategory = makeEntity('import-category', 'category', { position: 1 });
			const importedEntities = [importedAccount, importedCategory];
			const importedPlans: Plan[] = [
				{
					id: 'import-plan',
					entity_id: importedCategory.id,
					period: 'all-time',
					period_start: '2026-02',
					planned_amount_minor: 25000,
				},
			];
			const importedTransactions: Transaction[] = [
				{
					id: 'import-tx',
					from_entity_id: importedAccount.id,
					to_entity_id: importedCategory.id,
					amount_minor: 7500,
					currency: 'USD',
					timestamp: new Date('2026-02-03').getTime(),
				},
			];
			const importedSnapshots: MarketValueSnapshot[] = [
				{
					id: 'import-snapshot',
					entity_id: importedAccount.id,
					amount_minor: 150000,
					currency: 'USD',
					date: new Date('2026-02-05').getTime(),
				},
			];

			await useStore
				.getState()
				.replaceAllData(
					importedEntities,
					importedPlans,
					importedTransactions,
					[],
					importedSnapshots
				);

			const state = useStore.getState();
			expect(state.entities.map((entity) => entity.id)).toEqual([
				'import-account',
				'import-category',
			]);
			expect(state.plans).toMatchObject(importedPlans);
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0]).toMatchObject(importedTransactions[0]!);
			expect(state.marketValueSnapshots).toMatchObject(importedSnapshots);
			expect(state.recurrenceTemplates).toEqual([]);

			expect((await db.getAllEntities()).map((entity) => entity.id)).toEqual([
				'import-account',
				'import-category',
			]);
			expect(await db.getAllRecurrenceTemplates()).toEqual([]);
		});

		// The "Reset All Data" settings action wipes via replaceAllData with empty
		// payloads, then re-hydrates. Guards the whole reset contract: every table
		// is emptied and only the system balance-adjustment entity comes back.
		test('replaceAllData with empty payloads wipes every table for a data reset', async () => {
			const account = makeEntity('reset-account', 'account');
			const category = makeEntity('reset-category', 'category', { position: 1 });
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}
			await db.upsertPlan({
				id: 'reset-plan',
				entity_id: category.id,
				period: 'all-time',
				period_start: '2026-01',
				planned_amount_minor: 10000,
			});
			await db.createTransaction({
				id: 'reset-tx',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 4000,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			});
			await db.createRecurrenceTemplate({
				id: 'reset-series',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 4000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-10').getTime(),
				created_at: Date.now(),
			});
			await db.addExclusion('reset-series', new Date('2026-02-10').getTime());
			await db.createMarketValueSnapshot({
				id: 'reset-snapshot',
				entity_id: account.id,
				amount_minor: 150000,
				currency: 'USD',
				date: new Date('2026-01-15').getTime(),
			});

			await useStore.getState().replaceAllData([], [], [], [], []);

			expect(await db.getAllEntities()).toEqual([]);
			expect(await db.getAllPlans()).toEqual([]);
			expect(await db.getAllTransactions()).toEqual([]);
			expect(await db.getAllRecurrenceTemplates()).toEqual([]);
			expect(await db.getAllMarketValueSnapshots()).toEqual([]);
			expect([...(await db.getAllExclusionsByTemplate()).keys()]).toEqual([]);

			const wiped = useStore.getState();
			expect(wiped.entities).toEqual([]);
			expect(wiped.plans).toEqual([]);
			expect(wiped.transactions).toEqual([]);
			expect(wiped.recurrenceTemplates).toEqual([]);
			expect(wiped.marketValueSnapshots).toEqual([]);

			// Re-hydration restores the system entity the wipe removed.
			await useStore.getState().initialize();
			expect(useStore.getState().entities.map((entity) => entity.id)).toEqual([
				BALANCE_ADJUSTMENT_ENTITY_ID,
			]);
		});

		// The wiped transactions carry scheduled notification ids, so the wipe has
		// to cancel them — "Reset All Data" relies on this happening in the store
		// rather than at the settings call site.
		test('replaceAllData cancels scheduled notifications and clears the badge', async () => {
			const cancelSpy = spyOn(notifications, 'cancelAllNotifications');
			const badgeSpy = spyOn(notifications, 'updateBadgeCount');

			try {
				await useStore.getState().replaceAllData([], [], [], [], []);

				expect(cancelSpy).toHaveBeenCalled();
				expect(badgeSpy).toHaveBeenCalledWith(0);
			} finally {
				cancelSpy.mockRestore();
				badgeSpy.mockRestore();
			}
		});

		// KII-159: derivation skips occurrences that are due and nothing else
		// materializes them here — `initialize` already stamped the civil-day
		// throttle, so a later `backfillRecurringIfStale()` short-circuits. Without
		// the backfill in `replaceAllData`, an imported occurrence dated today
		// exists in neither the virtual set nor the row set until a cold start.
		test('replaceAllData materializes due occurrences of imported templates', async () => {
			const account = makeEntity('imp-account', 'account');
			const category = makeEntity('imp-category', 'category', { position: 1 });
			// Daily series starting two days before the pinned instant: Aug 8, 9 and
			// 10 are all due, Aug 10 being "today" — the case that regressed.
			const start = new Date(2026, 7, 8, 15, 42, 0, 0).getTime();
			const template: RecurrenceTemplate = {
				id: 'imp-series',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 4000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'daily' }),
				start_date: start,
				end_date: null,
				end_count: null,
				created_at: start,
				exclusions: [],
			};

			const dateSpy = spyOn(Date, 'now').mockReturnValue(
				new Date(2026, 7, 10, 9, 0, 0, 0).getTime()
			);
			try {
				await useStore
					.getState()
					.replaceAllData([account, category], [], [], [template], []);

				expect(
					useStore
						.getState()
						.transactions.map((t) => t.id)
						.sort()
				).toEqual([
					'imp-series:2026-08-08',
					'imp-series:2026-08-09',
					'imp-series:2026-08-10',
				]);
				expect(await db.getTransactionsBySeriesId('imp-series')).toHaveLength(3);
			} finally {
				dateSpy.mockRestore();
			}
		});

		// `replaceAllData` clears the reminder fingerprint BEFORE cancelling, so a
		// re-import of identical data cannot compare equal to the stored key and
		// short-circuit — the OS schedule has just been emptied, and short-circuiting
		// would leave the user with no reminders at all (KII-159).
		test('re-importing identical data still schedules the reminders it cancelled', async () => {
			const account = makeEntity('reimport-account', 'account');
			const category = makeEntity('reimport-category', 'category', { position: 1 });
			// Noon three days out: a later civil day in every timezone, so the row is
			// upcoming and unconfirmed — exactly what earns a reminder.
			const d = new Date(Date.now() + 3 * 86_400_000);
			const upcoming = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
			const transaction: Transaction = {
				id: 'reimport-tx',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 7500,
				currency: 'USD',
				timestamp: upcoming.getTime(),
				is_confirmed: false,
			};
			const payload = () =>
				useStore.getState().replaceAllData([account, category], [], [transaction], [], []);

			const scheduleSpy = spyOn(notifications, 'scheduleTransactionNotification');
			await setRemindersEnabled(true);
			try {
				await payload();
				expect(scheduleSpy).toHaveBeenCalledTimes(1);
				expect(await getScheduledReminderKey()).not.toBeNull();
				scheduleSpy.mockClear();

				await payload();

				expect(scheduleSpy).toHaveBeenCalledTimes(1);
				expect(scheduleSpy.mock.calls[0]![0]).toMatchObject({
					transactionId: 'reimport-tx',
				});
			} finally {
				await setRemindersEnabled(false);
				await setScheduledReminderKey(null);
				scheduleSpy.mockRestore();
			}
		});

		test('reorderEntitiesByIds persists drag-and-drop row and position changes', async () => {
			const category1 = makeEntity('cat-1', 'category', { row: 0, position: 0 });
			const category2 = makeEntity('cat-2', 'category', { row: 1, position: 0 });
			const category3 = makeEntity('cat-3', 'category', { row: 0, position: 1 });

			for (const entity of [category1, category2, category3]) {
				await db.createEntity(entity);
			}

			useStore.setState({
				entities: [category1, category2, category3],
				plans: [],
				transactions: [],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
			});

			await useStore
				.getState()
				.reorderEntitiesByIds('category', ['cat-3', 'cat-1', 'cat-2'], 2);

			const state = useStore.getState();
			expect(state.entities.find((entity) => entity.id === 'cat-3')).toMatchObject({
				row: 0,
				position: 0,
			});
			expect(state.entities.find((entity) => entity.id === 'cat-1')).toMatchObject({
				row: 1,
				position: 0,
			});
			expect(state.entities.find((entity) => entity.id === 'cat-2')).toMatchObject({
				row: 0,
				position: 1,
			});

			const dbEntities = await db.getEntitiesByType('category');
			expect(dbEntities.find((entity) => entity.id === 'cat-3')).toMatchObject({
				row: 0,
				position: 0,
			});
			expect(dbEntities.find((entity) => entity.id === 'cat-1')).toMatchObject({
				row: 1,
				position: 0,
			});
			expect(dbEntities.find((entity) => entity.id === 'cat-2')).toMatchObject({
				row: 0,
				position: 1,
			});
		});

		test('updateEntityWithOptions deletes related market value snapshots from store and DB', async () => {
			const investment = makeEntity('investment-1', 'account', { is_investment: true });
			const other = makeEntity('investment-2', 'account', {
				is_investment: true,
				position: 1,
			});
			const updatedInvestment = { ...investment, name: 'Updated investment' };

			for (const entity of [investment, other]) {
				await db.createEntity(entity);
			}

			const snapshots: MarketValueSnapshot[] = [
				{
					id: 'snap-1',
					entity_id: investment.id,
					amount_minor: 100000,
					currency: 'USD',
					date: new Date('2026-01-01').getTime(),
				},
				{
					id: 'snap-2',
					entity_id: other.id,
					amount_minor: 200000,
					currency: 'USD',
					date: new Date('2026-01-02').getTime(),
				},
			];

			for (const snapshot of snapshots) {
				await db.createMarketValueSnapshot(snapshot);
			}

			useStore.setState({
				entities: [investment, other],
				plans: [],
				transactions: [],
				recurrenceTemplates: [],
				marketValueSnapshots: snapshots,
			});

			await useStore
				.getState()
				.updateEntityWithOptions(updatedInvestment, { deleteMarketValueSnapshots: true });

			expect(
				useStore.getState().entities.find((entity) => entity.id === investment.id)?.name
			).toBe('Updated investment');
			expect(useStore.getState().marketValueSnapshots).toMatchObject([snapshots[1]!]);
			expect(await db.getMarketValueSnapshots(investment.id)).toEqual([]);
			expect(await db.getMarketValueSnapshots(other.id)).toMatchObject([snapshots[1]!]);
		});

		test('setDefaultAccount keeps only one default account and can clear it', async () => {
			const account1 = makeEntity('account-1', 'account', { is_default: true });
			const account2 = makeEntity('account-2', 'account', { position: 1 });
			const category = makeEntity('category-1', 'category');

			for (const entity of [account1, account2, category]) {
				await db.createEntity(entity);
			}
			await db.updateEntity(account1);

			useStore.setState({
				entities: [account1, account2, category],
				plans: [],
				transactions: [],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
			});

			await useStore.getState().setDefaultAccount(account2.id);

			let dbAccounts = await db.getEntitiesByType('account');
			expect(dbAccounts.find((entity) => entity.id === account1.id)?.is_default).toBe(false);
			expect(dbAccounts.find((entity) => entity.id === account2.id)?.is_default).toBe(true);
			expect(
				useStore.getState().entities.find((entity) => entity.id === account1.id)?.is_default
			).toBe(false);
			expect(
				useStore.getState().entities.find((entity) => entity.id === account2.id)?.is_default
			).toBe(true);

			await useStore.getState().setDefaultAccount(null);

			dbAccounts = await db.getEntitiesByType('account');
			expect(
				dbAccounts.some(
					(entity) => entity.id !== BALANCE_ADJUSTMENT_ENTITY_ID && entity.is_default
				)
			).toBe(false);
		});

		// KII-113: previously the clear-then-set used two separate awaits, so a
		// crash between them could leave the user with no default. Both ops are
		// now in a single drizzle transaction with an in-transaction existence
		// check; a missing id throws AFTER the clear, forcing rollback. The
		// bogus id here exercises that rollback path — if anyone refactors
		// setDefaultAccount back to two separate awaits, the clear would commit
		// and account1 would lose its default, failing this test.
		test('setDefaultAccount is atomic: mid-transaction failure preserves old default', async () => {
			const account1 = makeEntity('account-1', 'account', { is_default: true });
			const account2 = makeEntity('account-2', 'account', { position: 1 });

			for (const entity of [account1, account2]) {
				await db.createEntity(entity);
			}

			useStore.setState({
				entities: [account1, account2],
				plans: [],
				transactions: [],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
			});

			await expect(useStore.getState().setDefaultAccount('does-not-exist')).rejects.toThrow(
				/does not exist/
			);

			const dbAccounts = await db.getEntitiesByType('account');
			expect(dbAccounts.find((entity) => entity.id === account1.id)?.is_default).toBe(true);
			expect(dbAccounts.find((entity) => entity.id === account2.id)?.is_default).toBe(false);

			const storeEntities = useStore.getState().entities;
			expect(storeEntities.find((entity) => entity.id === account1.id)?.is_default).toBe(
				true
			);
			expect(
				storeEntities.find((entity) => entity.id === account2.id)?.is_default
			).toBeFalsy();
		});

		test('updateTransactionWithScope updates recurrence template and future transactions only', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			const template: RecurrenceTemplate = {
				id: 'series-1',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				note: 'Original',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-01').getTime(),
				created_at: Date.now(),
			};
			const transactions: Transaction[] = [
				{
					id: 'series-tx-1',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-01-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'series-tx-2',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-02-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'series-tx-3',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-03-01').getTime(),
					series_id: template.id,
				},
			];

			await db.createRecurrenceTemplate(template);
			await db.createTransactionBatch(transactions);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions,
				recurrenceTemplates: [template],
				marketValueSnapshots: [],
			});

			await useStore
				.getState()
				.updateTransactionWithScope(
					'series-tx-2',
					{ amount_minor: 25000, note: 'Updated future' },
					'future'
				);

			const dbSeries = await db.getTransactionsBySeriesId(template.id);
			expect(dbSeries.find((tx) => tx.id === 'series-tx-1')).toMatchObject({
				amount_minor: 10000,
				note: null,
			});
			expect(dbSeries.find((tx) => tx.id === 'series-tx-2')).toMatchObject({
				amount_minor: 25000,
				note: 'Updated future',
			});
			expect(dbSeries.find((tx) => tx.id === 'series-tx-3')).toMatchObject({
				amount_minor: 25000,
				note: 'Updated future',
			});

			const updatedTemplate = await db.getRecurrenceTemplateById(template.id);
			expect(updatedTemplate).toMatchObject({ amount_minor: 25000, note: 'Updated future' });
		});

		test('updateTransactionWithScope future preserves existing in-memory exclusions', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			const excludedTimestamp = new Date('2026-02-01').getTime();
			const template: RecurrenceTemplate = {
				id: 'series-future-edit-preserve-exclusions',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-01').getTime(),
				created_at: Date.now(),
			};
			const transactions: Transaction[] = [
				{
					id: 'preserve-edit-tx-1',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-01-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'preserve-edit-tx-3',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-03-01').getTime(),
					series_id: template.id,
				},
			];

			await db.createRecurrenceTemplate(template);
			await db.addExclusion(template.id, excludedTimestamp);
			await db.createTransactionBatch(transactions);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions,
				recurrenceTemplates: [{ ...template, exclusions: [excludedTimestamp] }],
				marketValueSnapshots: [],
			});

			await useStore
				.getState()
				.updateTransactionWithScope(
					'preserve-edit-tx-3',
					{ amount_minor: 25000 },
					'future'
				);

			expect(
				useStore.getState().recurrenceTemplates.find((item) => item.id === template.id)
					?.exclusions
			).toEqual([excludedTimestamp]);
		});

		test('updateTransactionWithScope future still applies to the rows when the template is gone', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			// Two materialized occurrences sharing an orphaned series_id (the template
			// row no longer exists — series_id has no FK, e.g. after an import dropped
			// the template). "Update all future" must still write to the surviving
			// occurrences instead of silently no-opping. Mirrors the delete/split
			// orphan tolerance fixed in this branch.
			const earlier: Transaction = {
				id: 'orphan-update-1',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date('2026-01-01').getTime(),
				series_id: 'ghost-template',
			};
			const later: Transaction = {
				id: 'orphan-update-2',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date('2026-02-01').getTime(),
				series_id: 'ghost-template',
			};
			await db.createTransactionBatch([earlier, later]);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [earlier, later],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
			});

			await useStore
				.getState()
				.updateTransactionWithScope('orphan-update-2', { amount_minor: 25000 }, 'future');

			const dbSeries = await db.getTransactionsBySeriesId('ghost-template');
			// The earlier occurrence is untouched…
			expect(dbSeries.find((t) => t.id === 'orphan-update-1')).toMatchObject({
				amount_minor: 10000,
			});
			// …the selected one and onward are updated.
			expect(dbSeries.find((t) => t.id === 'orphan-update-2')).toMatchObject({
				amount_minor: 25000,
			});
			// Store mirror agrees with the DB.
			const storeLater = useStore
				.getState()
				.transactions.find((t) => t.id === 'orphan-update-2');
			expect(storeLater?.amount_minor).toBe(25000);
		});

		test('deleteTransactionWithScope future truncates the series from the selected occurrence', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			const template: RecurrenceTemplate = {
				id: 'series-2',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-01').getTime(),
				created_at: Date.now(),
			};
			const transactions: Transaction[] = [
				{
					id: 'truncate-tx-1',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-01-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'truncate-tx-2',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-02-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'truncate-tx-3',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-03-01').getTime(),
					series_id: template.id,
				},
			];

			await db.createRecurrenceTemplate(template);
			await db.createTransactionBatch(transactions);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions,
				recurrenceTemplates: [template],
				marketValueSnapshots: [],
			});

			await useStore.getState().deleteTransactionWithScope('truncate-tx-2', 'future');

			expect((await db.getTransactionsBySeriesId(template.id)).map((tx) => tx.id)).toEqual([
				'truncate-tx-1',
			]);
			expect(await db.getRecurrenceTemplateById(template.id)).toMatchObject({
				end_date: new Date('2026-01-01').getTime(),
				is_deleted: false,
			});
		});

		test('deleteTransactionWithScope future preserves existing in-memory exclusions when truncating', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			const excludedTimestamp = new Date('2026-02-01').getTime();
			const template: RecurrenceTemplate = {
				id: 'series-future-delete-preserve-exclusions',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-01').getTime(),
				created_at: Date.now(),
			};
			const transactions: Transaction[] = [
				{
					id: 'preserve-delete-tx-1',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-01-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'preserve-delete-tx-3',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-03-01').getTime(),
					series_id: template.id,
				},
			];

			await db.createRecurrenceTemplate(template);
			await db.addExclusion(template.id, excludedTimestamp);
			await db.createTransactionBatch(transactions);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions,
				recurrenceTemplates: [{ ...template, exclusions: [excludedTimestamp] }],
				marketValueSnapshots: [],
			});

			await useStore.getState().deleteTransactionWithScope('preserve-delete-tx-3', 'future');

			expect(
				useStore.getState().recurrenceTemplates.find((item) => item.id === template.id)
					?.exclusions
			).toEqual([excludedTimestamp]);
		});

		test('deleteTransactionWithScope single removes one occurrence and appends an exclusion', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			const deletedTimestamp = new Date('2026-02-01').getTime();
			const template: RecurrenceTemplate = {
				id: 'series-single-delete',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-01').getTime(),
				created_at: Date.now(),
			};
			const transactions: Transaction[] = [
				{
					id: 'single-delete-tx-1',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-01-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'single-delete-tx-2',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: deletedTimestamp,
					series_id: template.id,
				},
				{
					id: 'single-delete-tx-3',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-03-01').getTime(),
					series_id: template.id,
				},
			];

			await db.createRecurrenceTemplate(template);
			await db.createTransactionBatch(transactions);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions,
				recurrenceTemplates: [template],
				marketValueSnapshots: [],
			});

			await useStore.getState().deleteTransactionWithScope('single-delete-tx-2', 'single');

			expect((await db.getTransactionsBySeriesId(template.id)).map((tx) => tx.id)).toEqual([
				'single-delete-tx-1',
				'single-delete-tx-3',
			]);
			expect(useStore.getState().transactions.map((tx) => tx.id)).toEqual([
				'single-delete-tx-1',
				'single-delete-tx-3',
			]);

			// DB-side: read from the normalized exclusions table (KII-123).
			expect(await db.getExclusionsForTemplate(template.id)).toEqual([deletedTimestamp]);
			// In-memory: the store keeps exclusions on each template as number[].
			expect(
				useStore.getState().recurrenceTemplates.find((item) => item.id === template.id)
					?.exclusions ?? []
			).toEqual([deletedTimestamp]);
		});

		test('deleting a single occurrence whose template is gone still removes the row', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			// A recurring occurrence whose series template no longer exists.
			// series_id has no FK constraint, so this orphaned state is representable
			// (e.g. after a partial import or template removal). The row shows up in
			// "Needs Confirmation" (is_confirmed: false, past-due) and the user swipes
			// to delete it.
			const orphan: Transaction = {
				id: 'orphan-occurrence',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now() - 86_400_000,
				series_id: 'ghost-template',
				is_confirmed: false,
			};
			await db.createTransaction(orphan);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [orphan],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
			});

			// Deleting a single occurrence must succeed even though the template is
			// missing — there is no series left to resurrect it, so the exclusion is
			// moot. Today this rejects with "recurrence template ghost-template not
			// found", which surfaces as the "Could not delete" alert.
			await useStore.getState().deleteTransactionWithScope('orphan-occurrence', 'single');

			expect(useStore.getState().transactions.map((t) => t.id)).not.toContain(
				'orphan-occurrence'
			);
			expect((await db.getAllTransactions()).map((t) => t.id)).not.toContain(
				'orphan-occurrence'
			);
		});

		test('deleting future occurrences whose template is gone removes the rows and no-ops the soft-delete', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			// Two materialized occurrences sharing an orphaned series_id (template
			// row gone). "Delete this and all future" must remove the selected row
			// and the later one; softDeleteRecurrenceTemplate on the missing template
			// returns null and the state map is a no-op rather than throwing.
			const earlier: Transaction = {
				id: 'orphan-future-1',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date('2026-01-01').getTime(),
				series_id: 'ghost-template',
			};
			const later: Transaction = {
				id: 'orphan-future-2',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date('2026-02-01').getTime(),
				series_id: 'ghost-template',
			};
			await db.createTransactionBatch([earlier, later]);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [earlier, later],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
			});

			await useStore.getState().deleteTransactionWithScope('orphan-future-1', 'future');

			const remainingIds = useStore.getState().transactions.map((t) => t.id);
			expect(remainingIds).not.toContain('orphan-future-1');
			expect(remainingIds).not.toContain('orphan-future-2');
			expect((await db.getTransactionsBySeriesId('ghost-template')).map((t) => t.id)).toEqual(
				[]
			);
		});

		test('deleting a single future (virtual) occurrence removes it from the derived list and it stays gone', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			// Anchor everything to "now" so the derivation produces *future* virtual
			// occurrences (KII-136: future occurrences are derived, never materialized).
			const now = Date.now();
			const DAY = 86_400_000;
			const template: RecurrenceTemplate = {
				id: 'series-virtual-delete',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'daily' }),
				start_date: now - 2 * DAY,
				created_at: now,
				exclusions: [],
			};
			await db.createRecurrenceTemplate(template);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [],
				recurrenceTemplates: [{ ...template }],
				marketValueSnapshots: [],
			});

			const rangeStart = now;
			const rangeEnd = now + 7 * DAY;
			const deriveForState = () => {
				const tmpl = useStore.getState().recurrenceTemplates;
				const exclusionsByTemplate = new Map(
					tmpl.map((t) => [t.id, new Set((t.exclusions ?? []).map(toCivilDate))])
				);
				return deriveVirtualOccurrences(
					tmpl,
					exclusionsByTemplate,
					useStore.getState().transactions,
					rangeStart,
					rangeEnd,
					now
				);
			};

			const before = deriveForState();
			// Pick the occurrence three days out — the one the user swipes to delete.
			const target = before.find(
				(o) => toCivilDate(o.timestamp) === toCivilDate(now + 3 * DAY)
			);
			expect(target).toBeDefined();
			expect(target!.isVirtual).toBe(true);

			// This is exactly what the row/modal delete handler does for a virtual
			// occurrence with scope 'single': record an exclusion, no row to delete.
			await useStore.getState().excludeOccurrence(target!);

			const after = deriveForState();
			const targetCivil = toCivilDate(now + 3 * DAY);
			// The deleted occurrence must be gone…
			expect(after.map((o) => toCivilDate(o.timestamp))).not.toContain(targetCivil);
			// …and its neighbours must survive.
			expect(after.map((o) => toCivilDate(o.timestamp))).toContain(
				toCivilDate(now + 2 * DAY)
			);
			expect(after.map((o) => toCivilDate(o.timestamp))).toContain(
				toCivilDate(now + 4 * DAY)
			);
			// Exactly one fewer occurrence than before.
			expect(after.length).toBe(before.length - 1);

			// And the exclusion is durably recorded in the DB (survives a reload).
			expect(await db.getExclusionsForTemplate(template.id)).toContain(target!.timestamp);
		});

		test('deleting a single past-due (materialized) occurrence is not resurrected by a later backfill', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}
			// The shared beforeEach does not reset recurrenceTemplates, so clear it
			// here to keep this series the only template in the store.
			useStore.setState({
				entities: [account, category],
				transactions: [],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
			});

			const now = Date.now();
			const DAY = 86_400_000;
			// Daily series starting 5 days ago → backfill materializes the past-due
			// occurrences as unconfirmed rows (the ones shown in the list).
			await useStore.getState().addRecurringTransaction(
				{
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: now - 5 * DAY,
				},
				{ rule: { type: 'daily' } }
			);

			const templates = useStore.getState().recurrenceTemplates;
			expect(templates).toHaveLength(1);
			const seriesId = templates[0]!.id;
			const materialized = useStore
				.getState()
				.transactions.filter((t) => t.series_id === seriesId);
			// Sanity: backfill created the past-due rows.
			expect(materialized.length).toBeGreaterThanOrEqual(3);

			// Delete a specific past-due occurrence — the one three days before now,
			// which the daily series (started 5 days ago) definitely materialized.
			// Pin by civil date rather than sort index so reordering can't silently
			// retarget the test.
			const targetCivilDay = toCivilDate(now - 3 * DAY);
			const target = materialized.find((t) => toCivilDate(t.timestamp) === targetCivilDay);
			expect(target).toBeDefined();
			expect(target!.isVirtual).toBeFalsy();
			const targetCivil = toCivilDate(target!.timestamp);
			await useStore.getState().deleteTransactionWithScope(target!.id, 'single');

			// Gone from the store and the DB right after delete.
			expect(useStore.getState().transactions.map((t) => t.id)).not.toContain(target!.id);
			expect((await db.getTransactionsBySeriesId(seriesId)).map((t) => t.id)).not.toContain(
				target!.id
			);

			// Now force another backfill (simulates an app foreground). The deleted
			// occurrence must NOT come back.
			_resetBackfillThrottleForTests();
			// backfillRecurringIfStale no-ops unless isFullyHydrated (KII-144); the
			// shared beforeEach now resets it to false, so it must be set here for
			// this call to actually run instead of passing vacuously.
			useStore.setState({ isFullyHydrated: true });
			await useStore.getState().backfillRecurringIfStale();

			const afterCivilDates = (await db.getTransactionsBySeriesId(seriesId)).map((t) =>
				toCivilDate(t.timestamp)
			);
			expect(afterCivilDates).not.toContain(targetCivil);
		});

		test('deleteTransactionWithScope future soft-deletes the template when no occurrences remain', async () => {
			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			const template: RecurrenceTemplate = {
				id: 'series-3',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-01').getTime(),
				created_at: Date.now(),
			};
			const transactions: Transaction[] = [
				{
					id: 'delete-all-tx-1',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-01-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'delete-all-tx-2',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-02-01').getTime(),
					series_id: template.id,
				},
			];

			await db.createRecurrenceTemplate(template);
			await db.createTransactionBatch(transactions);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions,
				recurrenceTemplates: [template],
				marketValueSnapshots: [],
			});

			await useStore.getState().deleteTransactionWithScope('delete-all-tx-1', 'future');

			expect(await db.getTransactionsBySeriesId(template.id)).toEqual([]);
			expect(await db.getRecurrenceTemplateById(template.id)).toMatchObject({
				is_deleted: true,
			});
		});

		test('deactivateTemplatesForEntity removes future occurrences and soft-deletes affected templates', async () => {
			const now = new Date('2026-01-15').getTime();
			spyOn(Date, 'now').mockReturnValue(now);

			const account = makeEntity('account-1', 'account');
			const category = makeEntity('category-1', 'category');
			for (const entity of [account, category]) {
				await db.createEntity(entity);
			}

			const template: RecurrenceTemplate = {
				id: 'series-4',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: new Date('2026-01-01').getTime(),
				created_at: now,
			};
			const transactions: Transaction[] = [
				{
					id: 'deactivate-past',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-01-01').getTime(),
					series_id: template.id,
				},
				{
					id: 'deactivate-future',
					from_entity_id: account.id,
					to_entity_id: category.id,
					amount_minor: 10000,
					currency: 'USD',
					timestamp: new Date('2026-02-01').getTime(),
					series_id: template.id,
				},
			];

			await db.createRecurrenceTemplate(template);
			await db.createTransactionBatch(transactions);

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions,
				recurrenceTemplates: [template],
				marketValueSnapshots: [],
			});

			await useStore.getState().deactivateTemplatesForEntity(account.id);

			expect((await db.getTransactionsBySeriesId(template.id)).map((tx) => tx.id)).toEqual([
				'deactivate-past',
			]);
			expect(await db.getRecurrenceTemplateById(template.id)).toMatchObject({
				is_deleted: true,
			});
			expect(useStore.getState().transactions.map((tx) => tx.id)).toEqual([
				'deactivate-past',
			]);

			mock.restore();
		});
	});

	describe('Investment Accounts', () => {
		const investmentAccount: Entity = {
			id: 'inv-account',
			type: 'account',
			name: 'Brokerage',
			currency: 'USD',
			row: 0,
			position: 0,
			is_investment: true,
		};

		const normalAccount: Entity = {
			id: 'norm-account',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			row: 0,
			position: 0,
			is_investment: false,
		};

		test('getEntitiesWithBalance includes latestMarketValue for investment accounts', () => {
			const snapshots = [
				{
					id: 'snap-1',
					entity_id: 'inv-account',
					amount_minor: 500000,
					currency: 'USD',
					date: new Date('2026-01-01').getTime(),
				},
				{
					id: 'snap-2',
					entity_id: 'inv-account',
					amount_minor: 750000,
					currency: 'USD',
					date: new Date('2026-02-01').getTime(),
				},
			];

			const result = getEntitiesWithBalance(
				[investmentAccount, normalAccount],
				[],
				[],
				'2026-01',
				'account',
				snapshots
			);

			const inv = result.find((e) => e.id === 'inv-account');
			const norm = result.find((e) => e.id === 'norm-account');

			expect(inv?.latestMarketValue).toBe(750000);
			expect(norm?.latestMarketValue).toBeNull();
		});

		test('getEntitiesWithBalance returns null latestMarketValue when no snapshots', () => {
			const result = getEntitiesWithBalance(
				[investmentAccount],
				[],
				[],
				'2026-01',
				'account',
				[]
			);

			expect(result[0]!.latestMarketValue).toBeNull();
		});

		test('getEntitiesWithBalance ignores snapshots for non-investment accounts', () => {
			const snapshots = [
				{
					id: 'snap-1',
					entity_id: 'norm-account',
					amount_minor: 999900,
					currency: 'USD',
					date: new Date('2026-01-01').getTime(),
				},
			];

			const result = getEntitiesWithBalance(
				[normalAccount],
				[],
				[],
				'2026-01',
				'account',
				snapshots
			);

			expect(result[0]!.latestMarketValue).toBeNull();
		});

		test('store actions manage market value snapshots', async () => {
			resetDrizzleDb();
			await db.createEntity(investmentAccount);

			const snapshot = {
				id: 'snap-1',
				entity_id: 'inv-account',
				amount_minor: 300000,
				currency: 'USD',
				date: Date.now(),
			};

			await useStore.getState().addMarketValueSnapshot(snapshot);
			expect(useStore.getState().marketValueSnapshots).toContainEqual(
				expect.objectContaining(snapshot)
			);

			await useStore.getState().updateMarketValueSnapshot('snap-1', { amount_minor: 350000 });
			expect(
				useStore.getState().marketValueSnapshots.find((s) => s.id === 'snap-1')
					?.amount_minor
			).toBe(350000);

			await useStore.getState().deleteMarketValueSnapshot('snap-1');
			expect(
				useStore.getState().marketValueSnapshots.find((s) => s.id === 'snap-1')
			).toBeUndefined();
		});
	});

	describe('backfillRecurringIfStale', () => {
		const account: Entity = {
			id: 'bf-acct',
			type: 'account',
			name: 'Bank',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const category: Entity = {
			id: 'bf-cat',
			type: 'category',
			name: 'Bills',
			currency: 'USD',
			row: 0,
			position: 1,
		};

		const seedTemplate = async (): Promise<RecurrenceTemplate> => {
			await db.createEntity(account);
			await db.createEntity(category);
			const template: RecurrenceTemplate = {
				id: 'bf-tmpl',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 5000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'daily' }),
				start_date: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
				end_date: null,
				end_count: null,
				created_at: Date.now(),
			};
			await db.createRecurrenceTemplate(template);
			useStore.setState({
				entities: [account, category],
				recurrenceTemplates: [template],
				transactions: [],
			});
			return template;
		};

		beforeEach(() => {
			_resetBackfillThrottleForTests();
			// These tests call backfillRecurringIfStale directly (bypassing
			// initialize's phase 1/2 dance), so the gate it added (KII-144) must
			// be pre-satisfied here rather than left to leak in from elsewhere.
			useStore.setState({ isFullyHydrated: true });
		});

		test('materializes missing occurrences when throttle is cold', async () => {
			await seedTemplate();
			// `lastBackfillAt` was reset to 0, so the freshness check passes.
			await useStore.getState().backfillRecurringIfStale();
			const txs = useStore.getState().transactions;
			const count = txs.length;
			// Template starts 10 days ago; with past-due-only backfill (horizonDays: 0)
			// we expect ~10-11 daily rows (one per day up to today), not future rows.
			expect(count).toBeGreaterThan(5);
			// No future rows — all timestamps must be ≤ now.
			expect(txs.every((t) => t.timestamp <= Date.now())).toBe(true);
		});

		test('is throttled within 24h of the previous run', async () => {
			await seedTemplate();
			await useStore.getState().backfillRecurringIfStale();
			const afterFirst = useStore.getState().transactions.length;
			expect(afterFirst).toBeGreaterThan(0);

			// Drop one row so a real second backfill would visibly repopulate it.
			useStore.setState((state) => ({
				transactions: state.transactions.slice(0, -1),
			}));

			// Same wall-clock instant → throttle skips.
			await useStore.getState().backfillRecurringIfStale();
			expect(useStore.getState().transactions.length).toBe(afterFirst - 1);
		});

		test('resumes generating once the throttle expires', async () => {
			await seedTemplate();
			await useStore.getState().backfillRecurringIfStale();
			const afterFirst = useStore.getState().transactions.length;
			expect(afterFirst).toBeGreaterThan(0);

			// Simulate 24h+ elapsed by resetting the throttle. Keep in-memory state
			// intact (as it would be after a re-initialize from DB), so the civil-date
			// dedup correctly identifies existing rows and adds nothing new.
			_resetBackfillThrottleForTests();
			await useStore.getState().backfillRecurringIfStale();

			// No new rows — deterministic ids mean no duplicates are inserted.
			expect(useStore.getState().transactions.length).toBe(afterFirst);
		});

		test('backfill runs again after the civil day rolls over, not after a fixed 24h window (KII-159)', async () => {
			const acc: Entity = {
				id: 'straddle-acc',
				type: 'account',
				name: 'A',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const cat: Entity = {
				id: 'straddle-cat',
				type: 'category',
				name: 'C',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			await db.createEntity(acc);
			await db.createEntity(cat);

			// Daily series starting Aug 1. By Aug 2 23:00 only Aug 1 and Aug 2 are due;
			// Aug 3's occurrence becomes due only once the civil day rolls over.
			const start = new Date(2026, 7, 1, 9, 0, 0, 0).getTime();
			const template: RecurrenceTemplate = {
				id: 'straddle-tmpl',
				from_entity_id: acc.id,
				to_entity_id: cat.id,
				amount_minor: 1000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'daily' }),
				start_date: start,
				end_date: null,
				end_count: null,
				created_at: start,
			};
			await db.createRecurrenceTemplate(template);
			useStore.setState({
				entities: [acc, cat],
				recurrenceTemplates: [template],
				transactions: [],
			});

			const aug3Id = `${template.id}:2026-08-03`;
			const dateSpy = spyOn(Date, 'now');
			try {
				// First run, 23:00 on Aug 2: materializes Aug 1 and Aug 2. Aug 3 is not
				// due yet.
				dateSpy.mockReturnValue(new Date(2026, 7, 2, 23, 0, 0, 0).getTime());
				await useStore.getState().backfillRecurringIfStale();
				expect(useStore.getState().transactions.some((t) => t.id === aug3Id)).toBe(false);
				const afterFirst = useStore.getState().transactions.length;
				expect(afterFirst).toBeGreaterThan(0);

				// Same civil day, 30 minutes later: throttled. (A 24h duration throttle
				// would also block here, so this step alone doesn't discriminate the
				// fix — the next one does.)
				dateSpy.mockReturnValue(new Date(2026, 7, 2, 23, 30, 0, 0).getTime());
				await useStore.getState().backfillRecurringIfStale();
				expect(useStore.getState().transactions.length).toBe(afterFirst);

				// 5 minutes into Aug 3 — only 65 minutes after the last run, nowhere near
				// a 24h window, but the civil day has rolled over. The civil-day throttle
				// must run again and materialize Aug 3's occurrence; the old 24h-duration
				// throttle would still be blocking at this point.
				dateSpy.mockReturnValue(new Date(2026, 7, 3, 0, 5, 0, 0).getTime());
				await useStore.getState().backfillRecurringIfStale();
				expect(useStore.getState().transactions.some((t) => t.id === aug3Id)).toBe(true);
			} finally {
				dateSpy.mockRestore();
			}
		});

		test("materializes today's occurrence even before its own time-of-day has arrived (KII-159)", async () => {
			const acc: Entity = {
				id: 'mid-acc',
				type: 'account',
				name: 'A',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const cat: Entity = {
				id: 'mid-cat',
				type: 'category',
				name: 'C',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			await db.createEntity(acc);
			await db.createEntity(cat);

			// Daily series whose occurrences land at 15:42 local.
			const start = new Date(2026, 7, 1, 15, 42, 0, 0).getTime();
			const template: RecurrenceTemplate = {
				id: 'mid-tmpl',
				from_entity_id: acc.id,
				to_entity_id: cat.id,
				amount_minor: 1000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'daily' }),
				start_date: start,
				end_date: null,
				end_count: null,
				created_at: start,
			};
			await db.createRecurrenceTemplate(template);
			useStore.setState({
				entities: [acc, cat],
				recurrenceTemplates: [template],
				transactions: [],
			});

			const dateSpy = spyOn(Date, 'now');
			try {
				// 00:30 on the 3rd — hours before today's 15:42 occurrence would fire,
				// but it is already due (KII-159: due-ness is a civil-day comparison).
				const now = new Date(2026, 7, 3, 0, 30, 0, 0).getTime();
				dateSpy.mockReturnValue(now);

				await useStore.getState().backfillRecurringIfStale();

				const todayId = `${template.id}:2026-08-03`;
				const row = useStore.getState().transactions.find((t) => t.id === todayId);
				expect(row).toBeDefined();
				// The materialized row's own timestamp is still later today — it was
				// materialized ahead of its time-of-day, not "in the past".
				expect(row!.timestamp).toBeGreaterThan(now);
			} finally {
				dateSpy.mockRestore();
			}
		});

		// KII-159: the midnight timer exists to materialize occurrences the moment
		// they become due. Those rows are unconfirmed AND due, so they raise the
		// unconfirmed count — the OS badge has to move with them, not wait for the
		// next confirm, cold start or hourly background task.
		test('refreshes the OS badge as well as the reminders', async () => {
			const acc: Entity = {
				id: 'badge-acc',
				type: 'account',
				name: 'A',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const cat: Entity = {
				id: 'badge-cat',
				type: 'category',
				name: 'C',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			await db.createEntity(acc);
			await db.createEntity(cat);

			// Daily series starting two days ago: Aug 8, 9 and 10 are due at the
			// pinned instant, so exactly three rows are materialized.
			const start = new Date(2026, 7, 8, 9, 0, 0, 0).getTime();
			const template: RecurrenceTemplate = {
				id: 'badge-tmpl',
				from_entity_id: acc.id,
				to_entity_id: cat.id,
				amount_minor: 1000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'daily' }),
				start_date: start,
				end_date: null,
				end_count: null,
				created_at: start,
				exclusions: [],
			};
			await db.createRecurrenceTemplate(template);
			useStore.setState({
				entities: [acc, cat],
				recurrenceTemplates: [template],
				transactions: [],
			});

			const badgeSpy = spyOn(notifications, 'updateBadgeCount');
			const dateSpy = spyOn(Date, 'now').mockReturnValue(
				new Date(2026, 7, 10, 12, 0, 0, 0).getTime()
			);
			await setRemindersEnabled(true);
			try {
				await useStore.getState().backfillRecurringIfStale();

				expect(useStore.getState().transactions).toHaveLength(3);
				expect(badgeSpy).toHaveBeenCalledWith(3);
			} finally {
				await setRemindersEnabled(false);
				dateSpy.mockRestore();
				badgeSpy.mockRestore();
			}
		});

		// Both call sites dispatch with `void` (the foreground listener and the
		// midnight timer), and the civil-date guard is only stamped after the await,
		// so two overlapping runs would both pass it, both generate the same
		// deterministic occurrence ids and collide on the primary key — an
		// unhandled rejection nobody is awaiting (KII-159).
		test('serializes overlapping runs instead of double-materializing', async () => {
			const acc: Entity = {
				id: 'conc-acc',
				type: 'account',
				name: 'A',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const cat: Entity = {
				id: 'conc-cat',
				type: 'category',
				name: 'C',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			await db.createEntity(acc);
			await db.createEntity(cat);

			const start = new Date(2026, 7, 8, 9, 0, 0, 0).getTime();
			const template: RecurrenceTemplate = {
				id: 'conc-tmpl',
				from_entity_id: acc.id,
				to_entity_id: cat.id,
				amount_minor: 1000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'daily' }),
				start_date: start,
				end_date: null,
				end_count: null,
				created_at: start,
				exclusions: [],
			};
			await db.createRecurrenceTemplate(template);
			useStore.setState({
				entities: [acc, cat],
				recurrenceTemplates: [template],
				transactions: [],
			});

			const dateSpy = spyOn(Date, 'now').mockReturnValue(
				new Date(2026, 7, 10, 12, 0, 0, 0).getTime()
			);
			try {
				await Promise.all([
					useStore.getState().backfillRecurringIfStale(),
					useStore.getState().backfillRecurringIfStale(),
				]);

				// Aug 8, 9 and 10 — once each, in state and in the database.
				expect(
					useStore
						.getState()
						.transactions.map((t) => t.id)
						.sort()
				).toEqual(['conc-tmpl:2026-08-08', 'conc-tmpl:2026-08-09', 'conc-tmpl:2026-08-10']);
				expect(await db.getTransactionsBySeriesId('conc-tmpl')).toHaveLength(3);
			} finally {
				dateSpy.mockRestore();
			}
		});

		test('backfillRecurrences materializes only past-due occurrences with deterministic ids', async () => {
			const acc: Entity = {
				id: 'pd-acc',
				type: 'account',
				name: 'A',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const cat: Entity = {
				id: 'pd-cat',
				type: 'category',
				name: 'C',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			await db.createEntity(acc);
			await db.createEntity(cat);

			const now = Date.now();
			const threeDaysAgo = now - 3 * 86_400_000;
			const template: RecurrenceTemplate = {
				id: 'tmpl-pd',
				from_entity_id: 'pd-acc',
				to_entity_id: 'pd-cat',
				amount_minor: 500,
				currency: 'USD',
				note: undefined,
				rule: JSON.stringify({ type: 'daily' }),
				start_date: threeDaysAgo,
				end_date: null,
				end_count: null,
				created_at: threeDaysAgo,
				exclusions: [],
			};
			await db.createRecurrenceTemplate(template);

			useStore.setState({
				recurrenceTemplates: [template],
				entities: [acc, cat],
				transactions: [],
			});
			_resetBackfillThrottleForTests();
			await useStore.getState().backfillRecurringIfStale();

			const rows = (await db.getAllTransactions()).filter((t) => t.series_id === 'tmpl-pd');
			// All materialized rows are in the past or now — no future phantom rows.
			expect(rows.every((t) => t.timestamp <= Date.now())).toBe(true);
			expect(rows.length).toBeGreaterThan(0);
			// Deterministic ids of the form `${series}:${YYYY-MM-DD}`.
			expect(rows.every((t) => t.id.startsWith('tmpl-pd:'))).toBe(true);
			// Materialized rows are unconfirmed.
			expect(rows.every((t) => t.is_confirmed === false)).toBe(true);
		});

		test('editing a past-due occurrence date does not collide with its deterministic id on the next backfill', async () => {
			const acc: Entity = {
				id: 'edit-acc',
				type: 'account',
				name: 'A',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const cat: Entity = {
				id: 'edit-cat',
				type: 'category',
				name: 'C',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			await db.createEntity(acc);
			await db.createEntity(cat);

			const now = Date.now();
			const DAY = 86_400_000;
			const todayCivil = toCivilDate(now);
			const yesterdayCivil = toCivilDate(now - DAY);

			// A monthly series whose only past-due occurrence is *today*.
			const template: RecurrenceTemplate = {
				id: 'edit-tmpl',
				from_entity_id: acc.id,
				to_entity_id: cat.id,
				amount_minor: 5000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: now,
				end_date: null,
				end_count: null,
				created_at: now,
				exclusions: [],
			};
			await db.createRecurrenceTemplate(template);
			useStore.setState({
				entities: [acc, cat],
				recurrenceTemplates: [template],
				transactions: [],
			});

			// First backfill materializes today's occurrence with the deterministic
			// id `${series}:${todayCivil}`.
			_resetBackfillThrottleForTests();
			await useStore.getState().backfillRecurringIfStale();
			const todayRow = useStore
				.getState()
				.transactions.find((t) => t.series_id === template.id);
			expect(todayRow).toBeDefined();
			expect(todayRow!.id).toBe(`${template.id}:${todayCivil}`);

			// The transaction actually happened yesterday, so the user edits the date
			// back a day. A single-scope edit keeps the row's id and series_id and
			// records no exclusion for today — the row now lives on yesterday's civil
			// date while still carrying the id minted for today.
			await useStore.getState().updateTransaction(todayRow!.id, { timestamp: now - DAY });

			// Next app foreground / cold start. Before the fix this threw
			// `UNIQUE constraint failed: transactions.id`: backfill saw today's civil
			// date missing (the row moved to yesterday) and regenerated a row with the
			// SAME deterministic id the edited row still carries.
			_resetBackfillThrottleForTests();
			await useStore.getState().backfillRecurringIfStale();

			// The edited row survives on yesterday and no duplicate id was minted.
			const seriesRows = await db.getTransactionsBySeriesId(template.id);
			const ids = seriesRows.map((t) => t.id);
			expect(new Set(ids).size).toBe(ids.length);
			expect(seriesRows).toHaveLength(1);
			expect(seriesRows[0]!.id).toBe(`${template.id}:${todayCivil}`);
			expect(toCivilDate(seriesRows[0]!.timestamp)).toBe(yesterdayCivil);
		});

		test('deleting a date-edited occurrence excludes its slot, not the dragged date', async () => {
			const acc: Entity = {
				id: 'del-acc',
				type: 'account',
				name: 'A',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const cat: Entity = {
				id: 'del-cat',
				type: 'category',
				name: 'C',
				currency: 'USD',
				row: 0,
				position: 1,
			};
			await db.createEntity(acc);
			await db.createEntity(cat);

			const now = Date.now();
			const DAY = 86_400_000;
			const todayCivil = toCivilDate(now);

			// Monthly series whose only past-due occurrence is today.
			const template: RecurrenceTemplate = {
				id: 'del-tmpl',
				from_entity_id: acc.id,
				to_entity_id: cat.id,
				amount_minor: 5000,
				currency: 'USD',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: now,
				end_date: null,
				end_count: null,
				created_at: now,
				exclusions: [],
			};
			await db.createRecurrenceTemplate(template);
			useStore.setState({
				entities: [acc, cat],
				recurrenceTemplates: [template],
				transactions: [],
			});

			_resetBackfillThrottleForTests();
			await useStore.getState().backfillRecurringIfStale();
			const row = useStore.getState().transactions.find((t) => t.series_id === template.id)!;
			expect(row.id).toBe(`${template.id}:${todayCivil}`);

			// The transaction happened yesterday → edit the date back a day, then the
			// user deletes it (single scope). The exclusion must be recorded against
			// today's SLOT (its id), not yesterday's dragged timestamp.
			await useStore.getState().updateTransaction(row.id, { timestamp: now - DAY });
			await useStore.getState().deleteTransactionWithScope(row.id, 'single');

			const excluded = useStore
				.getState()
				.recurrenceTemplates.find((t) => t.id === template.id)!
				.exclusions!.map(toCivilDate);
			expect(excluded).toContain(todayCivil);

			// The deleted occurrence must NOT resurrect on its original date after a
			// later backfill (before the fix it came back on `todayCivil`).
			_resetBackfillThrottleForTests();
			await useStore.getState().backfillRecurringIfStale();
			expect(await db.getTransactionsBySeriesId(template.id)).toHaveLength(0);
		});
	});

	test('rescheduling a single upcoming occurrence to an earlier date leaves no duplicate (KII-157)', async () => {
		const acc: Entity = {
			id: 'resched-acc',
			type: 'account',
			name: 'A',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const cat: Entity = {
			id: 'resched-cat',
			type: 'category',
			name: 'C',
			currency: 'USD',
			row: 0,
			position: 1,
		};
		await db.createEntity(acc);
		await db.createEntity(cat);

		const now = Date.now();
		const DAY = 86_400_000;
		const tomorrowCivil = toCivilDate(now + DAY);

		// Monthly series whose next (and only in-range) occurrence is tomorrow —
		// future, so it is derived virtually and never materialized by backfill.
		const template: RecurrenceTemplate = {
			id: 'resched-tmpl',
			from_entity_id: acc.id,
			to_entity_id: cat.id,
			amount_minor: 4500,
			currency: 'USD',
			note: 'internet',
			rule: JSON.stringify({ type: 'monthly' }),
			start_date: now + DAY,
			end_date: null,
			end_count: null,
			created_at: now,
			exclusions: [],
		};
		await db.createRecurrenceTemplate(template);
		useStore.setState({
			entities: [acc, cat],
			recurrenceTemplates: [template],
			transactions: [],
		});

		// Mirrors what the balance hook and History screen do with store state.
		const derive = () => {
			const state = useStore.getState();
			return deriveVirtualOccurrences(
				state.recurrenceTemplates,
				new Map(
					state.recurrenceTemplates.map((t) => [
						t.id,
						new Set((t.exclusions ?? []).map(toCivilDate)),
					])
				),
				state.transactions,
				now - DAY,
				now + 7 * DAY,
				now
			);
		};

		const upcoming = derive();
		expect(upcoming.map((t) => t.id)).toEqual([`${template.id}:${tomorrowCivil}`]);

		// The user edits *this one* occurrence and moves it to today — exactly what
		// the transaction modal does: materialize, then a single-scope update.
		await useStore.getState().materializeOccurrence(upcoming[0]!);
		await useStore
			.getState()
			.updateTransactionWithScope(upcoming[0]!.id, { timestamp: now }, 'single');

		// One row, on today. Before the fix the derived occurrence for tomorrow came
		// back alongside it because dedup keyed on the row's new date, not its slot.
		const rows = await db.getTransactionsBySeriesId(template.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.timestamp).toBe(now);
		expect(derive()).toEqual([]);
	});

	test('materializeOccurrence inserts a real row with the deterministic id, idempotently', async () => {
		const acc: Entity = {
			id: 'accM',
			type: 'account',
			name: 'A',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const cat: Entity = {
			id: 'catM',
			type: 'category',
			name: 'C',
			currency: 'USD',
			row: 0,
			position: 1,
		};
		await db.createEntity(acc);
		await db.createEntity(cat);
		useStore.setState({ entities: [acc, cat], transactions: [] });

		const future = Date.now() + 3 * 86_400_000;
		const virtual: Transaction = {
			id: 'tmplM:zzz',
			from_entity_id: 'accM',
			to_entity_id: 'catM',
			amount_minor: 999,
			currency: 'USD',
			timestamp: future,
			series_id: 'tmplM',
			is_confirmed: false,
			isVirtual: true,
		};

		const first = await useStore.getState().materializeOccurrence(virtual);
		expect(first.id).toBe('tmplM:zzz');
		expect(first.isVirtual).toBeUndefined();
		expect(useStore.getState().transactions.some((t) => t.id === 'tmplM:zzz')).toBe(true);

		// Idempotent: calling again returns the existing row, no duplicate.
		const second = await useStore.getState().materializeOccurrence(virtual);
		expect(second.id).toBe('tmplM:zzz');
		expect((await db.getAllTransactions()).filter((t) => t.id === 'tmplM:zzz')).toHaveLength(1);
	});

	test('excludeOccurrence records an exclusion without materializing a row', async () => {
		const acc: Entity = {
			id: 'accX',
			type: 'account',
			name: 'A',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const cat: Entity = {
			id: 'catX',
			type: 'category',
			name: 'C',
			currency: 'USD',
			row: 0,
			position: 1,
		};
		await db.createEntity(acc);
		await db.createEntity(cat);
		const template: RecurrenceTemplate = {
			id: 'tmplX',
			from_entity_id: 'accX',
			to_entity_id: 'catX',
			amount_minor: 700,
			currency: 'USD',
			note: undefined,
			rule: JSON.stringify({ type: 'daily' }),
			start_date: Date.now(),
			end_date: null,
			end_count: null,
			created_at: Date.now(),
			exclusions: [],
		};
		await db.createRecurrenceTemplate(template);
		useStore.setState({
			recurrenceTemplates: [template],
			entities: [acc, cat],
			transactions: [],
		});

		const occurrenceTs = Date.now() + 2 * 86_400_000;
		const virtual: Transaction = {
			id: `tmplX:${occurrenceTs}`,
			from_entity_id: 'accX',
			to_entity_id: 'catX',
			amount_minor: 700,
			currency: 'USD',
			timestamp: occurrenceTs,
			series_id: 'tmplX',
			is_confirmed: false,
			isVirtual: true,
		};

		await useStore.getState().excludeOccurrence(virtual);

		// No transaction row was created (neither in state nor DB)…
		expect(useStore.getState().transactions).toHaveLength(0);
		expect((await db.getAllTransactions()).filter((t) => t.series_id === 'tmplX')).toHaveLength(
			0
		);
		// …and the exclusion is recorded in both DB and in-memory state.
		expect(await db.getExclusionsForTemplate('tmplX')).toContain(occurrenceTs);
		const stateTemplate = useStore.getState().recurrenceTemplates.find((t) => t.id === 'tmplX');
		expect(stateTemplate?.exclusions).toContain(occurrenceTs);
	});

	test('getEntitiesWithBalance counts derived virtual occurrences in upcoming', async () => {
		const acc: Entity = {
			id: 'accU',
			type: 'account',
			name: 'A',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const cat: Entity = {
			id: 'catU',
			type: 'category',
			name: 'C',
			currency: 'USD',
			row: 0,
			position: 1,
		};
		const now = Date.now();
		const period = getCurrentPeriod();
		const { end } = getPeriodRange(period);
		// A point strictly after now but still inside the current period — robust
		// against month-boundary days where now + 1 day would cross into the next
		// period and drop out of the upcoming window.
		const upcomingTs = Math.floor((now + end) / 2);
		const virtual: Transaction = {
			id: 'tmplU:x',
			from_entity_id: 'accU',
			to_entity_id: 'catU',
			amount_minor: 2500,
			currency: 'USD',
			timestamp: upcomingTs,
			series_id: 'tmplU',
			is_confirmed: false,
			isVirtual: true,
		};
		const result = getEntitiesWithBalance([acc, cat], [], [virtual], period, 'category');
		const groceries = result.find((e) => e.id === 'catU')!;
		expect(groceries.upcoming).toBeCloseTo(2500, 0);
	});

	test('addEntity persists the entity and mirrors it into state', async () => {
		await useStore.getState().addEntity({
			id: 'char-add-1',
			type: 'account',
			name: 'Char Add',
			currency: 'EUR',
			row: 0,
			position: 0,
		});

		const inState = useStore.getState().entities.find((e) => e.id === 'char-add-1');
		expect(inState?.name).toBe('Char Add');
		expect(inState?.currency).toBe('EUR');

		const inDb = await db.getEntityById('char-add-1');
		expect(inDb?.name).toBe('Char Add');
	});

	test('updateEntity persists changes and mirrors the stamped row into state', async () => {
		await db.createEntity({
			id: 'char-upd-1',
			type: 'category',
			name: 'Before',
			currency: 'USD',
			row: 0,
			position: 0,
		});
		await useStore.getState().initialize();

		const current = useStore.getState().entities.find((e) => e.id === 'char-upd-1')!;
		await useStore.getState().updateEntity({ ...current, name: 'After', color: '#ff0000' });

		const inState = useStore.getState().entities.find((e) => e.id === 'char-upd-1');
		expect(inState?.name).toBe('After');
		expect(inState?.color).toBe('#ff0000');

		const inDb = await db.getEntityById('char-upd-1');
		expect(inDb?.name).toBe('After');
	});

	test('deletePlan removes the plan from state and DB', async () => {
		await db.createEntity({
			id: 'char-plan-ent',
			type: 'category',
			name: 'Plan Holder',
			currency: 'USD',
			row: 0,
			position: 0,
		});
		await useStore.getState().initialize();
		await useStore.getState().setPlan({
			id: 'char-plan-1',
			entity_id: 'char-plan-ent',
			period: 'all-time',
			period_start: '2026-01',
			planned_amount_minor: 5000,
		});

		await useStore.getState().deletePlan('char-plan-1');

		expect(useStore.getState().plans.find((p) => p.id === 'char-plan-1')).toBeUndefined();
		const allPlans = await db.getAllPlans();
		expect(allPlans.find((p) => p.id === 'char-plan-1')).toBeUndefined();
	});
});

// KII-159: the reminder sweep is what replaced the row-based scheduler, so the
// store's job is to run it after anything that changes which occurrences are
// unconfirmed and not yet due. These cover the wiring end to end (real sweep,
// real prefs, spied native layer) rather than mocking `syncScheduledReminders`.
describe('reminder sweep wiring', () => {
	const account: Entity = {
		id: 'rem-acct',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		row: 0,
		position: 0,
	};
	const category: Entity = {
		id: 'rem-cat',
		type: 'category',
		name: 'Rent',
		currency: 'USD',
		row: 0,
		position: 0,
	};

	// Noon three days out: comfortably on a later civil day than "now", so the
	// occurrence is upcoming under any local timezone.
	const upcoming = () => {
		const d = new Date(Date.now() + 3 * 86_400_000);
		return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).getTime();
	};

	let cancelAllSpy: ReturnType<typeof spyOn>;
	let scheduleSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		resetDrizzleDb();
		cancelAllSpy = spyOn(notifications, 'cancelAllNotifications');
		scheduleSpy = spyOn(notifications, 'scheduleTransactionNotification');
		await setRemindersEnabled(true);
		await setHasRequestedPermission(true);
		await setScheduledReminderKey(null);

		for (const entity of [account, category]) {
			await db.createEntity(entity);
		}
		useStore.setState({
			entities: [account, category],
			plans: [],
			transactions: [],
			balanceSeed: [],
			// These tests call backfillRecurringIfStale directly (bypassing
			// initialize's phase 1/2 dance), so the gate it added (KII-144) must
			// be pre-satisfied here rather than left to leak in from elsewhere.
			isFullyHydrated: true,
			recurrenceTemplates: [],
			marketValueSnapshots: [],
		});
	});

	afterEach(async () => {
		cancelAllSpy.mockRestore();
		scheduleSpy.mockRestore();
		await setRemindersEnabled(false);
		await setScheduledReminderKey(null);
	});

	test('creating an upcoming unconfirmed transaction schedules its reminder', async () => {
		const timestamp = upcoming();
		await useStore.getState().createTransactionBatch([
			{
				id: 'rem-tx-1',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 150000,
				currency: 'USD',
				timestamp,
				is_confirmed: false,
			},
		]);

		expect(scheduleSpy).toHaveBeenCalledTimes(1);
		const scheduled = scheduleSpy.mock.calls[0]![0] as { transactionId: string };
		expect(scheduled.transactionId).toBe('rem-tx-1');
		expect(await getScheduledReminderKey()).not.toBeNull();
	});

	// The self-healing property: nothing looks up a stored notification id — the
	// confirmed occurrence is simply absent from the next sweep's set.
	test('confirming an occurrence early cancels its reminder and leaves nothing scheduled', async () => {
		const timestamp = upcoming();
		await useStore.getState().createTransactionBatch([
			{
				id: 'rem-tx-2',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 150000,
				currency: 'USD',
				timestamp,
				is_confirmed: false,
			},
		]);
		const keyWhileScheduled = await getScheduledReminderKey();
		cancelAllSpy.mockClear();
		scheduleSpy.mockClear();

		await useStore.getState().confirmTransaction('rem-tx-2');

		expect(cancelAllSpy).toHaveBeenCalledTimes(1);
		expect(scheduleSpy).not.toHaveBeenCalled();
		expect(keyWhileScheduled).not.toBeNull();
		expect(await getScheduledReminderKey()).toBeNull();
	});

	test('excluding an upcoming occurrence drops its reminder', async () => {
		const timestamp = upcoming();
		const template: RecurrenceTemplate = {
			id: 'rem-tpl',
			from_entity_id: account.id,
			to_entity_id: category.id,
			amount_minor: 150000,
			currency: 'USD',
			start_date: timestamp,
			rule: JSON.stringify({ type: 'daily' }),
			end_date: null,
			end_count: 1,
			created_at: Date.now(),
			exclusions: [],
		};
		await db.createRecurrenceTemplate(template);
		useStore.setState({ recurrenceTemplates: [template] });
		// The occurrence is 3 days out, so backfill materializes nothing — it is
		// only here to trigger the sweep that picks up the virtual occurrence.
		_resetBackfillThrottleForTests();
		await useStore.getState().backfillRecurringIfStale();

		const occurrenceId = `${template.id}:${toCivilDate(timestamp)}`;
		expect(scheduleSpy).toHaveBeenCalledTimes(1);
		expect((scheduleSpy.mock.calls[0]![0] as { transactionId: string }).transactionId).toBe(
			occurrenceId
		);
		cancelAllSpy.mockClear();
		scheduleSpy.mockClear();

		await useStore.getState().excludeOccurrence({
			id: occurrenceId,
			from_entity_id: account.id,
			to_entity_id: category.id,
			amount_minor: 150000,
			currency: 'USD',
			timestamp,
			series_id: template.id,
			is_confirmed: false,
		});

		expect(cancelAllSpy).toHaveBeenCalledTimes(1);
		expect(scheduleSpy).not.toHaveBeenCalled();
		expect(await getScheduledReminderKey()).toBeNull();
	});

	// KII-159: the notification body carries the amount and both entity names, so
	// a content edit has to reach the OS even though the set of occurrences is
	// unchanged. These would pass vacuously under an `id@fireAt` fingerprint.
	test('editing an upcoming amount reschedules the reminder with the new body', async () => {
		await useStore.getState().createTransactionBatch([
			{
				id: 'rem-tx-3',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 150000,
				currency: 'USD',
				timestamp: upcoming(),
				is_confirmed: false,
			},
		]);
		cancelAllSpy.mockClear();
		scheduleSpy.mockClear();

		await useStore.getState().updateTransaction('rem-tx-3', { amount_minor: 200000 });

		expect(cancelAllSpy).toHaveBeenCalledTimes(1);
		expect(scheduleSpy).toHaveBeenCalledTimes(1);
		expect(scheduleSpy.mock.calls[0]![0]).toMatchObject({
			transactionId: 'rem-tx-3',
			amount: `${formatAmount(200000, 'USD')} USD`,
		});
	});

	test('renaming an entity reschedules the reminders that name it', async () => {
		await useStore.getState().createTransactionBatch([
			{
				id: 'rem-tx-4',
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 150000,
				currency: 'USD',
				timestamp: upcoming(),
				is_confirmed: false,
			},
		]);
		cancelAllSpy.mockClear();
		scheduleSpy.mockClear();

		await useStore.getState().updateEntity({ ...category, name: 'Mortgage' });

		expect(cancelAllSpy).toHaveBeenCalledTimes(1);
		expect(scheduleSpy).toHaveBeenCalledTimes(1);
		expect(scheduleSpy.mock.calls[0]![0]).toMatchObject({
			transactionId: 'rem-tx-4',
			toName: 'Mortgage',
		});
	});
});

// KII-163: `getUnconfirmedCount` counts rows that are unconfirmed AND due, so
// every action that adds, removes or re-dates such a row has to refresh the OS
// badge, not only the reminder set. The in-app History badge recomputes from
// `transactions` on every render and hides the gap; the app-icon badge would
// stay stale until the next confirm, cold start or hourly background task.
describe('OS badge sync wiring', () => {
	const account: Entity = {
		id: 'badge-acct',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		row: 0,
		position: 0,
	};
	const category: Entity = {
		id: 'badge-cat',
		type: 'category',
		name: 'Rent',
		currency: 'USD',
		row: 0,
		position: 0,
	};

	// Pinned: due-ness is a civil-day comparison, so an unpinned clock would let
	// "today" and "three days out" drift across a real midnight mid-test.
	const NOW = new Date(2026, 7, 10, 12, 0, 0, 0).getTime();
	const todayAt = (hour: number) => new Date(2026, 7, 10, hour, 0, 0, 0).getTime();
	const upcoming = () => new Date(2026, 7, 13, 12, 0, 0, 0).getTime();

	let badgeSpy: ReturnType<typeof spyOn>;
	let cancelAllSpy: ReturnType<typeof spyOn>;
	let scheduleSpy: ReturnType<typeof spyOn>;
	let dateSpy: ReturnType<typeof spyOn>;

	// Unconfirmed and dated earlier today by default: exactly what the badge counts.
	const tx = (id: string, overrides: Partial<Transaction> = {}): Transaction => ({
		id,
		from_entity_id: account.id,
		to_entity_id: category.id,
		amount_minor: 10000,
		currency: 'USD',
		timestamp: todayAt(9),
		is_confirmed: false,
		...overrides,
	});

	const seed = async (rows: Transaction[], templates: RecurrenceTemplate[] = []) => {
		for (const template of templates) await db.createRecurrenceTemplate(template);
		if (rows.length > 0) await db.createTransactionBatch(rows);
		useStore.setState({ transactions: rows, recurrenceTemplates: templates });
	};

	const template = (id: string, overrides: Partial<RecurrenceTemplate> = {}) =>
		({
			id,
			from_entity_id: account.id,
			to_entity_id: category.id,
			amount_minor: 10000,
			currency: 'USD',
			rule: JSON.stringify({ type: 'daily' }),
			start_date: todayAt(9),
			end_date: null,
			end_count: null,
			created_at: todayAt(9),
			exclusions: [],
			...overrides,
		}) satisfies RecurrenceTemplate;

	beforeEach(async () => {
		resetDrizzleDb();
		badgeSpy = spyOn(notifications, 'updateBadgeCount');
		cancelAllSpy = spyOn(notifications, 'cancelAllNotifications');
		scheduleSpy = spyOn(notifications, 'scheduleTransactionNotification');
		// The badge sync is a no-op while reminders are off, and the contextual
		// permission ask in `addRecurringTransaction` must not fire.
		await setRemindersEnabled(true);
		await setHasRequestedPermission(true);
		await setScheduledReminderKey(null);

		for (const entity of [account, category]) {
			await db.createEntity(entity);
		}
		useStore.setState({
			entities: [account, category],
			plans: [],
			transactions: [],
			recurrenceTemplates: [],
			marketValueSnapshots: [],
		});
		dateSpy = spyOn(Date, 'now').mockReturnValue(NOW);
	});

	afterEach(async () => {
		dateSpy.mockRestore();
		badgeSpy.mockRestore();
		cancelAllSpy.mockRestore();
		scheduleSpy.mockRestore();
		await setRemindersEnabled(false);
		await setScheduledReminderKey(null);
	});

	test('deleting a due unconfirmed transaction lowers the badge', async () => {
		await seed([tx('badge-del-1'), tx('badge-del-2')]);

		await useStore.getState().deleteTransaction('badge-del-1');

		expect(badgeSpy).toHaveBeenLastCalledWith(1);
	});

	test('moving an upcoming transaction onto today raises the badge', async () => {
		await seed([tx('badge-edit-1', { timestamp: upcoming() })]);

		await useStore.getState().updateTransaction('badge-edit-1', { timestamp: todayAt(15) });

		expect(badgeSpy).toHaveBeenLastCalledWith(1);
	});

	test('splitting a due unconfirmed transaction into confirmed rows clears the badge', async () => {
		await seed([tx('badge-split-1', { amount_minor: 2000 })]);

		await useStore
			.getState()
			.replaceTransactionWithSplit('badge-split-1', [
				tx('badge-split-c1', { amount_minor: 1200, is_confirmed: true }),
				tx('badge-split-c2', { amount_minor: 800, is_confirmed: true }),
			]);

		expect(badgeSpy).toHaveBeenLastCalledWith(0);
	});

	test('deleting a single due occurrence of a series lowers the badge', async () => {
		const tmpl = template('badge-single-tmpl');
		await seed(
			[
				tx('badge-single-1', { series_id: tmpl.id }),
				tx('badge-single-2', { series_id: tmpl.id, timestamp: todayAt(10) }),
			],
			[tmpl]
		);

		await useStore.getState().deleteTransactionWithScope('badge-single-1', 'single');

		expect(badgeSpy).toHaveBeenLastCalledWith(1);
	});

	test('deleting the future of a series lowers the badge by every due row it removes', async () => {
		const tmpl = template('badge-future-tmpl');
		await seed(
			[
				// Both series rows are due today and both are removed; the standalone
				// row is what the badge should be left counting.
				tx('badge-future-1', { series_id: tmpl.id }),
				tx('badge-future-2', { series_id: tmpl.id, timestamp: todayAt(15) }),
				tx('badge-future-standalone'),
			],
			[tmpl]
		);

		await useStore.getState().deleteTransactionWithScope('badge-future-1', 'future');

		expect(badgeSpy).toHaveBeenLastCalledWith(1);
	});

	test("deactivating an entity's templates lowers the badge", async () => {
		const tmpl = template('badge-deact-tmpl');
		await seed(
			[
				// `deactivateTemplatesForEntity` drops rows at or after `now`; the 09:00
				// row survives and is still due, the 15:00 row is due today too and goes.
				tx('badge-deact-past', { series_id: tmpl.id }),
				tx('badge-deact-later', { series_id: tmpl.id, timestamp: todayAt(15) }),
			],
			[tmpl]
		);

		await useStore.getState().deactivateTemplatesForEntity(category.id);

		expect(badgeSpy).toHaveBeenLastCalledWith(1);
	});

	test('re-dating the future of a series onto today raises the badge', async () => {
		const tmpl = template('badge-scope-tmpl', { start_date: upcoming() });
		await seed([tx('badge-scope-1', { series_id: tmpl.id, timestamp: upcoming() })], [tmpl]);

		await useStore
			.getState()
			.updateTransactionWithScope('badge-scope-1', { timestamp: todayAt(15) }, 'future');

		expect(badgeSpy).toHaveBeenLastCalledWith(1);
	});

	test('batch-creating an unconfirmed row that is due today raises the badge', async () => {
		await useStore.getState().createTransactionBatch([tx('badge-batch-1')]);

		expect(badgeSpy).toHaveBeenLastCalledWith(1);
	});

	test('adding an unconfirmed row that is due today raises the badge', async () => {
		// `buildTransaction` defaults a later-today timestamp to unconfirmed, and a
		// later-today row is already due — the badge has to move on plain adds too.
		await useStore.getState().addTransaction(tx('badge-add-1', { timestamp: todayAt(15) }));

		expect(badgeSpy).toHaveBeenLastCalledWith(1);
	});

	test('a new recurring series raises the badge by the occurrences it materializes', async () => {
		// Daily from two days ago: Aug 8, 9 and 10 are materialized as due
		// unconfirmed rows by the backfill inside `addRecurringTransaction`.
		await useStore.getState().addRecurringTransaction(
			{
				from_entity_id: account.id,
				to_entity_id: category.id,
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date(2026, 7, 8, 9, 0, 0, 0).getTime(),
			},
			{ rule: { type: 'daily' }, endDate: null, endCount: null }
		);

		expect(useStore.getState().transactions).toHaveLength(3);
		expect(badgeSpy).toHaveBeenLastCalledWith(3);
	});
});
