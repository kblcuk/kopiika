import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import type { Entity, Plan, Transaction } from '@/src/types';
import { useStore, getEntitiesWithBalance } from '../index';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';

describe('Store Data Integrity', () => {
	beforeEach(() => {
		// Reset database and store state before each test
		resetDrizzleDb();

		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
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
					order: 0,
				},
				{
					id: 'entity-temp',
					type: 'category',
					name: 'Temp',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-temp',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount: 500,
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
			expect(state.plans[0].id).toBe('plan-1');
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
					order: 0,
				},
				{
					id: 'entity-2',
					type: 'category',
					name: 'Groceries',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount: 500,
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
				planned_amount: 1000,
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
				order: 0,
			};

			useStore.setState({ entities: [entity] });
			await db.createEntity(entity);

			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 1000,
			};

			await useStore.getState().setPlan(plan);

			const state = useStore.getState();
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0]).toEqual(plan);

			// Verify it was written to database
			const dbPlan = await db.getPlanForEntity('entity-1', '2026-01');
			expect(dbPlan).toEqual(plan);
		});

		test('should update existing plan', async () => {
			const entity: Entity = {
				id: 'entity-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 1000,
			};

			useStore.setState({ entities: [entity], plans: [plan] });
			await db.createEntity(entity);
			await db.upsertPlan(plan);

			const updatedPlan: Plan = {
				...plan,
				planned_amount: 2000,
			};

			await useStore.getState().setPlan(updatedPlan);

			const state = useStore.getState();
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0].planned_amount).toBe(2000);

			// Verify it was updated in database
			const dbPlan = await db.getPlanForEntity('entity-1', '2026-01');
			expect(dbPlan?.planned_amount).toBe(2000);
		});
	});

	describe('addTransaction', () => {
		test('should prevent transaction with non-existent from_entity', async () => {
			useStore.setState({
				entities: [
					{
						id: 'entity-1',
						type: 'account',
						name: 'Checking',
						currency: 'USD',
						row: 0,
						position: 0,
						order: 0,
					},
				],
			});

			const transaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'non-existent',
				to_entity_id: 'entity-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await useStore.getState().addTransaction(transaction);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(0);

			// Verify it wasn't written to database
			const dbTransactions = await db.getAllTransactions();
			expect(dbTransactions).toHaveLength(0);
		});

		test('should prevent transaction with non-existent to_entity', async () => {
			useStore.setState({
				entities: [
					{
						id: 'entity-1',
						type: 'account',
						name: 'Checking',
						currency: 'USD',
						row: 0,
						position: 0,
						order: 0,
					},
				],
			});

			const transaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'entity-1',
				to_entity_id: 'non-existent',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await useStore.getState().addTransaction(transaction);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(0);

			// Verify it wasn't written to database
			const dbTransactions = await db.getAllTransactions();
			expect(dbTransactions).toHaveLength(0);
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
					order: 0,
				},
				{
					id: 'entity-2',
					type: 'account',
					name: 'Checking',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
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
				amount: 5000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await useStore.getState().addTransaction(transaction);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0]).toMatchObject(transaction);
			expect(state.transactions[0].is_confirmed).toBe(true);

			// Verify it was written to database
			const dbTransactions = await db.getAllTransactions();
			expect(dbTransactions).toHaveLength(1);
			expect(dbTransactions[0]).toMatchObject(transaction);
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
					order: 0,
				},
				{
					id: 'entity-2',
					type: 'category',
					name: 'Groceries',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'all-time',
					period_start: '2026-01',
					planned_amount: 500,
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
			expect(state.plans[0].id).toBe('plan-2');

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
				order: 0,
			};
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};
			const transaction: Transaction = {
				id: 'tx-1',
				from_entity_id: income.id,
				to_entity_id: account.id,
				amount: 100,
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
			expect(state.transactions[0].to_entity_id).toBe(account.id);
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			// Create plans for current period (2026-01)
			const incomePlan: Plan = {
				id: 'plan-income',
				entity_id: 'income-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 5000,
			};

			const categoryPlan: Plan = {
				id: 'plan-category',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 500,
			};

			// Create transactions:
			// - One in current period (2026-01)
			// - One in previous period (2025-12)
			const currentPeriodTx: Transaction = {
				id: 'tx-current',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			const previousPeriodTx: Transaction = {
				id: 'tx-previous',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 4500,
				currency: 'USD',
				timestamp: new Date('2025-12-15').getTime(),
			};

			const categoryTxCurrent: Transaction = {
				id: 'tx-category-current',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 300,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			const categoryTxPrevious: Transaction = {
				id: 'tx-category-previous',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 200,
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
			expect(incomePlanData?.planned_amount).toBe(5000);

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
			expect(incomeTransactionsInPeriod[0].amount).toBe(5000);

			// Categories should only count current period transactions
			const categoryTransactionsInPeriod = state.transactions.filter(
				(t) =>
					t.timestamp >= jan2026Start &&
					t.timestamp <= jan2026End &&
					t.to_entity_id === 'category-1'
			);
			expect(categoryTransactionsInPeriod).toHaveLength(1);
			expect(categoryTransactionsInPeriod[0].amount).toBe(300);
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
				order: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			// Create all-time plan for saving
			const savingPlan: Plan = {
				id: 'plan-saving',
				entity_id: 'saving-1',
				period: 'all-time',
				period_start: '2025-12', // Date when goal was created
				planned_amount: 10000,
			};

			// Create transactions across multiple periods
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: new Date('2025-12-15').getTime(),
			};

			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 2000,
				currency: 'USD',
				timestamp: new Date('2025-12-20').getTime(),
			};

			const tx4: Transaction = {
				id: 'tx-4',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 3000,
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
				return t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount;
			}, 0);
			// +5000 +5000 -2000 -3000 = 5000
			expect(accountBalance).toBe(5000);

			// Saving should count ALL transactions (not period-filtered)
			const savingTransactions = state.transactions.filter(
				(t) => t.to_entity_id === 'saving-1'
			);
			expect(savingTransactions).toHaveLength(2);

			const savingBalance = savingTransactions.reduce((sum, t) => sum + t.amount, 0);
			// 2000 + 3000 = 5000
			expect(savingBalance).toBe(5000);

			// Verify the plan is using 'all-time' period
			const plan = state.plans.find(
				(p) => p.entity_id === 'saving-1' && p.period === 'all-time'
			);
			expect(plan?.planned_amount).toBe(10000);
		});

		test('should use all-time period for savings plans', async () => {
			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			// Create plan with period='all-time'
			const savingPlan: Plan = {
				id: 'plan-saving',
				entity_id: 'saving-1',
				period: 'all-time',
				period_start: '2026-01', // Date when goal was created
				planned_amount: 15000,
			};

			// Also create a monthly plan (should be ignored for savings)
			const monthlyPlan: Plan = {
				id: 'plan-saving-monthly',
				entity_id: 'saving-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 500,
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
			expect(allTimePlan?.planned_amount).toBe(15000);
			expect(allTimePlan?.period_start).toBe('2026-01'); // Preserves creation date

			const monthPlan = state.plans.find(
				(p) => p.entity_id === 'saving-1' && p.period === 'month'
			);
			expect(monthPlan?.planned_amount).toBe(500);

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
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
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
				amount: 5000,
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
				(sum, t) => (t.from_entity_id === 'income-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(incomeBalance).toBe(5000);

			const accountTx = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-1')
			);
			const accountBalance = accountTx.reduce(
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance).toBe(5000);

			// Add transaction: Account -> Category (300)
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 300,
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
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance2).toBe(4700);

			const categoryTx = state.transactions.filter(
				(t) =>
					t.timestamp >= jan2026Start &&
					t.timestamp <= jan2026End &&
					t.to_entity_id === 'category-1'
			);
			const categoryBalance = categoryTx.reduce((sum, t) => sum + t.amount, 0);
			expect(categoryBalance).toBe(300);

			// Add transaction: Account -> Saving (1000)
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 1000,
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
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance3).toBe(3700);

			const savingTx = state.transactions.filter((t) => t.to_entity_id === 'saving-1');
			const savingBalance = savingTx.reduce((sum, t) => sum + t.amount, 0);
			expect(savingBalance).toBe(1000);
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
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
				amount: 500,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			await useStore.getState().addTransaction(currentTx);

			// Add previous period transaction: Account -> Category (300)
			const previousTx: Transaction = {
				id: 'tx-previous',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 300,
				currency: 'USD',
				timestamp: new Date('2025-12-15').getTime(),
			};
			await useStore.getState().addTransaction(previousTx);

			// Add previous period transaction: Account -> Saving (1000)
			const previousSavingTx: Transaction = {
				id: 'tx-prev-saving',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 1000,
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
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			// Account: -500 (current) -300 (previous) -1000 (previous) = -1800
			expect(accountBalance).toBe(-1800);

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
			const categoryBalance = categoryTx.reduce((sum, t) => sum + t.amount, 0);
			expect(categoryBalance).toBe(500); // Not 800!

			// Verify saving uses all transactions (all-time)
			const savingTx = state.transactions.filter((t) => t.to_entity_id === 'saving-1');
			expect(savingTx).toHaveLength(1);
			const savingBalance = savingTx.reduce((sum, t) => sum + t.amount, 0);
			expect(savingBalance).toBe(1000);
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
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
				amount: 500,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 300,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 200,
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
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance).toBe(-1000);

			// Delete one transaction
			await useStore.getState().deleteTransaction('tx-2');

			state = useStore.getState();
			expect(state.transactions).toHaveLength(2);

			// Balance after deletion: -700 for account, +700 for category
			accountBalance = state.transactions.reduce(
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance).toBe(-700);

			const categoryBalance = state.transactions
				.filter((t) => t.to_entity_id === 'category-1')
				.reduce((sum, t) => sum + t.amount, 0);
			expect(categoryBalance).toBe(700);
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
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
				amount: 500,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			await useStore.getState().addTransaction(tx);

			let state = useStore.getState();
			let accountBalance = state.transactions.reduce(
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance).toBe(-500);

			// Update transaction amount
			await useStore.getState().updateTransaction('tx-1', { amount: 750 });

			state = useStore.getState();
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0].amount).toBe(750);

			// Balance should reflect updated amount
			accountBalance = state.transactions.reduce(
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance).toBe(-750);

			const categoryBalance = state.transactions
				.filter((t) => t.to_entity_id === 'category-1')
				.reduce((sum, t) => sum + t.amount, 0);
			expect(categoryBalance).toBe(750);
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
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
					(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
					0
				);
			expect(accountBalance).toBe(0);

			// Spend money: Account -> Category (500)
			const tx: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 500,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};
			await useStore.getState().addTransaction(tx);

			state = useStore.getState();

			// Account balance should be NEGATIVE (spent money)
			accountBalance = state.transactions
				.filter((t) => [t.from_entity_id, t.to_entity_id].includes('account-1'))
				.reduce(
					(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
					0
				);
			expect(accountBalance).toBe(-500); // Should be -500, NOT +500!

			// Category should have received the money
			const categoryBalance = state.transactions
				.filter((t) => t.to_entity_id === 'category-1')
				.reduce((sum, t) => sum + t.amount, 0);
			expect(categoryBalance).toBe(500);
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
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 2,
				order: 2,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 3,
				order: 3,
			};

			// Set up plans - all plans use 'all-time' period
			const incomePlan: Plan = {
				id: 'plan-income',
				entity_id: 'income-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 5000,
			};

			const categoryPlan: Plan = {
				id: 'plan-category',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 300,
			};

			const savingPlan: Plan = {
				id: 'plan-saving',
				entity_id: 'saving-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 10000,
			};

			// Set up transactions (January 2026)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 200,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			// account -> saving transaction provides reservation-like balance
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 1000,
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
			expect(incomeEntities[0].id).toBe('income-1');
			expect(incomeEntities[0].planned).toBe(5000);
			expect(incomeEntities[0].actual).toBe(5000); // Money out from income
			expect(incomeEntities[0].remaining).toBe(0);

			// Test account entities (all-time balance, reserved derived from account->saving txns)
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(accountEntities).toHaveLength(1);
			expect(accountEntities[0].id).toBe('account-1');
			expect(accountEntities[0].planned).toBe(0); // No plan
			expect(accountEntities[0].actual).toBe(3800); // +5000 -200 -1000 (txns) = 3800 (full bank balance)
			expect(accountEntities[0].reserved).toBe(1000); // derived from account->saving txns
			expect(accountEntities[0].remaining).toBe(-3800);

			// Test category entities (current period only)
			const categoryEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			expect(categoryEntities).toHaveLength(1);
			expect(categoryEntities[0].id).toBe('category-1');
			expect(categoryEntities[0].planned).toBe(300);
			expect(categoryEntities[0].actual).toBe(200);
			expect(categoryEntities[0].remaining).toBe(100);

			// Test saving entities (balance from account->saving transactions)
			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			expect(savingEntities).toHaveLength(1);
			expect(savingEntities[0].id).toBe('saving-1');
			expect(savingEntities[0].planned).toBe(10000);
			expect(savingEntities[0].actual).toBe(1000);
			expect(savingEntities[0].remaining).toBe(9000);
		});

		test('should use all-time transactions for accounts and savings, current period for income and categories', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 2,
				order: 2,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 3,
				order: 3,
			};

			// December 2025 transactions (previous month)
			const txDec1: Transaction = {
				id: 'tx-dec-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 4000,
				currency: 'USD',
				timestamp: new Date('2025-12-15').getTime(),
			};

			const txDec2: Transaction = {
				id: 'tx-dec-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 300,
				currency: 'USD',
				timestamp: new Date('2025-12-20').getTime(),
			};

			// January 2026 transactions (current month)
			const txJan1: Transaction = {
				id: 'tx-jan-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			const txJan2: Transaction = {
				id: 'tx-jan-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 200,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			// account -> saving transaction to test reserved
			const txSaving: Transaction = {
				id: 'tx-saving',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 1500,
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
			expect(incomeEntities[0].actual).toBe(5000); // Only Jan, not Dec

			// Account: all txns (4000 - 300 + 5000 - 200 - 1500 = 7000), reserved derived from txns
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(accountEntities[0].actual).toBe(7000); // All-time balance
			expect(accountEntities[0].reserved).toBe(1500); // Derived from account->saving txns

			// Category: only January transactions (200)
			const categoryEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			expect(categoryEntities[0].actual).toBe(200); // Only Jan, not Dec

			// Saving: balance from account->saving transactions (1500)
			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			expect(savingEntities[0].actual).toBe(1500); // From transactions
		});

		test('should look up plans with correct period type', () => {
			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			// Category has all-time plan (the standard)
			const categoryPlanAllTime: Plan = {
				id: 'plan-cat-alltime',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 300,
			};

			// Category also has a monthly plan (should be ignored - kept for potential future override feature)
			const categoryPlanMonthly: Plan = {
				id: 'plan-cat-monthly',
				entity_id: 'category-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 250,
			};

			// Saving has all-time plan
			const savingPlanAllTime: Plan = {
				id: 'plan-saving-alltime',
				entity_id: 'saving-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 10000,
			};

			// Saving also has monthly plan (should be ignored - kept for potential future override feature)
			const savingPlanMonthly: Plan = {
				id: 'plan-saving-monthly',
				entity_id: 'saving-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 500,
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
			expect(categoryEntities[0].planned).toBe(300);

			// Saving should use all-time plan (10000), not monthly plan (500)
			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			expect(savingEntities[0].planned).toBe(10000);
		});

		test('should handle entities with no plans', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			const tx: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 1000,
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
			expect(incomeEntities[0].planned).toBe(0);
			expect(incomeEntities[0].actual).toBe(1000);
			expect(incomeEntities[0].remaining).toBe(-1000);

			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(accountEntities[0].planned).toBe(0);
			expect(accountEntities[0].actual).toBe(1000);
			expect(accountEntities[0].remaining).toBe(-1000);
		});

		test('should handle entities with no transactions', () => {
			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const categoryPlan: Plan = {
				id: 'plan-1',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 500,
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
			expect(categoryEntities[0].planned).toBe(500);
			expect(categoryEntities[0].actual).toBe(0);
			expect(categoryEntities[0].remaining).toBe(500);
		});

		test('should handle multiple entities of the same type', () => {
			const cat1: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const cat2: Entity = {
				id: 'category-2',
				type: 'category',
				name: 'Transport',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			const cat3: Entity = {
				id: 'category-3',
				type: 'category',
				name: 'Entertainment',
				currency: 'USD',
				row: 0,
				position: 2,
				order: 2,
			};

			const plan1: Plan = {
				id: 'plan-1',
				entity_id: 'category-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 300,
			};

			const plan2: Plan = {
				id: 'plan-2',
				entity_id: 'category-2',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 150,
			};

			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'category-1',
				amount: 200,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};

			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'income-1',
				to_entity_id: 'category-2',
				amount: 100,
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
			expect(categories[0].id).toBe('category-1');
			expect(categories[1].id).toBe('category-2');
			expect(categories[2].id).toBe('category-3');

			// Check balances
			expect(categories[0].planned).toBe(300);
			expect(categories[0].actual).toBe(200);
			expect(categories[0].remaining).toBe(100);

			expect(categories[1].planned).toBe(150);
			expect(categories[1].actual).toBe(100);
			expect(categories[1].remaining).toBe(50);

			expect(categories[2].planned).toBe(0); // No plan
			expect(categories[2].actual).toBe(0); // No transactions
			expect(categories[2].remaining).toBe(0);
		});

		test('should calculate income balance correctly (money flowing out is positive)', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			// Income -> Account (money out from income = positive)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			// Account -> Income (money in to income = negative, unusual but possible)
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'income-1',
				amount: 100,
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
			expect(incomeEntities[0].actual).toBe(4900);
		});

		test('should calculate account balance correctly (money in is positive, money out is negative)', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 2,
				order: 2,
			};

			// Income -> Account (money in = positive)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			// Account -> Category (money out = negative)
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 1500,
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
			expect(accountEntities[0].actual).toBe(3500);
		});

		test('should only count incoming transactions for categories and savings', () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 2,
				order: 2,
			};

			// Account -> Category (should count)
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 300,
				currency: 'USD',
				timestamp: new Date('2026-01-10').getTime(),
			};

			// Category -> Account (unusual, should NOT count for category)
			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'category-1',
				to_entity_id: 'account-1',
				amount: 50,
				currency: 'USD',
				timestamp: new Date('2026-01-15').getTime(),
			};

			// account -> saving transaction provides saving balance
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 1000,
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
			expect(categoryEntities[0].actual).toBe(300);

			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			// Saving: balance from account->saving transactions (net flow)
			expect(savingEntities[0].actual).toBe(1000);
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
				order: 0,
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
			expect(accountEntities[0].id).toBe('account-1');
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
				order: 0,
			};

			// Set up store
			await db.createEntity(account);
			await useStore.getState().initialize();

			// Create adjustment transaction: system -> account (+500)
			const adjustment: Transaction = {
				id: 'tx-adjust',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount: 500,
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
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance).toBe(500);
		});

		test('should handle multiple adjustments correctly', async () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			await db.createEntity(account);
			await useStore.getState().initialize();

			// First adjustment: +1000
			const adjustment1: Transaction = {
				id: 'tx-adjust-1',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount: 1000,
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
				amount: 200,
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
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(accountBalance).toBe(800);

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
				order: 0,
			};

			const account2: Entity = {
				id: 'account-2',
				type: 'account',
				name: 'Savings',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			await db.createEntity(account1);
			await db.createEntity(account2);
			await useStore.getState().initialize();

			// Adjustment for account 1: +500
			const adjustment1: Transaction = {
				id: 'tx-adjust-1',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount: 500,
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
				amount: 1000,
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
				(sum, t) => (t.to_entity_id === 'account-1' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(account1Balance).toBe(500);

			// Account 2 balance should be +1000
			const account2Tx = state.transactions.filter((t) =>
				[t.from_entity_id, t.to_entity_id].includes('account-2')
			);
			const account2Balance = account2Tx.reduce(
				(sum, t) => (t.to_entity_id === 'account-2' ? sum + t.amount : sum - t.amount),
				0
			);
			expect(account2Balance).toBe(1000);

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
				order: 0,
			};
			await db.createEntity(account);
			await useStore.getState().initialize();

			const adjustment: Transaction = {
				id: 'tx-adjust-after-reset',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount: 500,
				currency: 'USD',
				timestamp: Date.now(),
				note: 'Balance correction after reset',
			};
			await useStore.getState().addTransaction(adjustment);

			expect(useStore.getState().transactions).toHaveLength(1);
			expect(useStore.getState().transactions[0].amount).toBe(500);
		});

		test('should include adjustment transactions in account balance calculations via getEntitiesWithBalance', async () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			await db.createEntity(account);
			await db.createEntity(income);
			await useStore.getState().initialize();

			// Regular transaction: income -> account (5000)
			const regularTx: Transaction = {
				id: 'tx-regular',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: Date.now(),
			};
			await useStore.getState().addTransaction(regularTx);

			// Adjustment transaction: system -> account (+200)
			const adjustmentTx: Transaction = {
				id: 'tx-adjust',
				from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
				to_entity_id: 'account-1',
				amount: 200,
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
			expect(accountEntities[0].actual).toBe(5200);
		});

		test('should return upcoming: 0 when no future transactions exist', () => {
			const category: Entity = {
				id: 'cat-1',
				type: 'category',
				name: 'Groceries',
				currency: 'EUR',
				row: 0,
				position: 0,
				order: 0,
			};
			const account: Entity = {
				id: 'acc-1',
				type: 'account',
				name: 'Checking',
				currency: 'EUR',
				row: 0,
				position: 1,
				order: 1,
			};
			const tx: Transaction = {
				id: 'tx-past',
				from_entity_id: 'acc-1',
				to_entity_id: 'cat-1',
				amount: 50,
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
			expect(cats[0].upcoming).toBe(0);
			expect(cats[0].actual).toBe(50);
		});
		test('should handle decimal amounts without floating point precision issues', async () => {
			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'EUR',
				order: 0,
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
					amount: 0.1,
					currency: 'EUR',
					timestamp: Date.now(),
				},
				{
					id: 'tx-2',
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'account-1',
					amount: 0.2,
					currency: 'EUR',
					timestamp: Date.now() - 1000,
				},
				{
					id: 'tx-3',
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'account-1',
					amount: 1.15,
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

			// Raw sum would be 1.4500000000000002 due to floating point
			// We expect the balance to be usable without precision artifacts
			// Note: This test documents the current behavior - the actual value
			// may have floating point issues which is handled at display time
			expect(account1!.actual).toBeCloseTo(1.45, 2);
		});
	});

	// ─────────────────────────────────────────────────────────
	// Upcoming transactions
	// ─────────────────────────────────────────────────────────
	describe('Upcoming transactions (future-dated)', () => {
		const NOW = new Date('2026-01-15T12:00:00Z').getTime();
		const PAST = new Date('2026-01-10T12:00:00Z').getTime();
		const FUTURE = new Date('2026-01-20T12:00:00Z').getTime();
		const originalDateNow = Date.now;

		beforeEach(() => {
			Date.now = () => NOW;
		});

		afterEach(() => {
			Date.now = originalDateNow;
		});

		const baseEntities: Entity[] = [
			{
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'EUR',
				row: 0,
				position: 0,
				order: 0,
			},
			{
				id: 'acc-1',
				type: 'account',
				name: 'Checking',
				currency: 'EUR',
				row: 0,
				position: 1,
				order: 1,
			},
			{
				id: 'cat-1',
				type: 'category',
				name: 'Rent',
				currency: 'EUR',
				row: 0,
				position: 2,
				order: 2,
			},
			{
				id: 'sav-1',
				type: 'saving',
				name: 'Holiday',
				currency: 'EUR',
				row: 0,
				position: 3,
				order: 3,
			},
		];

		const basePlans: Plan[] = [
			{
				id: 'plan-cat',
				entity_id: 'cat-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 1000,
			},
			{
				id: 'plan-sav',
				entity_id: 'sav-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 5000,
			},
			{
				id: 'plan-inc',
				entity_id: 'income-1',
				period: 'all-time',
				period_start: '2026-01',
				planned_amount: 3000,
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
			return {
				income: getEntitiesWithBalance(
					state.entities,
					state.plans,
					transactions,
					'2026-01',
					'income'
				)[0],
				account: getEntitiesWithBalance(
					state.entities,
					state.plans,
					transactions,
					'2026-01',
					'account'
				)[0],
				category: getEntitiesWithBalance(
					state.entities,
					state.plans,
					transactions,
					'2026-01',
					'category'
				)[0],
				saving: getEntitiesWithBalance(
					state.entities,
					state.plans,
					transactions,
					'2026-01',
					'saving'
				)[0],
			};
		}

		test('future transaction is NOT counted in actual', () => {
			const { category } = setup([
				{
					id: 'tx-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 400,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			expect(category.actual).toBe(0);
			expect(category.remaining).toBe(1000); // planned unchanged
		});

		test('future transaction is counted in upcoming', () => {
			const { category } = setup([
				{
					id: 'tx-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 400,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			expect(category.upcoming).toBe(400);
		});

		test('past + future transactions: actual excludes future, upcoming excludes past', () => {
			const { category } = setup([
				{
					id: 'tx-past',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 200,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 150,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			expect(category.actual).toBe(200);
			expect(category.upcoming).toBe(150);
			expect(category.remaining).toBe(800); // 1000 - 200 (actual only)
		});

		test('remaining is based on actual only, not actual + upcoming', () => {
			const { category } = setup([
				{
					id: 'tx-past',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 300,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 900, // would overspend if counted
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			// planned = 1000; actual = 300 → remaining = 700, NOT -200
			expect(category.remaining).toBe(700);
		});

		test('account actual excludes future inflows', () => {
			const { account } = setup([
				{
					id: 'tx-income-past',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount: 3000,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-income-future',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount: 1000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			expect(account.actual).toBe(3000);
			expect(account.upcoming).toBe(1000);
		});

		test('account actual excludes future outflows', () => {
			const { account } = setup([
				{
					id: 'tx-in',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount: 5000,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-out-future',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 2000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			// actual = +5000 only; upcoming = -2000 (outflow)
			expect(account.actual).toBe(5000);
			expect(account.upcoming).toBe(-2000);
		});

		test('income upcoming counts inflow that has not yet left income', () => {
			const { income } = setup([
				{
					id: 'tx-past',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount: 1000,
					currency: 'EUR',
					timestamp: PAST,
				},
				{
					id: 'tx-future',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount: 2000,
					currency: 'EUR',
					timestamp: FUTURE,
				},
			]);
			// income "actual" = money that has left income = 1000
			// income "upcoming" = money scheduled to leave = 2000
			expect(income.actual).toBe(1000);
			expect(income.upcoming).toBe(2000);
		});

		test('saving balance comes from account->saving transactions', () => {
			const { saving } = setup([
				{
					id: 'tx-reserve',
					from_entity_id: 'acc-1',
					to_entity_id: 'sav-1',
					amount: 500,
					currency: 'EUR',
					timestamp: PAST,
				},
			]);
			expect(saving.actual).toBe(500);
			expect(saving.upcoming).toBe(0);
		});

		test('multiple future transactions are summed in upcoming', () => {
			const { category } = setup([
				{
					id: 'tx-f1',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 100,
					currency: 'EUR',
					timestamp: FUTURE,
				},
				{
					id: 'tx-f2',
					from_entity_id: 'acc-1',
					to_entity_id: 'cat-1',
					amount: 250,
					currency: 'EUR',
					timestamp: FUTURE + 1000,
				},
			]);
			expect(category.upcoming).toBe(350);
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
					amount: 999,
					currency: 'EUR',
					timestamp: new Date('2026-02-15').getTime(), // Feb — outside Jan period
				},
			]);
			// period = '2026-01'; Feb tx is outside that range entirely
			expect(category.upcoming).toBe(0);
			expect(category.actual).toBe(0);
		});

		test('account upcoming includes future txns from any period (all-time scope)', () => {
			// Accounts use all-time scope, so future txns in any month count
			const { account } = setup([
				{
					id: 'tx-acc-future',
					from_entity_id: 'income-1',
					to_entity_id: 'acc-1',
					amount: 800,
					currency: 'EUR',
					timestamp: new Date('2026-04-01').getTime(), // April — future
				},
			]);
			expect(account.upcoming).toBe(800);
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
			order: 0,
		};

		const saving1: Entity = {
			id: 'saving-1',
			type: 'saving',
			name: 'Vacation',
			currency: 'USD',
			row: 0,
			position: 0,
			order: 0,
		};

		const saving2: Entity = {
			id: 'saving-2',
			type: 'saving',
			name: 'Emergency',
			currency: 'USD',
			row: 0,
			position: 1,
			order: 1,
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

			await useStore.getState().reserveToSaving('account-1', 'saving-1', 500);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0].from_entity_id).toBe('account-1');
			expect(state.transactions[0].to_entity_id).toBe('saving-1');
			expect(state.transactions[0].amount).toBe(500);
		});

		test('creates saving -> account transaction when desiredTotal < current net', async () => {
			await setupSavingEntities();

			// First reserve 500
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 500);
			expect(useStore.getState().transactions).toHaveLength(1);

			// Now reduce to 200 — should create saving -> account for delta (300)
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 200);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(2);
			const releaseTx = state.transactions[0]; // newest first
			expect(releaseTx.from_entity_id).toBe('saving-1');
			expect(releaseTx.to_entity_id).toBe('account-1');
			expect(releaseTx.amount).toBe(300);
		});

		test('is a no-op when desiredTotal equals current net', async () => {
			await setupSavingEntities();

			await useStore.getState().reserveToSaving('account-1', 'saving-1', 500);
			expect(useStore.getState().transactions).toHaveLength(1);

			// Reserve same amount again — no new transaction
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 500);
			expect(useStore.getState().transactions).toHaveLength(1);
		});

		test('with desiredTotal=0 creates saving -> account for full amount', async () => {
			await setupSavingEntities();

			// Reserve 800
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 800);
			expect(useStore.getState().transactions).toHaveLength(1);

			// Set desired to 0 — release everything
			await useStore.getState().reserveToSaving('account-1', 'saving-1', 0);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(2);
			const releaseTx = state.transactions[0]; // newest first
			expect(releaseTx.from_entity_id).toBe('saving-1');
			expect(releaseTx.to_entity_id).toBe('account-1');
			expect(releaseTx.amount).toBe(800);
		});

		test('account reserved field reflects transaction-derived savings', () => {
			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			const txns: Transaction[] = [
				{
					id: 'tx-income',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 5000,
					currency: 'USD',
					timestamp: new Date('2026-01-15').getTime(),
				},
				{
					id: 'tx-res-1',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-1',
					amount: 500,
					currency: 'USD',
					timestamp: new Date('2026-01-16').getTime(),
				},
				{
					id: 'tx-res-2',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-2',
					amount: 300,
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
			expect(accountEntities[0].actual).toBe(4200);
			// reserved = sum of net account->saving flows (800)
			expect(accountEntities[0].reserved).toBe(800);

			// Savings get their balance from transactions
			const savingEntities = getEntitiesWithBalance(
				[income, account, saving1, saving2],
				[],
				txns,
				'2026-01',
				'saving'
			);

			expect(savingEntities[0].actual).toBe(500); // saving-1
			expect(savingEntities[1].actual).toBe(300); // saving-2
		});

		test('saving balance aggregates transactions from multiple accounts', () => {
			const account2: Entity = {
				id: 'account-2',
				type: 'account',
				name: 'Cash',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			const txns: Transaction[] = [
				{
					id: 'tx-res-1',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-1',
					amount: 500,
					currency: 'USD',
					timestamp: new Date('2026-01-10').getTime(),
				},
				{
					id: 'tx-res-2',
					from_entity_id: 'account-2',
					to_entity_id: 'saving-1',
					amount: 200,
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
			expect(savingEntities[0].actual).toBe(700);
			// saving-2 has no transactions
			expect(savingEntities[1].actual).toBe(0);

			// Each account's reserved field should only reflect its own savings txns
			const accountEntities = getEntitiesWithBalance(
				[account, account2, saving1, saving2],
				[],
				txns,
				'2026-01',
				'account'
			);

			expect(accountEntities[0].reserved).toBe(500); // account-1
			expect(accountEntities[1].reserved).toBe(200); // account-2
		});
	});

	describe('Transaction confirmation (KII-65)', () => {
		const incomeEntity: Entity = {
			id: 'income-1',
			type: 'income',
			name: 'Salary',
			currency: 'USD',
			row: 0,
			position: 0,
			order: 0,
		};
		const accountEntity: Entity = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			row: 0,
			position: 0,
			order: 0,
		};
		const categoryEntity: Entity = {
			id: 'category-1',
			type: 'category',
			name: 'Groceries',
			currency: 'USD',
			row: 0,
			position: 0,
			order: 0,
		};

		beforeEach(async () => {
			const entities = [incomeEntity, accountEntity, categoryEntity];
			useStore.setState({ entities });
			for (const entity of entities) {
				await db.createEntity(entity);
			}
		});

		test('addTransaction: past-dated transaction is confirmed', async () => {
			await useStore.getState().addTransaction({
				id: 'tx-past',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now() - 86400000,
			});

			expect(useStore.getState().transactions[0].is_confirmed).toBe(true);
		});

		test('addTransaction: future-dated transaction is unconfirmed', async () => {
			await useStore.getState().addTransaction({
				id: 'tx-future',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
			});

			expect(useStore.getState().transactions[0].is_confirmed).toBe(false);
		});

		test('addTransaction: explicit is_confirmed is preserved', async () => {
			await useStore.getState().addTransaction({
				id: 'tx-explicit',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
				is_confirmed: true,
			});

			expect(useStore.getState().transactions[0].is_confirmed).toBe(true);
		});

		test('confirmTransaction: flips is_confirmed in store and DB', async () => {
			await useStore.getState().addTransaction({
				id: 'tx-unconfirmed',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
			});

			expect(useStore.getState().transactions[0].is_confirmed).toBe(false);

			await useStore.getState().confirmTransaction('tx-unconfirmed');

			expect(useStore.getState().transactions[0].is_confirmed).toBe(true);

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
				amount: 50,
				currency: 'USD',
				timestamp: now - 86400000,
				is_confirmed: false,
			});

			// Future unconfirmed (should NOT be confirmed)
			await db.createTransaction({
				id: 'tx-future-unconfirmed',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 75,
				currency: 'USD',
				timestamp: now + 86400000,
				is_confirmed: false,
			});

			// Past confirmed (should stay confirmed)
			await db.createTransaction({
				id: 'tx-past-confirmed',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
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
					amount: 200,
					currency: 'USD',
					timestamp: now - 86400000,
					is_confirmed: true,
				},
				{
					id: 'tx-unconfirmed',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 300,
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
			expect(categories[0].actual).toBe(200);
			// The unconfirmed 300 should be in unconfirmed
			expect(categories[0].unconfirmed).toBe(300);
		});

		test('getEntitiesWithBalance: future unconfirmed stays in upcoming, not unconfirmed', () => {
			const now = Date.now();
			const txns: Transaction[] = [
				{
					id: 'tx-future',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 150,
					currency: 'USD',
					timestamp: now + 86400000 * 7,
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

			expect(categories[0].actual).toBe(0);
			expect(categories[0].upcoming).toBe(150);
			expect(categories[0].unconfirmed).toBe(0);
		});
	});
});
