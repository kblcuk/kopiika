import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import type { Entity, Plan, Transaction } from '@/src/types';
import { useStore } from '../index';
import * as db from '@/src/db';

// Mock the db module
jest.mock('@/src/db');

describe('Store Data Integrity', () => {
	beforeEach(() => {
		// Reset store state before each test
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

		// Clear all mocks
		jest.clearAllMocks();
	});

	describe('initialize', () => {
		test('should filter out orphaned plans during initialization', async () => {
			// Setup: Database returns plans for entities that don't exist
			const entities: Entity[] = [
				{
					id: 'entity-1',
					type: 'account',
					name: 'Checking',
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
				// Orphaned plan - entity doesn't exist
				{
					id: 'plan-2',
					entity_id: 'deleted-entity',
					period: 'month',
					period_start: '2026-01',
					planned_amount: 500,
				},
			];

			jest.mocked(db.getAllEntities).mockResolvedValue(entities);
			jest.mocked(db.getAllPlans).mockResolvedValue(plans);
			jest.mocked(db.getAllTransactions).mockResolvedValue([]);

			// Execute
			await useStore.getState().initialize();

			// Verify: Only valid plans are loaded
			const state = useStore.getState();
			expect(state.entities).toHaveLength(1);
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0].id).toBe('plan-1');
			expect(state.isLoading).toBe(false);
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

			jest.mocked(db.getAllEntities).mockResolvedValue(entities);
			jest.mocked(db.getAllPlans).mockResolvedValue(plans);
			jest.mocked(db.getAllTransactions).mockResolvedValue([]);

			await useStore.getState().initialize();

			const state = useStore.getState();
			expect(state.entities).toHaveLength(2);
			expect(state.plans).toHaveLength(2);
		});
	});

	describe('setPlan', () => {
		test('should prevent setting plan for non-existent entity', async () => {
			// Setup: Store has one entity
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
				plans: [],
			});

			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'non-existent-entity',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 1000,
			};

			// Execute
			await useStore.getState().setPlan(plan);

			// Verify: Plan was not added and db was not called
			const state = useStore.getState();
			expect(state.plans).toHaveLength(0);
			expect(db.upsertPlan).not.toHaveBeenCalled();
		});

		test('should allow setting plan for existing entity', async () => {
			const entity: Entity = {
				id: 'entity-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				order: 0,
			};

			useStore.setState({
				entities: [entity],
				plans: [],
			});

			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 1000,
			};

			jest.mocked(db.upsertPlan).mockResolvedValue();

			await useStore.getState().setPlan(plan);

			const state = useStore.getState();
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0]).toEqual(plan);
			expect(db.upsertPlan).toHaveBeenCalledWith(plan);
		});

		test('should update existing plan', async () => {
			const entity: Entity = {
				id: 'entity-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				order: 0,
			};

			const existingPlan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 1000,
			};

			useStore.setState({
				entities: [entity],
				plans: [existingPlan],
			});

			const updatedPlan: Plan = {
				...existingPlan,
				planned_amount: 2000,
			};

			jest.mocked(db.upsertPlan).mockResolvedValue();

			await useStore.getState().setPlan(updatedPlan);

			const state = useStore.getState();
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0].planned_amount).toBe(2000);
			expect(db.upsertPlan).toHaveBeenCalledWith(updatedPlan);
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
				transactions: [],
			});

			const transaction: Transaction = {
				id: 'txn-1',
				from_entity_id: 'non-existent',
				to_entity_id: 'entity-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await useStore.getState().addTransaction(transaction);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(0);
			expect(db.createTransaction).not.toHaveBeenCalled();
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
				transactions: [],
			});

			const transaction: Transaction = {
				id: 'txn-1',
				from_entity_id: 'entity-1',
				to_entity_id: 'non-existent',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await useStore.getState().addTransaction(transaction);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(0);
			expect(db.createTransaction).not.toHaveBeenCalled();
		});

		test('should allow transaction between existing entities', async () => {
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

			useStore.setState({
				entities,
				transactions: [],
			});

			const transaction: Transaction = {
				id: 'txn-1',
				from_entity_id: 'entity-1',
				to_entity_id: 'entity-2',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			jest.mocked(db.createTransaction).mockResolvedValue();

			await useStore.getState().addTransaction(transaction);

			const state = useStore.getState();
			expect(state.transactions).toHaveLength(1);
			expect(state.transactions[0]).toEqual(transaction);
			expect(db.createTransaction).toHaveBeenCalledWith(transaction);
		});
	});

	describe('deleteEntity', () => {
		test('should remove entity and its plans from store', async () => {
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

			const otherPlan: Plan = {
				id: 'plan-2',
				entity_id: 'entity-2',
				period: 'month',
				period_start: '2026-01',
				planned_amount: 500,
			};

			useStore.setState({
				entities: [
					entity,
					{
						id: 'entity-2',
						type: 'category',
						name: 'Groceries',
						currency: 'USD',
						order: 0,
					},
				],
				plans: [plan, otherPlan],
			});

			jest.mocked(db.deleteEntity).mockResolvedValue();

			await useStore.getState().deleteEntity('entity-1');

			const state = useStore.getState();
			expect(state.entities).toHaveLength(1);
			expect(state.entities[0].id).toBe('entity-2');
			expect(state.plans).toHaveLength(1);
			expect(state.plans[0].id).toBe('plan-2');
			expect(db.deleteEntity).toHaveBeenCalledWith('entity-1');
		});
	});
});
