import { describe, expect, test, beforeEach } from 'bun:test';
import type { Entity, Transaction } from '@/src/types';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';
import { buildRecurringTemplate } from '@/src/utils/transaction-builder';
import { applyOperation } from '../apply-operation';
import { TransactionValidationError } from '@/src/utils/transaction-validation';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';

const account: Entity = {
	id: 'acc-1',
	type: 'account',
	name: 'Checking',
	currency: 'USD',
	row: 0,
	position: 0,
};
const category: Entity = {
	id: 'cat-1',
	type: 'category',
	name: 'Groceries',
	currency: 'USD',
	row: 0,
	position: 1,
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
			{ entities, transactions: [], recurrenceTemplates: [] }
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
			{ entities, transactions: [], recurrenceTemplates: [] }
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
				{ entities, transactions: [], recurrenceTemplates: [] }
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
			{ entities, transactions: [], recurrenceTemplates: [] }
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
				{ entities, transactions: [], recurrenceTemplates: [] }
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
			{ entities, transactions: [created], recurrenceTemplates: [] }
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
			{ entities, transactions: [created], recurrenceTemplates: [] }
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
			{ entities, transactions: [], recurrenceTemplates: [] }
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
			{ entities, transactions: [created], recurrenceTemplates: [] }
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
			{ entities, transactions: [created], recurrenceTemplates: [] }
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

describe('applyOperation — entity.create / entity.update / entity.delete', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('entity.create persists and returns the stamped entity', async () => {
		const result = await applyOperation({ kind: 'entity.create', entity: account }, 'local', {
			entities: [],
			transactions: [],
			recurrenceTemplates: [],
		});

		if (result.kind !== 'entity.create') throw new Error('wrong kind');
		expect(result.created.id).toBe('acc-1');
		expect(await db.getEntityById('acc-1')).not.toBeNull();
	});

	test('entity.update applies the full-row update', async () => {
		await db.createEntity(account);

		const result = await applyOperation(
			{ kind: 'entity.update', entity: { ...account, name: 'Renamed' } },
			'local',
			{ entities: [account], transactions: [], recurrenceTemplates: [] }
		);

		if (result.kind !== 'entity.update') throw new Error('wrong kind');
		expect(result.updated.name).toBe('Renamed');
		expect((await db.getEntityById('acc-1'))?.name).toBe('Renamed');
	});

	test('entity.update with deleteMarketValueSnapshots removes the snapshots', async () => {
		const investment: Entity = { ...account, id: 'inv-1', is_investment: true };
		await db.createEntity(investment);
		await db.createMarketValueSnapshot({
			id: 'mv-1',
			entity_id: 'inv-1',
			amount_minor: 100000,
			currency: 'USD',
			date: 1700000000000,
		});

		await applyOperation(
			{
				kind: 'entity.update',
				entity: { ...investment, is_investment: false },
				options: { deleteMarketValueSnapshots: true },
			},
			'local',
			{ entities: [investment], transactions: [], recurrenceTemplates: [] }
		);

		expect(await db.getMarketValueSnapshots('inv-1')).toHaveLength(0);
	});

	test('entity.delete soft-deletes and returns the re-read entity list', async () => {
		await db.createEntity(account);
		await db.createEntity(category);

		const result = await applyOperation({ kind: 'entity.delete', id: 'acc-1' }, 'local', {
			entities: [account, category],
			transactions: [],
			recurrenceTemplates: [],
		});

		if (result.kind !== 'entity.delete') throw new Error('wrong kind');
		expect(result.entities).not.toBeNull();
		expect(result.entities!.find((e) => e.id === 'acc-1')?.is_deleted).toBe(true);
		expect(result.entities!.find((e) => e.id === 'cat-1')?.is_deleted).not.toBe(true);
	});

	test('entity.delete refuses the system entity and returns null', async () => {
		const result = await applyOperation(
			{ kind: 'entity.delete', id: BALANCE_ADJUSTMENT_ENTITY_ID },
			'local',
			{ entities: [], transactions: [], recurrenceTemplates: [] }
		);

		if (result.kind !== 'entity.delete') throw new Error('wrong kind');
		expect(result.entities).toBeNull();
	});

	test('entity.delete of an already-deleted entity is a null no-op', async () => {
		const dead: Entity = { ...account, id: 'dead-1', is_deleted: true };
		await db.createEntity(dead);

		const result = await applyOperation({ kind: 'entity.delete', id: 'dead-1' }, 'local', {
			entities: [dead],
			transactions: [],
			recurrenceTemplates: [],
		});

		if (result.kind !== 'entity.delete') throw new Error('wrong kind');
		expect(result.entities).toBeNull();
	});
});

