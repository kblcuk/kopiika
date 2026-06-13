import { describe, expect, test, beforeEach } from 'bun:test';
import type { Entity, Transaction } from '@/src/types';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';
import { applyOperation } from '../apply-operation';

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
	} as Transaction;
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

		await expect(
			applyOperation(
				{ kind: 'transaction.create', transaction: makeTx({ to_entity_id: 'acc-1' }) },
				'local',
				{ entities, transactions: [] }
			)
		).rejects.toThrow();
	});
});
