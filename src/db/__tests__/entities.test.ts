import { describe, expect, test, beforeEach } from '@jest/globals';
import type { Entity, EntityType } from '@/src/types';
import {
	getAllEntities,
	getEntitiesByType,
	getEntityById,
	createEntity,
	updateEntity,
	deleteEntity,
	getNextOrder,
	ensureBalanceAdjustmentEntity,
} from '../entities';
import { createPlan, getPlanForEntity } from '../plans';
import { resetDrizzleDb } from '../drizzle-client';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';

describe('entities.ts', () => {
	beforeEach(() => {
		// Reset database before each test
		resetDrizzleDb();
	});

	describe('createEntity', () => {
		test('should create a new entity with all fields', async () => {
			const entity: Entity = {
				id: 'entity-1',
				type: 'account',
				name: 'Checking Account',
				currency: 'USD',
				icon: 'wallet',
				color: '#4CAF50',
				owner_id: 'user-1',
				order: 0,
			};

			await createEntity(entity);

			const result = await getEntityById('entity-1');
			expect(result).toEqual(entity);
		});

		test('should create entity with optional fields as null', async () => {
			const entity: Entity = {
				id: 'entity-2',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				order: 1,
			};

			await createEntity(entity);

			const result = await getEntityById('entity-2');
			expect(result).toEqual({
				...entity,
				icon: null,
				color: null,
				owner_id: null,
			});
		});

		test('should create entities of different types', async () => {
			const types: EntityType[] = ['income', 'account', 'category', 'saving'];

			for (let i = 0; i < types.length; i++) {
				const entity: Entity = {
					id: `entity-${i}`,
					type: types[i],
					name: `Test ${types[i]}`,
					currency: 'USD',
					order: i,
				};
				await createEntity(entity);
			}

			const allEntities = await getAllEntities();
			expect(allEntities).toHaveLength(4);
			expect(allEntities.map((e) => e.type).sort()).toEqual(types.sort());
		});
	});

	describe('getAllEntities', () => {
		test('should return empty array when no entities exist', async () => {
			const result = await getAllEntities();
			expect(result).toEqual([]);
		});

		test('should return all entities ordered by type and order', async () => {
			const entities: Entity[] = [
				{ id: '1', type: 'category', name: 'Cat 1', currency: 'USD', order: 1 },
				{ id: '2', type: 'account', name: 'Acc 1', currency: 'USD', order: 0 },
				{ id: '3', type: 'category', name: 'Cat 2', currency: 'USD', order: 0 },
				{ id: '4', type: 'account', name: 'Acc 2', currency: 'USD', order: 1 },
			];

			for (const entity of entities) {
				await createEntity(entity);
			}

			const result = await getAllEntities();
			expect(result).toHaveLength(4);

			// Should be ordered by type, then by order within type
			// account (0, 1), category (0, 1)
			expect(result[0].id).toBe('2'); // account, order 0
			expect(result[1].id).toBe('4'); // account, order 1
			expect(result[2].id).toBe('3'); // category, order 0
			expect(result[3].id).toBe('1'); // category, order 1
		});
	});

	describe('getEntitiesByType', () => {
		beforeEach(async () => {
			const entities: Entity[] = [
				{ id: '1', type: 'income', name: 'Salary', currency: 'USD', order: 0 },
				{ id: '2', type: 'account', name: 'Checking', currency: 'USD', order: 0 },
				{ id: '3', type: 'account', name: 'Savings', currency: 'USD', order: 1 },
				{ id: '4', type: 'category', name: 'Food', currency: 'USD', order: 0 },
				{ id: '5', type: 'saving', name: 'Vacation', currency: 'USD', order: 0 },
			];

			for (const entity of entities) {
				await createEntity(entity);
			}
		});

		test('should return only entities of specified type', async () => {
			const accounts = await getEntitiesByType('account');
			expect(accounts).toHaveLength(2);
			expect(accounts.every((e) => e.type === 'account')).toBe(true);
		});

		test('should return entities ordered by order field', async () => {
			const accounts = await getEntitiesByType('account');
			expect(accounts[0].id).toBe('2'); // order 0
			expect(accounts[1].id).toBe('3'); // order 1
		});

		test('should return empty array for type with no entities', async () => {
			// Delete all savings
			await deleteEntity('5');
			const savings = await getEntitiesByType('saving');
			expect(savings).toEqual([]);
		});
	});

	describe('getEntityById', () => {
		test('should return entity when it exists', async () => {
			const entity: Entity = {
				id: 'test-id',
				type: 'account',
				name: 'Test Account',
				currency: 'EUR',
				order: 0,
			};

			await createEntity(entity);
			const result = await getEntityById('test-id');

			expect(result?.id).toBe(entity.id);
			expect(result?.type).toBe(entity.type);
			expect(result?.name).toBe(entity.name);
			expect(result?.currency).toBe(entity.currency);
		});

		test('should return null when entity does not exist', async () => {
			const result = await getEntityById('non-existent');
			expect(result).toBeNull();
		});
	});

	describe('updateEntity', () => {
		test('should update all entity fields', async () => {
			const original: Entity = {
				id: 'update-test',
				type: 'account',
				name: 'Original',
				currency: 'USD',
				order: 0,
			};

			await createEntity(original);

			const updated: Entity = {
				id: 'update-test',
				type: 'category',
				name: 'Updated',
				currency: 'EUR',
				icon: 'star',
				color: '#FF0000',
				owner_id: 'owner-1',
				order: 5,
			};

			await updateEntity(updated);

			const result = await getEntityById('update-test');
			expect(result).toEqual(updated);
		});

		test('should be able to set optional fields to null', async () => {
			const original: Entity = {
				id: 'update-test-2',
				type: 'account',
				name: 'With Fields',
				currency: 'USD',
				icon: 'wallet',
				color: '#000000',
				owner_id: 'owner',
				order: 0,
			};

			await createEntity(original);

			const updated: Entity = {
				id: 'update-test-2',
				type: 'account',
				name: 'Without Fields',
				currency: 'USD',
				order: 0,
			};

			await updateEntity(updated);

			const result = await getEntityById('update-test-2');
			expect(result?.icon).toBeNull();
			expect(result?.color).toBeNull();
			expect(result?.owner_id).toBeNull();
		});
	});

	describe('deleteEntity', () => {
		test('should delete existing entity', async () => {
			const entity: Entity = {
				id: 'delete-test',
				type: 'account',
				name: 'To Delete',
				currency: 'USD',
				order: 0,
			};

			await createEntity(entity);
			expect(await getEntityById('delete-test')).not.toBeNull();

			await deleteEntity('delete-test');
			expect(await getEntityById('delete-test')).toBeNull();
		});

		test('should not error when deleting non-existent entity', () => {
			expect(deleteEntity('non-existent')).resolves.toBeUndefined();
		});

		test('should cascade delete plans for entity', async () => {
			// Create entity with plan
			const entity: Entity = {
				id: 'cascade-test',
				type: 'account',
				name: 'Test',
				currency: 'USD',
				order: 0,
			};
			await createEntity(entity);

			// Create plan for entity
			await createPlan({
				id: 'plan-1',
				entity_id: 'cascade-test',
				period: 'month',
				period_start: '2025-01',
				planned_amount: 1000,
			});

			// Verify plan exists
			const plan = await getPlanForEntity('cascade-test', '2025-01');
			expect(plan).not.toBeNull();

			// Delete entity
			await deleteEntity('cascade-test');

			// Plan should be cascade deleted
			const deletedPlan = await getPlanForEntity('cascade-test', '2025-01');
			expect(deletedPlan).toBeNull();
		});
	});

	describe('getNextOrder', () => {
		test('should return 0 when no entities of type exist', async () => {
			const order = await getNextOrder('account');
			expect(order).toBe(0);
		});

		test('should return max order + 1 for type', async () => {
			const entities: Entity[] = [
				{ id: '1', type: 'account', name: 'Account 1', currency: 'USD', order: 0 },
				{ id: '2', type: 'account', name: 'Account 2', currency: 'USD', order: 5 },
				{ id: '3', type: 'account', name: 'Account 3', currency: 'USD', order: 2 },
				{ id: '4', type: 'category', name: 'Category 1', currency: 'USD', order: 10 },
			];

			for (const entity of entities) {
				await createEntity(entity);
			}

			const accountOrder = await getNextOrder('account');
			expect(accountOrder).toBe(6); // max is 5, so next is 6

			const categoryOrder = await getNextOrder('category');
			expect(categoryOrder).toBe(11); // max is 10, so next is 11

			const incomeOrder = await getNextOrder('income');
			expect(incomeOrder).toBe(0); // no income entities
		});
	});

	describe('ensureBalanceAdjustmentEntity', () => {
		test('should create balance adjustment entity on first call', async () => {
			// Ensure entity doesn't exist yet
			const before = await getEntityById(BALANCE_ADJUSTMENT_ENTITY_ID);
			expect(before).toBeNull();

			// Call the function
			await ensureBalanceAdjustmentEntity();

			// Verify entity was created
			const after = await getEntityById(BALANCE_ADJUSTMENT_ENTITY_ID);
			expect(after).not.toBeNull();
			expect(after?.id).toBe(BALANCE_ADJUSTMENT_ENTITY_ID);
			expect(after?.type).toBe('account');
			expect(after?.name).toBe('Balance Adjustments');
		});

		test('should be idempotent (not create duplicate on second call)', async () => {
			// Call twice
			await ensureBalanceAdjustmentEntity();
			await ensureBalanceAdjustmentEntity();

			// Should only have one system entity
			const allEntities = await getAllEntities();
			const systemEntities = allEntities.filter((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID);
			expect(systemEntities).toHaveLength(1);
		});

		test('should not error if entity already exists', async () => {
			// Call once
			await ensureBalanceAdjustmentEntity();

			// Call again should not throw
			await expect(ensureBalanceAdjustmentEntity()).resolves.toBeUndefined();
		});
	});
});
