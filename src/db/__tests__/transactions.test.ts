import { describe, expect, test, beforeEach } from 'bun:test';
import type { Transaction, Entity } from '@/src/types';
import {
	getAllTransactions,
	getTransactionsByPeriod,
	getTransactionsForEntity,
	getTransactionsBetweenEntities,
	createTransaction,
	deleteTransaction,
	updateTransaction,
	getEntityActual,
	getBatchEntityActuals,
	getTransactionsBySeriesId,
	deleteTransactionsBySeriesFuture,
	updateTransactionsBySeriesFuture,
	createTransactionBatch,
	confirmTransaction,
	confirmTransactionsBatch,
	updateTransactionNotificationId,
	updateTransactionNotificationIdsBatch,
} from '../transactions';
import { createEntity } from '../entities';
import { resetDrizzleDb } from '../drizzle-client';

describe('transactions.ts', () => {
	beforeEach(async () => {
		// Reset database before each test
		resetDrizzleDb();

		// Create test entities
		const entities: Entity[] = [
			{
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			},
			{
				id: 'account-1',
				type: 'account',
				name: 'Checking',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			},
			{
				id: 'category-1',
				type: 'category',
				name: 'Groceries',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			},
			{
				id: 'saving-1',
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

			const allTx = await getAllTransactions();
			const result = allTx.find((tx) => tx.id === 'tx-1');
			expect(result).toMatchObject(transaction);
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

			const allTx = await getAllTransactions();
			const result = allTx.find((tx) => tx.id === 'tx-2');
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
				row: 0,
				position: 10,
				order: 10,
			});

			const result = await getTransactionsForEntity('new-entity');
			expect(result).toEqual([]);
		});
	});

	describe('getTransactionsBetweenEntities', () => {
		test('returns only transactions in the requested direction ordered newest first', async () => {
			const now = Date.now();
			await createTransaction({
				id: 'pair-old',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 40,
				currency: 'USD',
				timestamp: now - 2000,
			});
			await createTransaction({
				id: 'reverse',
				from_entity_id: 'category-1',
				to_entity_id: 'account-1',
				amount: 15,
				currency: 'USD',
				timestamp: now - 1000,
			});
			await createTransaction({
				id: 'pair-new',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 25,
				currency: 'USD',
				timestamp: now,
			});

			const result = await getTransactionsBetweenEntities('account-1', 'category-1');

			expect(result.map((tx) => tx.id)).toEqual(['pair-new', 'pair-old']);
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

			const existing = await getAllTransactions();
			expect(existing.find((tx) => tx.id === 'tx-delete')).toBeDefined();

			await deleteTransaction('tx-delete');

			const result = await getAllTransactions();
			expect(result.find((tx) => tx.id === 'tx-delete')).toBeUndefined();
		});

		test('should not error when deleting non-existent transaction', () => {
			expect(deleteTransaction('non-existent')).resolves.toBeUndefined();
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

			const allTx = await getAllTransactions();
			const result = allTx.find((tx) => tx.id === 'tx-update');
			expect(result?.amount).toBe(200);
			expect(result?.note).toBe('Original note');
		});

		test('should update note', async () => {
			await updateTransaction('tx-update', { note: 'Updated note' });

			const allTx = await getAllTransactions();
			const result = allTx.find((tx) => tx.id === 'tx-update');
			expect(result?.note).toBe('Updated note');
			expect(result?.amount).toBe(100);
		});

		test('should update timestamp', async () => {
			const newTimestamp = Date.now() + 10000;
			await updateTransaction('tx-update', { timestamp: newTimestamp });

			const allTx = await getAllTransactions();
			const result = allTx.find((tx) => tx.id === 'tx-update');
			expect(result?.timestamp).toBe(newTimestamp);
		});

		test('should update multiple fields at once', async () => {
			const newTimestamp = Date.now() + 10000;
			await updateTransaction('tx-update', {
				amount: 500,
				note: 'Multi update',
				timestamp: newTimestamp,
			});

			const allTx = await getAllTransactions();
			const result = allTx.find((tx) => tx.id === 'tx-update');
			expect(result?.amount).toBe(500);
			expect(result?.note).toBe('Multi update');
			expect(result?.timestamp).toBe(newTimestamp);
		});

		test('should set note to empty string when empty string provided', async () => {
			await updateTransaction('tx-update', { note: '' });

			const allTx = await getAllTransactions();
			const result = allTx.find((tx) => tx.id === 'tx-update');
			expect(result?.note).toBe('');
		});

		test('should do nothing when no updates provided', async () => {
			await updateTransaction('tx-update', {});

			const allTx = await getAllTransactions();
			const result = allTx.find((tx) => tx.id === 'tx-update');
			expect(result).toMatchObject(originalTx);
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

	describe('getBatchEntityActuals', () => {
		const jan2025Start = new Date('2025-01-01').getTime();
		const jan2025End = new Date('2025-01-31 23:59:59').getTime();

		test('should return empty Map when given empty array', async () => {
			const results = await getBatchEntityActuals([], jan2025Start, jan2025End);
			expect(results).toBeInstanceOf(Map);
			expect(results.size).toBe(0);
		});

		test('should return results for multiple entities', async () => {
			// Create transactions for multiple entities
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			await createTransaction({
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 200,
				currency: 'USD',
				timestamp: new Date('2025-01-20').getTime(),
			});

			await createTransaction({
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 300,
				currency: 'USD',
				timestamp: new Date('2025-01-25').getTime(),
			});

			const results = await getBatchEntityActuals(
				['income-1', 'account-1', 'category-1', 'saving-1'],
				jan2025Start,
				jan2025End
			);

			expect(results.size).toBe(4);
			expect(results.get('income-1')).toBe(-1000); // Outflow
			expect(results.get('account-1')).toBe(500); // 1000 in - 500 out
			expect(results.get('category-1')).toBe(200); // Inflow only
			expect(results.get('saving-1')).toBe(300); // Inflow only
		});

		test('should return 0 for entities with no transactions', async () => {
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			const results = await getBatchEntityActuals(
				['income-1', 'account-1', 'category-1', 'saving-1'],
				jan2025Start,
				jan2025End
			);

			// category-1 and saving-1 have no transactions
			expect(results.get('category-1')).toBe(0);
			expect(results.get('saving-1')).toBe(0);
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

			const results = await getBatchEntityActuals(['account-1'], jan2025Start, jan2025End);

			expect(results.get('account-1')).toBe(1000); // Only January transaction
		});

		test('should be consistent with getEntityActual', async () => {
			// Create various transactions
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2025-01-05').getTime(),
			});

			await createTransaction({
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 150,
				currency: 'USD',
				timestamp: new Date('2025-01-10').getTime(),
			});

			await createTransaction({
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 250,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			const entityIds = ['income-1', 'account-1', 'category-1', 'saving-1'];

			// Get results from batch function
			const batchResults = await getBatchEntityActuals(entityIds, jan2025Start, jan2025End);

			// Get results from individual function for each entity
			for (const entityId of entityIds) {
				const individualResult = await getEntityActual(entityId, jan2025Start, jan2025End);
				expect(batchResults.get(entityId)).toBe(individualResult);
			}
		});

		test('should handle complex transaction flows', async () => {
			// Multiple transactions for the same entities
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 5000,
				currency: 'USD',
				timestamp: new Date('2025-01-01').getTime(),
			});

			await createTransaction({
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 100,
				currency: 'USD',
				timestamp: new Date('2025-01-05').getTime(),
			});

			await createTransaction({
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: new Date('2025-01-10').getTime(),
			});

			await createTransaction({
				id: 'tx-4',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 200,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			await createTransaction({
				id: 'tx-5',
				from_entity_id: 'account-1',
				to_entity_id: 'saving-1',
				amount: 150,
				currency: 'USD',
				timestamp: new Date('2025-01-20').getTime(),
			});

			const results = await getBatchEntityActuals(
				['income-1', 'account-1', 'category-1', 'saving-1'],
				jan2025Start,
				jan2025End
			);

			expect(results.get('income-1')).toBe(-5000);
			expect(results.get('account-1')).toBe(4500); // 5000 in - 500 out
			expect(results.get('category-1')).toBe(150); // 100 + 50
			expect(results.get('saving-1')).toBe(350); // 200 + 150
		});

		test('should handle subset of entities', async () => {
			await createTransaction({
				id: 'tx-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 1000,
				currency: 'USD',
				timestamp: new Date('2025-01-15').getTime(),
			});

			await createTransaction({
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 100,
				currency: 'USD',
				timestamp: new Date('2025-01-20').getTime(),
			});

			// Only ask for account and category, not income and saving
			const results = await getBatchEntityActuals(
				['account-1', 'category-1'],
				jan2025Start,
				jan2025End
			);

			expect(results.size).toBe(2);
			expect(results.get('account-1')).toBe(900); // 1000 in - 100 out
			expect(results.get('category-1')).toBe(100);
			expect(results.has('income-1')).toBe(false);
			expect(results.has('saving-1')).toBe(false);
		});
	});

	describe('series-aware queries', () => {
		const seriesId = 'series-1';
		// Fixed base time so cutoff calculations are deterministic across beforeEach + test calls
		const seriesBaseTime = new Date('2030-01-01T00:00:00Z').getTime();

		beforeEach(async () => {
			// Create series transactions: daily starting from seriesBaseTime
			for (let i = 0; i < 5; i++) {
				await createTransaction({
					id: `series-tx-${i}`,
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 50,
					currency: 'USD',
					timestamp: seriesBaseTime + i * 86400000,
					series_id: seriesId,
				});
			}
			// Non-series transaction
			await createTransaction({
				id: 'standalone-tx',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 100,
				currency: 'USD',
				timestamp: seriesBaseTime,
			});
		});

		test('getTransactionsBySeriesId returns only series transactions', async () => {
			const result = await getTransactionsBySeriesId(seriesId);
			expect(result.length).toBe(5);
			expect(result.every((t) => t.series_id === seriesId)).toBe(true);
		});

		test('deleteTransactionsBySeriesFuture deletes from cutoff onward', async () => {
			const cutoff = seriesBaseTime + 2 * 86400000; // tx-2 and beyond
			await deleteTransactionsBySeriesFuture(seriesId, cutoff);
			const remaining = await getTransactionsBySeriesId(seriesId);
			expect(remaining.length).toBe(2); // only tx-0 and tx-1
			expect(remaining.every((t) => t.timestamp < cutoff)).toBe(true);
		});

		test('updateTransactionsBySeriesFuture updates from cutoff onward', async () => {
			const cutoff = seriesBaseTime + 2 * 86400000;
			await updateTransactionsBySeriesFuture(seriesId, cutoff, { amount: 999 });
			const all = await getTransactionsBySeriesId(seriesId);
			const updated = all.filter((t) => t.timestamp >= cutoff);
			const unchanged = all.filter((t) => t.timestamp < cutoff);
			expect(updated.every((t) => t.amount === 999)).toBe(true);
			expect(unchanged.every((t) => t.amount === 50)).toBe(true);
		});

		test('createTransactionBatch inserts multiple transactions', async () => {
			const batch = [
				{
					id: 'batch-1',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 10,
					currency: 'USD',
					timestamp: Date.now(),
					series_id: 'series-2',
				},
				{
					id: 'batch-2',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 20,
					currency: 'USD',
					timestamp: Date.now() + 86400000,
					series_id: 'series-2',
				},
			];
			await createTransactionBatch(batch);
			const result = await getTransactionsBySeriesId('series-2');
			expect(result.length).toBe(2);
		});
	});

	describe('transaction confirmation', () => {
		test('createTransaction defaults to is_confirmed true', async () => {
			await createTransaction({
				id: 'tx-confirm-default',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: Date.now(),
			});
			const all = await getAllTransactions();
			const tx = all.find((t) => t.id === 'tx-confirm-default');
			expect(tx?.is_confirmed).toBe(true);
		});

		test('createTransaction persists is_confirmed false', async () => {
			await createTransaction({
				id: 'tx-unconfirmed',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
				is_confirmed: false,
			});
			const all = await getAllTransactions();
			const tx = all.find((t) => t.id === 'tx-unconfirmed');
			expect(tx?.is_confirmed).toBe(false);
		});

		test('confirmTransaction flips is_confirmed to true', async () => {
			await createTransaction({
				id: 'tx-to-confirm',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: Date.now(),
				is_confirmed: false,
			});
			await confirmTransaction('tx-to-confirm');
			const all = await getAllTransactions();
			const tx = all.find((t) => t.id === 'tx-to-confirm');
			expect(tx?.is_confirmed).toBe(true);
		});

		test('confirmTransactionsBatch confirms multiple transactions', async () => {
			await createTransaction({
				id: 'tx-batch-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 10,
				currency: 'USD',
				timestamp: Date.now(),
				is_confirmed: false,
			});
			await createTransaction({
				id: 'tx-batch-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 20,
				currency: 'USD',
				timestamp: Date.now(),
				is_confirmed: false,
			});
			await createTransaction({
				id: 'tx-batch-3',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 30,
				currency: 'USD',
				timestamp: Date.now(),
				is_confirmed: true,
			});

			await confirmTransactionsBatch(['tx-batch-1', 'tx-batch-2']);

			const all = await getAllTransactions();
			expect(all.find((t) => t.id === 'tx-batch-1')?.is_confirmed).toBe(true);
			expect(all.find((t) => t.id === 'tx-batch-2')?.is_confirmed).toBe(true);
			expect(all.find((t) => t.id === 'tx-batch-3')?.is_confirmed).toBe(true);
		});

		test('confirmTransactionsBatch handles empty array', async () => {
			await confirmTransactionsBatch([]);
			// Should not throw
		});

		test('createTransactionBatch persists is_confirmed', async () => {
			await createTransactionBatch([
				{
					id: 'batch-c-1',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 10,
					currency: 'USD',
					timestamp: Date.now(),
					is_confirmed: false,
				},
				{
					id: 'batch-c-2',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 20,
					currency: 'USD',
					timestamp: Date.now(),
					is_confirmed: true,
				},
			]);
			const all = await getAllTransactions();
			expect(all.find((t) => t.id === 'batch-c-1')?.is_confirmed).toBe(false);
			expect(all.find((t) => t.id === 'batch-c-2')?.is_confirmed).toBe(true);
		});
	});

	describe('notification id updates', () => {
		test('updateTransactionNotificationId sets and clears a single notification id', async () => {
			await createTransaction({
				id: 'notif-single',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: Date.now(),
			});

			await updateTransactionNotificationId('notif-single', 'notification-1');
			let all = await getAllTransactions();
			expect(all.find((t) => t.id === 'notif-single')?.notification_id).toBe(
				'notification-1'
			);

			await updateTransactionNotificationId('notif-single', null);
			all = await getAllTransactions();
			expect(all.find((t) => t.id === 'notif-single')?.notification_id).toBeNull();
		});

		test('updateTransactionNotificationIdsBatch updates multiple transactions and ignores empty input', async () => {
			await createTransactionBatch([
				{
					id: 'notif-batch-1',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount: 10,
					currency: 'USD',
					timestamp: Date.now(),
				},
				{
					id: 'notif-batch-2',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-1',
					amount: 20,
					currency: 'USD',
					timestamp: Date.now() + 1,
				},
			]);

			await updateTransactionNotificationIdsBatch([
				{ id: 'notif-batch-1', notificationId: 'notif-a' },
				{ id: 'notif-batch-2', notificationId: 'notif-b' },
			]);

			let all = await getAllTransactions();
			expect(all.find((t) => t.id === 'notif-batch-1')?.notification_id).toBe('notif-a');
			expect(all.find((t) => t.id === 'notif-batch-2')?.notification_id).toBe('notif-b');

			await updateTransactionNotificationIdsBatch([]);

			all = await getAllTransactions();
			expect(all.find((t) => t.id === 'notif-batch-1')?.notification_id).toBe('notif-a');
			expect(all.find((t) => t.id === 'notif-batch-2')?.notification_id).toBe('notif-b');
		});
	});
});