describe('applyOperation — plan.set / plan.delete', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	const plan = {
		id: 'plan-1',
		entity_id: 'cat-1',
		period: 'all-time',
		period_start: '2026-01',
		planned_amount_minor: 10000,
	};

	test('plan.set upserts and returns the stamped plan', async () => {
		const entities = await seedEntities();

		const result = await applyOperation({ kind: 'plan.set', plan }, 'local', {
			entities,
			transactions: [],
			recurrenceTemplates: [],
		});

		if (result.kind !== 'plan.set') throw new Error('wrong kind');
		expect(result.plan?.planned_amount_minor).toBe(10000);
		const all = await db.getAllPlans();
		expect(all.find((p) => p.id === 'plan-1')?.planned_amount_minor).toBe(10000);
	});

	test('plan.set for an unknown entity returns null and persists nothing', async () => {
		const result = await applyOperation(
			{ kind: 'plan.set', plan: { ...plan, entity_id: 'ghost' } },
			'local',
			{ entities: [], transactions: [], recurrenceTemplates: [] }
		);

		if (result.kind !== 'plan.set') throw new Error('wrong kind');
		expect(result.plan).toBeNull();
		expect(await db.getAllPlans()).toHaveLength(0);
	});

	test('plan.delete removes the row', async () => {
		const entities = await seedEntities();
		await applyOperation({ kind: 'plan.set', plan }, 'local', {
			entities,
			transactions: [],
			recurrenceTemplates: [],
		});

		const result = await applyOperation({ kind: 'plan.delete', id: 'plan-1' }, 'local', {
			entities,
			transactions: [],
			recurrenceTemplates: [],
		});

		expect(result.kind).toBe('plan.delete');
		expect(await db.getAllPlans()).toHaveLength(0);
	});
});

describe('applyOperation — transaction.confirm', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('confirms exactly the listed ids', async () => {
		const entities = await seedEntities();
		const a = await db.createTransaction(makeTx({ id: 'conf-a', is_confirmed: false }));
		const b = await db.createTransaction(makeTx({ id: 'conf-b', is_confirmed: false }));

		const result = await applyOperation(
			{ kind: 'transaction.confirm', ids: ['conf-a'] },
			'local',
			{ entities, transactions: [a, b], recurrenceTemplates: [] }
		);

		if (result.kind !== 'transaction.confirm') throw new Error('wrong kind');
		expect(result.confirmed.map((t) => t.id)).toEqual(['conf-a']);
		expect(result.confirmed[0]!.is_confirmed).toBe(true);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'conf-a')?.is_confirmed).toBe(true);
		expect(all.find((t) => t.id === 'conf-b')?.is_confirmed).toBe(false);
	});

	test('unknown ids are skipped, not errors', async () => {
		const entities = await seedEntities();

		const result = await applyOperation(
			{ kind: 'transaction.confirm', ids: ['missing'] },
			'local',
			{ entities, transactions: [], recurrenceTemplates: [] }
		);

		if (result.kind !== 'transaction.confirm') throw new Error('wrong kind');
		expect(result.confirmed).toHaveLength(0);
	});
});
