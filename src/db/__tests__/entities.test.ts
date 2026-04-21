import { describe, expect, test, beforeEach } from '@jest/globals';
import type { Entity, EntityType, Transaction } from '@/src/types';
import {
	getAllEntities,
	getEntitiesByType,
	getEntityById,
	createEntity,
	updateEntity,
	deleteEntity,
	getNextPosition,
} from '../entities';
import { upsertPlan, getPlanForEntity } from '../plans';
import { createTransaction, getAllTransactions } from '../transactions';
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
				row: 0,
				position: 0,
				order: 0,
			};

			await createEntity(entity);

			const result = await getEntityById('entity-1');
			expect(result).toEqual({
				...entity,
				include_in_total: true,
				is_deleted: false,
				is_default: false,
			});
		});

		test('should create entity with optional fields as null', async () => {
			const entity: Entity = {
				id: 'entity-2',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 1,
				order: 1,
			};

			await createEntity(entity);

			const result = await getEntityById('entity-2');
			expect(result).toEqual({
				...entity,
				icon: null,
				color: null,
				include_in_total: true,
				is_deleted: false,
				is_default: false,
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
					row: 0,
					position: i,
				};
				await createEntity(entity);
			}

			const allEntities = await getAllEntities();
			expect(allEntities).toHaveLength(5); // 4 entities + system one
			expect(
				allEntities
					.filter((e) => e.id !== BALANCE_ADJUSTMENT_ENTITY_ID)
					.map((e) => e.type)
					.sort()
			).toEqual(types.sort());
		});
	});

	describe('getAllEntities', () => {
		test('should return all entities ordered by type and order', async () => {
			const entities: Entity[] = [
				{
					id: '1',
					type: 'category',
					name: 'Cat 1',
					currency: 'USD',
					row: 0,
					position: 1,
					order: 1,
				},
				{
					id: '2',
					type: 'account',
					name: 'Acc 1',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
				{
					id: '3',
					type: 'category',
					name: 'Cat 2',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
				{
					id: '4',
					type: 'account',
					name: 'Acc 2',
					currency: 'USD',
					row: 0,
					position: 1,
					order: 1,
				},
			];

			for (const entity of entities) {
				await createEntity(entity);
			}

			const allEntities = await getAllEntities();
			expect(allEntities).toHaveLength(5); // entities + system one

			const result = allEntities.filter((e) => e.id !== BALANCE_ADJUSTMENT_ENTITY_ID);

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
				{
					id: '1',
					type: 'income',
					name: 'Salary',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
				{
					id: '2',
					type: 'account',
					name: 'Checking',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
				{
					id: '3',
					type: 'account',
					name: 'Savings',
					currency: 'USD',
					row: 0,
					position: 1,
					order: 1,
				},
				{
					id: '4',
					type: 'category',
					name: 'Food',
					currency: 'USD',
					row: 0,
					position: 1,
					order: 1,
				},
				{
					id: '5',
					type: 'category',
					name: 'Coffee',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
				{
					id: '6',
					type: 'saving',
					name: 'Vacation',
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

		test('should return only entities of specified type', async () => {
			const accounts = await getEntitiesByType('account');
			expect(accounts).toHaveLength(3); // 2 accounts + system one
			expect(accounts.every((e) => e.type === 'account')).toBe(true);
		});

		test('should return entities ordered by order field', async () => {
			const categories = await getEntitiesByType('category');
			expect(categories[0].id).toBe('5'); // order 0
			expect(categories[1].id).toBe('4'); // order 1
		});

		test('should return empty array for type with no entities', async () => {
			// Delete all savings
			await deleteEntity('6');
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
				row: 0,
				position: 0,
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
				row: 0,
				position: 0,
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
				row: 0,
				position: 5,
				order: 5,
			};

			await updateEntity(updated);

			const result = await getEntityById('update-test');
			expect(result).toEqual({
				...updated,
				include_in_total: true,
				is_deleted: false,
				is_default: false,
			});
		});

		test('should be able to set optional fields to null', async () => {
			const original: Entity = {
				id: 'update-test-2',
				type: 'account',
				name: 'With Fields',
				currency: 'USD',
				icon: 'wallet',
				color: '#000000',
				row: 0,
				position: 0,
				order: 0,
			};

			await createEntity(original);

			const updated: Entity = {
				id: 'update-test-2',
				type: 'account',
				name: 'Without Fields',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			await updateEntity(updated);

			const result = await getEntityById('update-test-2');
			expect(result?.icon).toBeNull();
			expect(result?.color).toBeNull();
		});
	});

	describe('deleteEntity', () => {
		test('should soft-delete existing entity', async () => {
			const entity: Entity = {
				id: 'delete-test',
				type: 'account',
				name: 'To Delete',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			await createEntity(entity);
			expect(await getEntityById('delete-test')).not.toBeNull();

			await deleteEntity('delete-test');
			expect(await getEntityById('delete-test')).toMatchObject({
				id: 'delete-test',
				is_deleted: true,
			});
			expect(await getEntitiesByType('account')).toHaveLength(1); // system only
		});

		test('should not error when deleting non-existent entity', () => {
			expect(deleteEntity('non-existent')).resolves.toBeUndefined();
		});

		test('should remove plans for a deleted entity', async () => {
			// Create entity with plan
			const entity: Entity = {
				id: 'cascade-test',
				type: 'account',
				name: 'Test',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			await createEntity(entity);

			// Create plan for entity
			await upsertPlan({
				id: 'plan-1',
				entity_id: 'cascade-test',
				period: 'all-time',
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

		test('should preserve transactions for deleted entities', async () => {
			const income: Entity = {
				id: 'income-delete-test',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			const account: Entity = {
				id: 'account-delete-test',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			const transaction: Transaction = {
				id: 'tx-delete-test',
				from_entity_id: income.id,
				to_entity_id: account.id,
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await createEntity(income);
			await createEntity(account);
			await createTransaction(transaction);

			await expect(deleteEntity(account.id)).resolves.toBeUndefined();

			expect(await getEntityById(account.id)).toMatchObject({ is_deleted: true });
			expect(await getAllTransactions()).toContainEqual(
				expect.objectContaining({ id: transaction.id, to_entity_id: account.id })
			);
		});

		test('should remove plans AND preserve transactions when both exist', async () => {
			const income: Entity = {
				id: 'inc-combo',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			const category: Entity = {
				id: 'cat-combo',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			await createEntity(income);
			await createEntity(category);

			await upsertPlan({
				id: 'plan-combo',
				entity_id: category.id,
				period: 'all-time',
				period_start: '2025-01',
				planned_amount: 500,
			});
			await createTransaction({
				id: 'tx-combo',
				from_entity_id: income.id,
				to_entity_id: category.id,
				amount: 200,
				currency: 'USD',
				timestamp: Date.now(),
			});

			await deleteEntity(category.id);

			expect(await getEntityById(category.id)).toMatchObject({ is_deleted: true });
			expect(await getPlanForEntity(category.id, '2025-01')).toBeNull();
			expect(await getAllTransactions()).toContainEqual(
				expect.objectContaining({ id: 'tx-combo', to_entity_id: category.id })
			);
		});

		test('should preserve transactions for deleted account', async () => {
			const income: Entity = {
				id: 'inc-res',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			const account: Entity = {
				id: 'acc-res',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			const saving: Entity = {
				id: 'sav-res',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			await createEntity(income);
			await createEntity(account);
			await createEntity(saving);

			await createTransaction({
				id: 'tx-res',
				from_entity_id: income.id,
				to_entity_id: account.id,
				amount: 1000,
				currency: 'USD',
				timestamp: Date.now(),
			});

			await deleteEntity(account.id);

			expect(await getEntityById(account.id)).toMatchObject({ is_deleted: true });
			expect(await getAllTransactions()).toContainEqual(
				expect.objectContaining({ id: 'tx-res' })
			);
		});

		test('should preserve transactions for deleted saving', async () => {
			const account: Entity = {
				id: 'acc-sav',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			const saving: Entity = {
				id: 'sav-del',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};
			await createEntity(account);
			await createEntity(saving);

			await createTransaction({
				id: 'tx-sav',
				from_entity_id: account.id,
				to_entity_id: saving.id,
				amount: 200,
				currency: 'USD',
				timestamp: Date.now(),
			});

			await deleteEntity(saving.id);

			expect(await getEntityById(saving.id)).toMatchObject({ is_deleted: true });
			expect(await getAllTransactions()).toContainEqual(
				expect.objectContaining({ id: 'tx-sav' })
			);
		});
	});

	describe('getNextPosition', () => {
		test('should return 0 when no entities of type exist', async () => {
			const position = await getNextPosition('account', 4);
			expect(position).toBe(0);
		});

		test('should return max order + 1 for type', async () => {
			const entities: Entity[] = [
				{
					id: '1',
					type: 'account',
					name: 'Account 1',
					currency: 'USD',
					row: 0,
					position: 0,
					order: 0,
				},
				{
					id: '2',
					type: 'account',
					name: 'Account 2',
					currency: 'USD',
					row: 0,
					position: 5,
					order: 5,
				},
				{
					id: '3',
					type: 'account',
					name: 'Account 3',
					currency: 'USD',
					row: 0,
					position: 2,
					order: 2,
				},
				{
					id: '4',
					type: 'category',
					name: 'Category 1',
					currency: 'USD',
					row: 0,
					position: 10,
					order: 10,
				},
			];

			for (const entity of entities) {
				await createEntity(entity);
			}

			const accountOrder = await getNextPosition('account', 0);
			expect(accountOrder).toBe(6); // max is 5, so next is 6

			const categoryOrder = await getNextPosition('category', 0);
			expect(categoryOrder).toBe(11); // max is 10, so next is 11

			const incomeOrder = await getNextPosition('income', 0);
			expect(incomeOrder).toBe(0); // no income entities
		});
	});
});
