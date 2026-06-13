import { describe, expect, test, beforeEach } from 'bun:test';
import type { Entity, Transaction } from '@/src/types';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';
import { buildRecurringTemplate } from '@/src/utils/transaction-builder';
import { applyOperation } from '../apply-operation';
import { TransactionValidationError } from '@/src/utils/transaction-validation';

const account: Entity = {
	id: 'acc-1',
	type: 'account',
	name: 'Checking',
	currency: 'USD',
	row: 0,
	position: 0,
	order: 0,
};
const category: Entity = {
	id: 'cat-1',
	type: 'category',
	name: 'Groceries',
	currency: 'USD',
	row: 0,
	position: 1,
	order: 1,
};

async function seedEntities(): Promise<Entity[]> {
	await db.createEntity(account);
	await db.createEntity(category);
	return [account, category];
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 'tx-1',
		from_entity_id: 'acc-1',
		to_entity_id: 'cat-1',
		amount_minor: 1234,
		currency: 'USD',
		timestamp: 1700000000000,
		...overrides,
	};
}

describe('applyOperation — transaction.create', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('persists the transaction and returns the stamped row', async () => {
		const entities = await seedEntities();

		const result = await applyOperation(
			{ kind: 'transaction.create', transaction: makeTx() },
			'local',
			{ entities, transactions: [] }
		);

		expect(result.kind).toBe('transaction.create');
		if (result.kind !== 'transaction.create') throw new Error('wrong kind');
		expect(result.created.id).toBe('tx-1');
		expect(result.created.amount_minor).toBe(1234);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'tx-1')?.amount_minor).toBe(1234);
	});

	test('defaults is_confirmed when omitted', async () => {
		const entities = await seedEntities();

		const result = await applyOperation(
			{ kind: 'transaction.create', transaction: makeTx({ is_confirmed: undefined }) },
			'local',
			{ entities, transactions: [] }
		);

		if (result.kind !== 'transaction.create') throw new Error('wrong kind');
		expect(typeof result.created.is_confirmed).toBe('boolean');
	});

	test('throws on an invalid transaction (same source and destination)', async () => {
		const entities = await seedEntities();

		expect(
			applyOperation(
				{ kind: 'transaction.create', transaction: makeTx({ to_entity_id: 'acc-1' }) },
				'local',
				{ entities, transactions: [] }
			)
		).rejects.toThrow(TransactionValidationError);
	});
});

describe('applyOperation — transaction.batch_create', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('persists every row and returns them stamped', async () => {
		const entities = await seedEntities();

		const result = await applyOperation(
			{
				kind: 'transaction.batch_create',
				transactions: [
					makeTx({ id: 'tx-a', amount_minor: 100 }),
					makeTx({ id: 'tx-b', amount_minor: 200 }),
				],
			},
			'local',
			{ entities, transactions: [] }
		);

		if (result.kind !== 'transaction.batch_create') throw new Error('wrong kind');
		expect(result.created.map((t) => t.id).sort()).toEqual(['tx-a', 'tx-b']);

		const all = await db.getAllTransactions();
		expect(all.filter((t) => t.id === 'tx-a' || t.id === 'tx-b')).toHaveLength(2);
	});

	test('rejects the whole batch when any row is invalid', async () => {
		const entities = await seedEntities();

		expect(
			applyOperation(
				{
					kind: 'transaction.batch_create',
					transactions: [
						makeTx({ id: 'tx-a' }),
						makeTx({ id: 'tx-b', amount_minor: -5 }),
					],
				},
				'local',
				{ entities, transactions: [] }
			)
		).rejects.toThrow(TransactionValidationError);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'tx-a')).toBeUndefined();
	});
});

describe('applyOperation — transaction.update', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('applies the patch and returns the stamped row', async () => {
		const entities = await seedEntities();
		const created = await db.createTransaction(makeTx({ amount_minor: 1000 }));

		const result = await applyOperation(
			{ kind: 'transaction.update', id: created.id, updates: { amount_minor: 5000 } },
			'local',
			{ entities, transactions: [created] }
		);

		if (result.kind !== 'transaction.update') throw new Error('wrong kind');
		expect(result.updated?.amount_minor).toBe(5000);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === created.id)?.amount_minor).toBe(5000);
	});

	test('applies a note-only patch without touching the amount', async () => {
		const entities = await seedEntities();
		const created = await db.createTransaction(makeTx({ amount_minor: 1000 }));

		const result = await applyOperation(
			{ kind: 'transaction.update', id: created.id, updates: { note: 'lunch' } },
			'local',
			{ entities, transactions: [created] }
		);

		if (result.kind !== 'transaction.update') throw new Error('wrong kind');
		expect(result.updated?.note).toBe('lunch');
		expect(result.updated?.amount_minor).toBe(1000);
	});

	test('returns updated:null when the transaction is unknown', async () => {
		const entities = await seedEntities();

		const result = await applyOperation(
			{ kind: 'transaction.update', id: 'missing', updates: { amount_minor: 5000 } },
			'local',
			{ entities, transactions: [] }
		);

		if (result.kind !== 'transaction.update') throw new Error('wrong kind');
		expect(result.updated).toBeNull();
		expect(await db.getAllTransactions()).toHaveLength(0);
	});
});

describe('applyOperation — transaction.delete', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('removes the row from the database', async () => {
		const entities = await seedEntities();
		const created = await db.createTransaction(makeTx());

		const result = await applyOperation(
			{ kind: 'transaction.delete', id: created.id },
			'local',
			{ entities, transactions: [created] }
		);

		expect(result.kind).toBe('transaction.delete');

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === created.id)).toBeUndefined();
	});

	test('records a seriesExclusion when the op carries one', async () => {
		const entities = await seedEntities();

		// Create a recurrence template so the FK constraint in deleteTransaction is satisfied.
		const template = buildRecurringTemplate({
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 500,
			currency: 'USD',
			timestamp: 1700000000000,
			rule: { type: 'monthly' },
			horizon: 30,
		});
		await db.createRecurrenceTemplate(template);

		// Create a transaction that belongs to the series.
		const tx = makeTx({ id: 'tx-series-1', series_id: template.id });
		const created = await db.createTransaction(tx);

		const exclusionTs = created.timestamp;

		const result = await applyOperation(
			{
				kind: 'transaction.delete',
				id: created.id,
				seriesExclusion: { templateId: template.id, timestamp: exclusionTs },
			},
			'local',
			{ entities, transactions: [created] }
		);

		expect(result.kind).toBe('transaction.delete');

		// Transaction row must be gone.
		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === created.id)).toBeUndefined();

		// Exclusion row must have been recorded.
		const exclusions = await db.getExclusionsForTemplate(template.id);
		expect(exclusions).toContain(exclusionTs);
	});
});
