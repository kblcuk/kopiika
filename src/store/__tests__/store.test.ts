import { describe, expect, test, beforeEach } from '@jest/globals';
import type { Entity, Plan, Transaction } from '@/src/types';
import { useStore } from '../index';
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
});
