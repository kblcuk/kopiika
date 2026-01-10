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
});
