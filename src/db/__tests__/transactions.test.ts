import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import type * as SQLite from 'expo-sqlite';
import type { Transaction, Entity } from '@/src/types';
import {
	getAllTransactions,
	getTransactionsByPeriod,
	getTransactionsForEntity,
	createTransaction,
	deleteTransaction,
	updateTransaction,
	getEntityActual,
} from '../transactions';
import { createEntity } from '../entities';
import { createTestDatabase } from './test-utils';

jest.mock('@/src/db/schema');

import { getDatabase } from '../schema';

describe('transactions.ts', () => {
	let testDb: SQLite.SQLiteDatabase;

	beforeEach(async () => {
		testDb = await createTestDatabase();
		jest.mocked(getDatabase).mockResolvedValue(testDb);

		// Create test entities
		const entities: Entity[] = [
			{ id: 'income-1', type: 'income', name: 'Salary', currency: 'USD', order: 0 },
			{ id: 'account-1', type: 'account', name: 'Checking', currency: 'USD', order: 0 },
			{ id: 'category-1', type: 'category', name: 'Groceries', currency: 'USD', order: 0 },
			{ id: 'saving-1', type: 'saving', name: 'Vacation', currency: 'USD', order: 0 },
		];

		for (const entity of entities) {
			await createEntity(entity);
		}
	});

	describe('createTransaction', () => {
		test('should create a new transaction with all fields', async () => {
			const transaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: Date.now(),
				note: 'January salary',
			};

			await createTransaction(transaction);

			const result = await testDb.getFirstAsync<Transaction>(
				'SELECT * FROM transactions WHERE id = ?',
				['tx-1']
			);
			expect(result).toEqual(transaction);
		});

		test('should create transaction without note', async () => {
			const transaction: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await createTransaction(transaction);

			const result = await testDb.getFirstAsync<Transaction>(
				'SELECT * FROM transactions WHERE id = ?',
				['tx-2']
			);
			expect(result).toMatchObject({
				...transaction,
				note: null,
			});
		});

		test('should create multiple transactions', async () => {
			const transactions: Transaction[] = [
				{
					id: 'tx-1',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 5000,
					currency: 'USD',
					timestamp: Date.now(),
				},
				{
					id: 'tx-2',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 100,
					currency: 'USD',
					timestamp: Date.now(),
				},
			];

			for (const tx of transactions) {
				await createTransaction(tx);
			}

			const allTx = await getAllTransactions();
			expect(allTx).toHaveLength(2);
		});
	});

	describe('getAllTransactions', () => {
		test('should return empty array when no transactions exist', async () => {
			const result = await getAllTransactions();
			expect(result).toEqual([]);
		});

		test('should return all transactions ordered by timestamp DESC', async () => {
			const now = Date.now();
			const transactions: Transaction[] = [
				{
					id: 'tx-1',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 100,
					currency: 'USD',
					timestamp: now - 2000,
				},
				{
					id: 'tx-2',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 50,
					currency: 'USD',
					timestamp: now,
				},
				{
					id: 'tx-3',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-1',
					amount: 25,
					currency: 'USD',
					timestamp: now - 1000,
				},
			];

			for (const tx of transactions) {
				await createTransaction(tx);
			}

			const result = await getAllTransactions();
			expect(result).toHaveLength(3);
			// Should be ordered by timestamp DESC
			expect(result[0].id).toBe('tx-2'); // Most recent
			expect(result[1].id).toBe('tx-3');
			expect(result[2].id).toBe('tx-1'); // Oldest
		});
	});

	describe('getTransactionsByPeriod', () => {
		beforeEach(async () => {
			const jan1 = new Date('2025-01-15').getTime();
			const feb1 = new Date('2025-02-15').getTime();
			const mar1 = new Date('2025-03-15').getTime();

			const transactions: Transaction[] = [
				{
					id: 'tx-jan',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 100,
					currency: 'USD',
					timestamp: jan1,
				},
				{
					id: 'tx-feb',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 200,
					currency: 'USD',
					timestamp: feb1,
				},
				{
					id: 'tx-mar',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 300,
					currency: 'USD',
					timestamp: mar1,
				},
			];

			for (const tx of transactions) {
				await createTransaction(tx);
			}
		});

		test('should return only transactions within period', async () => {
			const febStart = new Date('2025-02-01').getTime();
			const febEnd = new Date('2025-02-28 23:59:59').getTime();

			const result = await getTransactionsByPeriod(febStart, febEnd);
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('tx-feb');
		});

		test('should include transactions at boundary timestamps', async () => {
			const timestamp = new Date('2025-02-15').getTime();
			const result = await getTransactionsByPeriod(timestamp, timestamp);
			expect(result).toHaveLength(1);
		});

		test('should return empty array for period with no transactions', async () => {
			const aprStart = new Date('2025-04-01').getTime();
			const aprEnd = new Date('2025-04-30').getTime();

			const result = await getTransactionsByPeriod(aprStart, aprEnd);
			expect(result).toEqual([]);
		});
	});

	describe('getTransactionsForEntity', () => {
		beforeEach(async () => {
			const now = Date.now();
			const transactions: Transaction[] = [
				{
					id: 'tx-1',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 1000,
					currency: 'USD',
					timestamp: now - 5000,
				},
				{
					id: 'tx-2',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 100,
					currency: 'USD',
					timestamp: now - 3000,
				},
				{
					id: 'tx-3',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-1',
					amount: 200,
					currency: 'USD',
					timestamp: now - 1000,
				},
				{
					id: 'tx-4',
					from_entity_id: 'income-1',
					to_entity_id: 'category-1',
					amount: 50,
					currency: 'USD',
					timestamp: now,
				},
			];

			for (const tx of transactions) {
				await createTransaction(tx);
			}
		});

		test('should return transactions where entity is sender', async () => {
			const result = await getTransactionsForEntity('income-1');
			expect(result).toHaveLength(2);
			expect(result.every((tx) => tx.from_entity_id === 'income-1')).toBe(true);
		});

		test('should return transactions where entity is receiver', async () => {
			const result = await getTransactionsForEntity('category-1');
			expect(result).toHaveLength(2);
			expect(result.every((tx) => tx.to_entity_id === 'category-1')).toBe(true);
		});

		test('should return transactions where entity is sender OR receiver', async () => {
			const result = await getTransactionsForEntity('account-1');
			expect(result).toHaveLength(3);
		});

		test('should filter by period when provided', async () => {
			const now = Date.now();
			const start = now - 4000;
			const end = now - 2000;

			const result = await getTransactionsForEntity('account-1', start, end);
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('tx-2');
		});

		test('should return empty array for entity with no transactions', async () => {
			// Create new entity with no transactions
			await createEntity({
				id: 'new-entity',
				type: 'account',
				name: 'New',
				currency: 'USD',
				order: 10,
			});

			const result = await getTransactionsForEntity('new-entity');
			expect(result).toEqual([]);
		});
	});

	describe('deleteTransaction', () => {
		test('should delete existing transaction', async () => {
			const transaction: Transaction = {
				id: 'tx-delete',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await createTransaction(transaction);
			expect(
				await testDb.getFirstAsync('SELECT * FROM transactions WHERE id = ?', ['tx-delete'])
			).not.toBeNull();

			await deleteTransaction('tx-delete');

			const result = await testDb.getFirstAsync('SELECT * FROM transactions WHERE id = ?', [
				'tx-delete',
			]);
			expect(result).toBeNull();
		});

		test('should not error when deleting non-existent transaction', async () => {
			await expect(deleteTransaction('non-existent')).resolves.not.toThrow();
		});
	});

	describe('updateTransaction', () => {
		let originalTx: Transaction;

		beforeEach(async () => {
			originalTx = {
				id: 'tx-update',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
				note: 'Original note',
			};
			await createTransaction(originalTx);
		});

		test('should update amount', async () => {
			await updateTransaction('tx-update', { amount: 200 });

			const result = await testDb.getFirstAsync<Transaction>(
				'SELECT * FROM transactions WHERE id = ?',
				['tx-update']
			);
			expect(result?.amount).toBe(200);
			expect(result?.note).toBe('Original note');
		});

		test('should update note', async () => {
			await updateTransaction('tx-update', { note: 'Updated note' });

			const result = await testDb.getFirstAsync<Transaction>(
				'SELECT * FROM transactions WHERE id = ?',
				['tx-update']
			);
			expect(result?.note).toBe('Updated note');
			expect(result?.amount).toBe(100);
		});

		test('should update timestamp', async () => {
			const newTimestamp = Date.now() + 10000;
			await updateTransaction('tx-update', { timestamp: newTimestamp });

			const result = await testDb.getFirstAsync<Transaction>(
				'SELECT * FROM transactions WHERE id = ?',
				['tx-update']
			);
			expect(result?.timestamp).toBe(newTimestamp);
		});

		test('should update multiple fields at once', async () => {
			const newTimestamp = Date.now() + 10000;
			await updateTransaction('tx-update', {
				amount: 500,
				note: 'Multi update',
				timestamp: newTimestamp,
			});

			const result = await testDb.getFirstAsync<Transaction>(
				'SELECT * FROM transactions WHERE id = ?',
				['tx-update']
			);
			expect(result?.amount).toBe(500);
			expect(result?.note).toBe('Multi update');
			expect(result?.timestamp).toBe(newTimestamp);
		});

		test('should set note to null when empty string provided', async () => {
			await updateTransaction('tx-update', { note: '' });

			const result = await testDb.getFirstAsync<Transaction>(
				'SELECT * FROM transactions WHERE id = ?',
				['tx-update']
			);
			expect(result?.note).toBeNull();
		});

		test('should do nothing when no updates provided', async () => {
			await updateTransaction('tx-update', {});

			const result = await testDb.getFirstAsync<Transaction>(
				'SELECT * FROM transactions WHERE id = ?',
				['tx-update']
			);
			expect(result).toEqual(originalTx);
		});
	});

	describe('getEntityActual', () => {
		const jan2025Start = new Date('2025-01-01').getTime();
		const jan2025End = new Date('2025-01-31 23:59:59').getTime();

		test('should calculate inflow - outflow for account', async () => {
			// Income -> Account: +1000
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			// Account -> Category: -100
			await createTransaction({
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 100,
				currency: 'USD',
				timestamp: new Date('2025-01-20').getTime(),
			});

			// Account -> Saving: -200
			await createTransaction({
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 200,
				currency: 'USD',
				timestamp: new Date('2025-01-25').getTime(),
			});

			const actual = await getEntityActual('account-1', jan2025Start, jan2025End);
			// 1000 (in) - 300 (out) = 700
			expect(actual).toBe(700);
		});

		test('should calculate inflow for category (money received)', async () => {
			// Account -> Category: +100
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 100,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			// Account -> Category: +50
			await createTransaction({
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: new Date('2025-01-20').getTime(),
			});

			const actual = await getEntityActual('category-1', jan2025Start, jan2025End);
			// Categories only receive money, so actual = inflow
			expect(actual).toBe(150);
		});

		test('should calculate outflow for income (money distributed)', async () => {
			// Income -> Account: -1000
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			// Income -> Category: -500
			await createTransaction({
				id: 'tx-2',
				from_entity_id: 'income-1',
				to_entity_id: 'category-1',
				amount: 500,
				currency: 'USD',
				timestamp: new Date('2025-01-20').getTime(),
			});

			const actual = await getEntityActual('income-1', jan2025Start, jan2025End);
			// Income distributes money, so actual = -outflow
			expect(actual).toBe(-1500);
		});

		test('should only include transactions within period', async () => {
			// January transaction
			await createTransaction({
				id: 'tx-jan',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			// February transaction (outside period)
			await createTransaction({
				id: 'tx-feb',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 2000,
				currency: 'USD',
				timestamp: new Date('2025-02-15').getTime(),
			});

			const actual = await getEntityActual('account-1', jan2025Start, jan2025End);
			expect(actual).toBe(1000); // Only January transaction
		});

		test('should return 0 when no transactions exist for entity in period', async () => {
			const actual = await getEntityActual('account-1', jan2025Start, jan2025End);
			expect(actual).toBe(0);
		});

		test('should handle transactions at period boundaries', async () => {
			// Transaction at start of period
			await createTransaction({
				id: 'tx-start',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
				currency: 'USD',
				timestamp: jan2025Start,
			});

			// Transaction at end of period
			await createTransaction({
				id: 'tx-end',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 200,
				currency: 'USD',
				timestamp: jan2025End,
			});

			const actual = await getEntityActual('account-1', jan2025Start, jan2025End);
			expect(actual).toBe(300);
		});

		test('should handle negative balance (overspending)', async () => {
			// Small income
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 100,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			// Large outflow
			await createTransaction({
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 500,
				currency: 'USD',
				timestamp: new Date('2025-01-20').getTime(),
			});

			const actual = await getEntityActual('account-1', jan2025Start, jan2025End);
			expect(actual).toBe(-400); // Overspent by 400
		});
	});
});
