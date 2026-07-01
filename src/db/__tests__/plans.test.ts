import { describe, expect, test, beforeEach } from 'bun:test';
import type { Plan, Entity } from '@/src/types';
import { deletePlan, getAllPlans, getPlanForEntity, upsertPlan } from '../plans';
import { createEntity } from '../entities';
import { resetDrizzleDb } from '../drizzle-client';

describe('plans.ts', () => {
	beforeEach(async () => {
		// Reset database before each test
		resetDrizzleDb();

		// Create test entities for foreign key constraints
		const entities: Entity[] = [
			{
				id: 'entity-1',
				type: 'account',
				name: 'Account 1',
				currency: 'USD',
				row: 0,
				position: 0,
			},
			{
				id: 'entity-2',
				type: 'category',
				name: 'Category 1',
				currency: 'USD',
				row: 0,
				position: 0,
			},
			{
				id: 'entity-3',
				type: 'saving',
				name: 'Saving 1',
				currency: 'USD',
				row: 0,
				position: 0,
			},
		];

		for (const entity of entities) {
			await createEntity(entity);
		}
	});

	describe('getAllPlans', () => {
		test('should return empty array when no plans exist', async () => {
			const result = await getAllPlans();
			expect(result).toEqual([]);
		});

		test('should return all-time plans ordered by period_start DESC', async () => {
			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'all-time',
					period_start: '2025-01',
					planned_amount_minor: 100000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'all-time',
					period_start: '2025-03',
					planned_amount_minor: 150000,
				},
				{
					id: 'plan-3',
					entity_id: 'entity-3',
					period: 'all-time',
					period_start: '2025-02',
					planned_amount_minor: 120000,
				},
			];

			for (const plan of plans) {
				await upsertPlan(plan);
			}

			const result = await getAllPlans();
			expect(result).toHaveLength(3);
			// Should be ordered by period_start DESC
			expect(result[0]!.period_start).toBe('2025-03');
			expect(result[1]!.period_start).toBe('2025-02');
			expect(result[2]!.period_start).toBe('2025-01');
		});
	});

	describe('getPlanForEntity', () => {
		beforeEach(async () => {
			const plans: Plan[] = [
				{
					id: 'plan-1',
					entity_id: 'entity-1',
					period: 'all-time',
					period_start: '2025-01',
					planned_amount_minor: 100000,
				},
				{
					id: 'plan-2',
					entity_id: 'entity-2',
					period: 'all-time',
					period_start: '2025-01',
					planned_amount_minor: 50000,
				},
			];

			for (const plan of plans) {
				await upsertPlan(plan);
			}
		});

		test('should return plan for a specific entity and creation period_start', async () => {
			const result = await getPlanForEntity('entity-1', '2025-01');
			expect(result).not.toBeNull();
			expect(result?.id).toBe('plan-1');
			expect(result?.period).toBe('all-time');
			expect(result?.planned_amount_minor).toBe(100000);
		});

		test('should return null when no plan exists for entity and period_start', async () => {
			const result = await getPlanForEntity('entity-3', '2025-01');
			expect(result).toBeNull();
		});

		test('should return null when period_start does not match the stored all-time plan', async () => {
			const result = await getPlanForEntity('entity-1', '2025-02');
			expect(result).toBeNull();
		});
	});
	describe('upsertPlan', () => {
		test('should insert plan when it does not exist', async () => {
			const plan: Plan = {
				id: 'plan-upsert-1',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2025-01',
				planned_amount_minor: 100000,
			};

			await upsertPlan(plan);

			const result = await getPlanForEntity('entity-1', '2025-01');
			expect(result).toMatchObject(plan);
		});

		test('should update planned_amount when a plan with the same (entity_id, period_start) exists', async () => {
			const original: Plan = {
				id: 'plan-upsert-2',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2025-01',
				planned_amount_minor: 100000,
			};

			await upsertPlan(original);
			await upsertPlan({ ...original, planned_amount_minor: 150000 });

			const result = await getPlanForEntity('entity-1', '2025-01');
			expect(result?.planned_amount_minor).toBe(150000);
			expect(result?.id).toBe('plan-upsert-2');
			expect(await getAllPlans()).toHaveLength(1);
		});

		test('should collapse two ids with the same (entity_id, period_start) into one row, preserving the original id', async () => {
			const first: Plan = {
				id: 'plan-upsert-dup-a',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2025-01',
				planned_amount_minor: 100000,
			};
			const second: Plan = {
				id: 'plan-upsert-dup-b', // different id, same composite key
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2025-01',
				planned_amount_minor: 150000,
			};

			await upsertPlan(first);
			await upsertPlan(second);

			const all = await getAllPlans();
			expect(all).toHaveLength(1);
			expect(all[0]!.id).toBe('plan-upsert-dup-a'); // ON CONFLICT keeps the original row
			expect(all[0]!.planned_amount_minor).toBe(150000); // planned_amount is overwritten
		});

		test('should handle multiple upserts idempotently', async () => {
			const plan: Plan = {
				id: 'plan-upsert-3',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2025-01',
				planned_amount_minor: 100000,
			};

			await upsertPlan(plan);
			await upsertPlan({ ...plan, planned_amount_minor: 120000 });
			await upsertPlan({ ...plan, planned_amount_minor: 150000 });

			const allPlans = await getAllPlans();
			expect(allPlans).toHaveLength(1);

			const result = await getPlanForEntity('entity-1', '2025-01');
			expect(result?.planned_amount_minor).toBe(150000);
		});
	});

	describe('deletePlan', () => {
		test('should remove an existing plan by id', async () => {
			const plan: Plan = {
				id: 'plan-delete-1',
				entity_id: 'entity-1',
				period: 'all-time',
				period_start: '2025-01',
				planned_amount_minor: 100000,
			};

			await upsertPlan(plan);
			await deletePlan(plan.id);

			expect(await getPlanForEntity('entity-1', '2025-01')).toBeNull();
			expect(await getAllPlans()).toEqual([]);
		});
	});
});
