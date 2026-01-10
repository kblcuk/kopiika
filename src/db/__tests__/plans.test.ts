import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import type * as SQLite from 'expo-sqlite';
import type { Plan, Entity } from '@/src/types';
import {
	getAllPlans,
	getPlansByPeriod,
	getPlanForEntity,
	createPlan,
	updatePlan,
	upsertPlan,
	deletePlan,
} from '../plans';
import { createEntity } from '../entities';
import { createTestDatabase } from './test-utils';

jest.mock('@/src/db/schema');

import { getDatabase } from '../schema';

describe('plans.ts', () => {
	let testDb: SQLite.SQLiteDatabase;

	beforeEach(async () => {
		testDb = await createTestDatabase();
		jest.mocked(getDatabase).mockResolvedValue(testDb);

		// Create test entities for foreign key constraints
		const entities: Entity[] = [
			{ id: 'entity-1', type: 'account', name: 'Account 1', currency: 'USD', order: 0 },
			{ id: 'entity-2', type: 'category', name: 'Category 1', currency: 'USD', order: 0 },
			{ id: 'entity-3', type: 'saving', name: 'Saving 1', currency: 'USD', order: 0 },
		];

		for (const entity of entities) {
			await createEntity(entity);
		}
	});

	describe('createPlan', () => {
		test('should create a new plan', async () => {
			const plan: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			await createPlan(plan);

			const result = await testDb.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', [
				'plan-1',
			]);
			expect(result).toEqual(plan);
		});

		test('should create multiple plans for same entity in different periods', async () => {
			const plan1: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			const plan2: Plan = {
				id: 'plan-2',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-02',
				planned_amount: 1200,
			};

			await createPlan(plan1);
			await createPlan(plan2);

			const plans = await getAllPlans();
			expect(plans).toHaveLength(2);
		});

		test('should create plans for different entities in same period', async () => {
			const plan1: Plan = {
				id: 'plan-1',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			const plan2: Plan = {
				id: 'plan-2',
				entity_id: 'entity-2',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 500,
			};

			await createPlan(plan1);
			await createPlan(plan2);

			const plans = await getPlansByPeriod('2025-01');
			expect(plans).toHaveLength(2);
		});
	});

	describe('getAllPlans', () => {
		test('should return empty array when no plans exist', async () => {
			const result = await getAllPlans();
			expect(result).toEqual([]);
		});

		test('should return all plans ordered by period_start DESC', async () => {
			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'month',
					period_start: '2025-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'month',
					period_start: '2025-03',
					planned_amount: 1500,
				},
				{
					id: 'plan-3',
					entity_id: 'entity-3',
					period: 'month',
					period_start: '2025-02',
					planned_amount: 1200,
				},
			];

			for (const plan of plans) {
				await createPlan(plan);
			}

			const result = await getAllPlans();
			expect(result).toHaveLength(3);
			// Should be ordered by period_start DESC
			expect(result[0].period_start).toBe('2025-03');
			expect(result[1].period_start).toBe('2025-02');
			expect(result[2].period_start).toBe('2025-01');
		});
	});

	describe('getPlansByPeriod', () => {
		beforeEach(async () => {
			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'month',
					period_start: '2025-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'month',
					period_start: '2025-01',
					planned_amount: 500,
				},
				{
					id: 'plan-3',
					entity_id: 'entity-3',
					period: 'month',
					period_start: '2025-02',
					planned_amount: 1200,
				},
			];

			for (const plan of plans) {
				await createPlan(plan);
			}
		});

		test('should return only plans for specified period', async () => {
			const result = await getPlansByPeriod('2025-01');
			expect(result).toHaveLength(2);
			expect(result.every((p) => p.period_start === '2025-01')).toBe(true);
		});

		test('should return empty array for period with no plans', async () => {
			const result = await getPlansByPeriod('2025-12');
			expect(result).toEqual([]);
		});
	});

	describe('getPlanForEntity', () => {
		beforeEach(async () => {
			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'month',
					period_start: '2025-01',
					planned_amount: 1000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-1',
					period: 'month',
					period_start: '2025-02',
					planned_amount: 1200,
				},
				{
					id: 'plan-3',
					entity_id: 'entity-2',
					period: 'month',
					period_start: '2025-01',
					planned_amount: 500,
				},
			];

			for (const plan of plans) {
				await createPlan(plan);
			}
		});

		test('should return plan for specific entity and period', async () => {
			const result = await getPlanForEntity('entity-1', '2025-01');
			expect(result).not.toBeNull();
			expect(result?.id).toBe('plan-1');
			expect(result?.planned_amount).toBe(1000);
		});

		test('should return null when no plan exists for entity and period', async () => {
			const result = await getPlanForEntity('entity-3', '2025-01');
			expect(result).toBeNull();
		});

		test('should distinguish between different periods for same entity', async () => {
			const jan = await getPlanForEntity('entity-1', '2025-01');
			const feb = await getPlanForEntity('entity-1', '2025-02');

			expect(jan?.planned_amount).toBe(1000);
			expect(feb?.planned_amount).toBe(1200);
		});
	});

	describe('updatePlan', () => {
		test('should update existing plan', async () => {
			const original: Plan = {
				id: 'plan-update',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			await createPlan(original);

			const updated: Plan = {
				id: 'plan-update',
				entity_id: 'entity-2',
				period: 'month',
				period_start: '2025-02',
				planned_amount: 2000,
			};

			await updatePlan(updated);

			const result = await testDb.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', [
				'plan-update',
			]);
			expect(result).toEqual(updated);
		});

		test('should update only planned_amount', async () => {
			const original: Plan = {
				id: 'plan-update-2',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			await createPlan(original);

			const updated: Plan = {
				...original,
				planned_amount: 1500,
			};

			await updatePlan(updated);

			const result = await testDb.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', [
				'plan-update-2',
			]);
			expect(result?.planned_amount).toBe(1500);
			expect(result?.entity_id).toBe('entity-1');
			expect(result?.period_start).toBe('2025-01');
		});
	});

	describe('upsertPlan', () => {
		test('should insert plan when it does not exist', async () => {
			const plan: Plan = {
				id: 'plan-upsert-1',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			await upsertPlan(plan);

			const result = await testDb.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', [
				'plan-upsert-1',
			]);
			expect(result).toEqual(plan);
		});

		test('should update planned_amount when plan exists', async () => {
			const original: Plan = {
				id: 'plan-upsert-2',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			await createPlan(original);

			const updated: Plan = {
				id: 'plan-upsert-2',
				entity_id: 'entity-2', // This should be ignored by upsert
				period: 'month',
				period_start: '2025-02', // This should be ignored by upsert
				planned_amount: 1500,
			};

			await upsertPlan(updated);

			const result = await testDb.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', [
				'plan-upsert-2',
			]);

			// Only planned_amount should be updated
			expect(result?.planned_amount).toBe(1500);
			expect(result?.entity_id).toBe('entity-1'); // Original value
			expect(result?.period_start).toBe('2025-01'); // Original value
		});

		test('should handle multiple upserts idempotently', async () => {
			const plan: Plan = {
				id: 'plan-upsert-3',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			await upsertPlan(plan);
			await upsertPlan({ ...plan, planned_amount: 1200 });
			await upsertPlan({ ...plan, planned_amount: 1500 });

			const allPlans = await getAllPlans();
			expect(allPlans).toHaveLength(1);

			const result = await testDb.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', [
				'plan-upsert-3',
			]);
			expect(result?.planned_amount).toBe(1500);
		});
	});

	describe('deletePlan', () => {
		test('should delete existing plan', async () => {
			const plan: Plan = {
				id: 'plan-delete',
				entity_id: 'entity-1',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			};

			await createPlan(plan);
			expect(await testDb.getFirstAsync('SELECT * FROM plans WHERE id = ?', ['plan-delete'])).not
				.toBeNull;

			await deletePlan('plan-delete');

			const result = await testDb.getFirstAsync('SELECT * FROM plans WHERE id = ?', ['plan-delete']);
			expect(result).toBeNull();
		});

		test('should not error when deleting non-existent plan', async () => {
			await expect(deletePlan('non-existent')).resolves.not.toThrow();
		});
	});
});
