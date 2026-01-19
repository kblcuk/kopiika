import { describe, expect, test, beforeEach } from 'bun:test';
import type { Plan, Entity } from '@/src/types';
import { getAllPlans, getPlanForEntity, upsertPlan } from '../plans';
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
				order: 0,
			},
			{
				id: 'entity-2',
				type: 'category',
				name: 'Category 1',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			},
			{
				id: 'entity-3',
				type: 'saving',
				name: 'Saving 1',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
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
				await upsertPlan(plan);
			}

			const result = await getAllPlans();
			expect(result).toHaveLength(3);
			// Should be ordered by period_start DESC
			expect(result[0].period_start).toBe('2025-03');
			expect(result[1].period_start).toBe('2025-02');
			expect(result[2].period_start).toBe('2025-01');
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
				await upsertPlan(plan);
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

			const result = await getPlanForEntity('entity-1', '2025-01');
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

			await upsertPlan(original);

			const updated: Plan = {
				id: 'plan-upsert-2',
				entity_id: 'entity-2', // This should be ignored by upsert
				period: 'month',
				period_start: '2025-02', // This should be ignored by upsert
				planned_amount: 1500,
			};

			await upsertPlan(updated);

			const result = await getPlanForEntity('entity-1', '2025-01');

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

			const result = await getPlanForEntity('entity-1', '2025-01');
			expect(result?.planned_amount).toBe(1500);
		});
	});
});
