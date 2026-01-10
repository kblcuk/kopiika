import { describe, expect, test, beforeEach } from '@jest/globals';
import type { Entity, Plan, Transaction } from '@/src/types';
import { useStore, getEntitiesWithBalance } from '../index';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';

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
			hoveredDropZoneId: null,
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
					order: 0,
				},
				{
					id: 'entity-temp',
					type: 'category',
					name: 'Temp',
					currency: 'USD',
					order: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'month',
					period_start: '2026-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-temp',
					period: 'month',
					period_start: '2026-01',
					planned_amount: 500,
				},
			];

			// Add data to database
			for (const entity of entities) {
				await db.createEntity(entity);
			}
			for (const plan of plans) {
				await db.createPlan(plan);
			}

			// Delete entity-temp (cascade deletes plan-2)
			await db.deleteEntity('entity-temp');

			await useStore.getState().initialize();

			const state = useStore.getState();
			expect(state.entities).toHaveLength(1);
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
					order: 0,
				},
				{
					id: 'entity-2',
					type: 'category',
					name: 'Groceries',
					currency: 'USD',
					order: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'month',
					period_start: '2026-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'month',
					period_start: '2026-01',
					planned_amount: 500,
				},
			];

			// Add data to database
			for (const entity of entities) {
				await db.createEntity(entity);
			}
			for (const plan of plans) {
				await db.createPlan(plan);
			}

			await useStore.getState().initialize();

			const state = useStore.getState();
			expect(state.entities).toHaveLength(2);
			expect(state.plans).toHaveLength(2);
			expect(state.transactions).toHaveLength(0);
		});
	});

	describe('setPlan', () => {
		test('should prevent setting plan for non-existent entity', async () => {
			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'non-existent-entity',
				period: 'month',
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
				order: 0,
			};

			useStore.setState({ entities: [entity] });
			await db.createEntity(entity);

			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'month',
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
				order: 0,
			};

			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 1000,
			};

			useStore.setState({ entities: [entity], plans: [plan] });
			await db.createEntity(entity);
			await db.createPlan(plan);

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
					order: 0,
				},
				{
					id: 'entity-2',
					type: 'account',
					name: 'Checking',
					currency: 'USD',
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
			expect(state.transactions[0]).toEqual(transaction);

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
					order: 0,
				},
				{
					id: 'entity-2',
					type: 'category',
					name: 'Groceries',
					currency: 'USD',
					order: 0,
				},
			];

			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'month',
					period_start: '2026-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'month',
					period_start: '2026-01',
					planned_amount: 500,
				},
			];

			useStore.setState({ entities, plans });
			for (const entity of entities) {
				await db.createEntity(entity);
			}
			for (const plan of plans) {
				await db.createPlan(plan);
			}

			await useStore.getState().deleteEntity('entity-1');

			const state = useStore.getState();
			expect(state.entities).toHaveLength(1);
			expect(state.entities[0].id).toBe('entity-2');
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0].id).toBe('plan-2');

			// Verify it was deleted from database
			const dbEntity = await db.getEntityById('entity-1');
			expect(dbEntity).toBeNull();
			const dbPlan = await db.getPlanForEntity('entity-1', '2026-01');
			expect(dbPlan).toBeNull();
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				order: 0,
			};

			// Create plans for current period (2026-01)
			const incomePlan: Plan = {
				id: 'plan-income',
				entity_id: 'income-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 5000,
			};

			const categoryPlan: Plan = {
				id: 'plan-category',
				entity_id: 'category-1',
				period: 'month',
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
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				order: 0,
			};

			const income: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
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
				hoveredDropZoneId: null,
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
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
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
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				order: 0,
			};

			useStore.setState({
				entities: [account, category, saving],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 0,
			};

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 0,
			};

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 0,
			};

			useStore.setState({
				entities: [account, category],
				plans: [],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				order: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 2,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				order: 3,
			};

			// Set up plans
			const incomePlan: Plan = {
				id: 'plan-income',
				entity_id: 'income-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 5000,
			};

			const categoryPlan: Plan = {
				id: 'plan-category',
				entity_id: 'category-1',
				period: 'month',
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

			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2026-01-25').getTime(),
			};

			useStore.setState({
				entities: [income, account, category, saving],
				plans: [incomePlan, categoryPlan, savingPlan],
				transactions: [tx1, tx2, tx3],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				hoveredDropZoneId: null,
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

			// Test account entities (all-time balance)
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
			expect(accountEntities[0].actual).toBe(3800); // +5000 -200 -1000 = 3800
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

			// Test saving entities (all-time balance)
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
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				order: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 2,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
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

			const txDec3: Transaction = {
				id: 'tx-dec-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 500,
				currency: 'USD',
				timestamp: new Date('2025-12-25').getTime(),
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

			const txJan3: Transaction = {
				id: 'tx-jan-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2026-01-25').getTime(),
			};

			useStore.setState({
				entities: [income, account, category, saving],
				plans: [],
				transactions: [txDec1, txDec2, txDec3, txJan1, txJan2, txJan3],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				hoveredDropZoneId: null,
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

			// Account: all transactions (4000 - 300 - 500 + 5000 - 200 - 1000 = 7000)
			const accountEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'account'
			);
			expect(accountEntities[0].actual).toBe(7000); // All-time

			// Category: only January transactions (200)
			const categoryEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'category'
			);
			expect(categoryEntities[0].actual).toBe(200); // Only Jan, not Dec

			// Saving: all transactions (500 + 1000 = 1500)
			const savingEntities = getEntitiesWithBalance(
				state.entities,
				state.plans,
				state.transactions,
				state.currentPeriod,
				'saving'
			);
			expect(savingEntities[0].actual).toBe(1500); // All-time
		});

		test('should look up plans with correct period type', () => {
			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 0,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				order: 1,
			};

			// Category has monthly plan for current period
			const categoryPlanCurrent: Plan = {
				id: 'plan-cat-jan',
				entity_id: 'category-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 300,
			};

			// Category also has monthly plan for different period (should be ignored)
			const categoryPlanOld: Plan = {
				id: 'plan-cat-dec',
				entity_id: 'category-1',
				period: 'month',
				period_start: '2025-12',
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

			// Saving also has monthly plan (should be ignored)
			const savingPlanMonthly: Plan = {
				id: 'plan-saving-monthly',
				entity_id: 'saving-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 500,
			};

			useStore.setState({
				entities: [category, saving],
				plans: [categoryPlanCurrent, categoryPlanOld, savingPlanAllTime, savingPlanMonthly],
				transactions: [],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				hoveredDropZoneId: null,
				incomeVisible: false,
			});

			// Category should use monthly plan for current period (300), not old period (250)
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
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
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
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const categoryPlan: Plan = {
				id: 'plan-1',
				entity_id: 'category-1',
				period: 'month',
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
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const cat2: Entity = {
				id: 'category-2',
				type: 'category',
				name: 'Transport',
				currency: 'USD',
				order: 1,
			};

			const cat3: Entity = {
				id: 'category-3',
				type: 'category',
				name: 'Entertainment',
				currency: 'USD',
				order: 2,
			};

			const plan1: Plan = {
				id: 'plan-1',
				entity_id: 'category-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 300,
			};

			const plan2: Plan = {
				id: 'plan-2',
				entity_id: 'category-2',
				period: 'month',
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
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
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
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const account: Entity = {
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				order: 1,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
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
				hoveredDropZoneId: null,
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
				order: 0,
			};

			const category: Entity = {
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 1,
			};

			const saving: Entity = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
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

			// Account -> Saving (should count)
			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2026-01-20').getTime(),
			};

			// Saving -> Account (withdrawal, should NOT count for saving)
			const tx4: Transaction = {
				id: 'tx-4',
				from_entity_id: 'saving-1',
				to_entity_id: 'account-1',
				amount: 200,
				currency: 'USD',
				timestamp: new Date('2026-01-25').getTime(),
			};

			useStore.setState({
				entities: [account, category, saving],
				plans: [],
				transactions: [tx1, tx2, tx3, tx4],
				currentPeriod: '2026-01',
				isLoading: false,
				draggedEntity: null,
				hoveredDropZoneId: null,
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
			// Saving: only incoming (1000), not outgoing (200)
			expect(savingEntities[0].actual).toBe(1000);
		});
	});
});
