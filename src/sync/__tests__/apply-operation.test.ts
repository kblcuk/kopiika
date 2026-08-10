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

describe('applyOperation — transaction.split', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('replaces the original with the split rows atomically', async () => {
		const entities = await seedEntities();
		const original = await db.createTransaction(
			makeTx({ id: 'split-orig', amount_minor: 3000 })
		);

		const result = await applyOperation(
			{
				kind: 'transaction.split',
				originalId: 'split-orig',
				rows: [
					makeTx({ id: 'split-a', amount_minor: 1000 }),
					makeTx({ id: 'split-b', amount_minor: 2000 }),
				],
			},
			'local',
			{ entities, transactions: [original], recurrenceTemplates: [] }
		);

		if (result.kind !== 'transaction.split') throw new Error('wrong kind');
		expect(result.created.map((t) => t.id).sort()).toEqual(['split-a', 'split-b']);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'split-orig')).toBeUndefined();
		expect(all.filter((t) => t.id === 'split-a' || t.id === 'split-b')).toHaveLength(2);
	});

	test('strips series_id from split children', async () => {
		const entities = await seedEntities();
		const template = buildRecurringTemplate({
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 500,
			currency: 'USD',
			timestamp: 1700000000000,
			rule: { type: 'monthly' },
		});
		await db.createRecurrenceTemplate(template);
		const original = await db.createTransaction(
			makeTx({ id: 'split-rec', series_id: template.id })
		);

		const result = await applyOperation(
			{
				kind: 'transaction.split',
				originalId: 'split-rec',
				rows: [makeTx({ id: 'split-c', series_id: template.id })],
				seriesExclusion: { templateId: template.id, timestamp: original.timestamp },
			},
			'local',
			{ entities, transactions: [original], recurrenceTemplates: [] }
		);

		if (result.kind !== 'transaction.split') throw new Error('wrong kind');
		expect(result.created[0]!.series_id ?? null).toBeNull();

		const exclusions = await db.getExclusionsForTemplate(template.id);
		expect(exclusions).toContain(original.timestamp);
	});

	test('rejects the whole split when any row is invalid; original survives', async () => {
		const entities = await seedEntities();
		const original = await db.createTransaction(
			makeTx({ id: 'split-bad', amount_minor: 3000 })
		);

		expect(
			applyOperation(
				{
					kind: 'transaction.split',
					originalId: 'split-bad',
					rows: [
						makeTx({ id: 'split-x', amount_minor: 1000 }),
						makeTx({ id: 'split-y', amount_minor: -1 }),
					],
				},
				'local',
				{ entities, transactions: [original], recurrenceTemplates: [] }
			)
		).rejects.toThrow(TransactionValidationError);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'split-bad')).toBeDefined();
		expect(all.find((t) => t.id === 'split-x')).toBeUndefined();
	});

	test('preserves split_id on split children', async () => {
		const entities = await seedEntities();
		const original = await db.createTransaction(makeTx({ id: 'sp-orig', amount_minor: 3000 }));

		const result = await applyOperation(
			{
				kind: 'transaction.split',
				originalId: 'sp-orig',
				rows: [
					makeTx({ id: 'sp-a', amount_minor: 1000, split_id: 'group-1' }),
					makeTx({ id: 'sp-b', amount_minor: 2000, split_id: 'group-1' }),
				],
			},
			'local',
			{ entities, transactions: [original], recurrenceTemplates: [] }
		);

		if (result.kind !== 'transaction.split') throw new Error('wrong kind');
		expect(result.created.map((t) => t.split_id)).toEqual(['group-1', 'group-1']);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'sp-a')?.split_id).toBe('group-1');
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

describe('applyOperation — reservation.set', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	const saving: Entity = {
		id: 'sav-1',
		type: 'saving',
		name: 'Vacation',
		currency: 'USD',
		row: 0,
		position: 0,
	};

	async function seedReservationEntities(): Promise<Entity[]> {
		await db.createEntity(account);
		await db.createEntity(saving);
		return [account, saving];
	}

	test('creates an account→saving transaction for a positive delta', async () => {
		const entities = await seedReservationEntities();

		const result = await applyOperation(
			{
				kind: 'reservation.set',
				accountEntityId: 'acc-1',
				savingEntityId: 'sav-1',
				desiredTotalMinor: 5000,
			},
			'local',
			{ entities, transactions: [], recurrenceTemplates: [] }
		);

		if (result.kind !== 'reservation.set') throw new Error('wrong kind');
		expect(result.created?.from_entity_id).toBe('acc-1');
		expect(result.created?.to_entity_id).toBe('sav-1');
		expect(result.created?.amount_minor).toBe(5000);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === result.created!.id)?.amount_minor).toBe(5000);
	});

	test('creates a saving→account transaction when lowering the target', async () => {
		const entities = await seedReservationEntities();
		const existing = await db.createTransaction(
			makeTx({
				id: 'resv-1',
				from_entity_id: 'acc-1',
				to_entity_id: 'sav-1',
				amount_minor: 8000,
			})
		);

		const result = await applyOperation(
			{
				kind: 'reservation.set',
				accountEntityId: 'acc-1',
				savingEntityId: 'sav-1',
				desiredTotalMinor: 3000,
			},
			'local',
			{ entities, transactions: [existing], recurrenceTemplates: [] }
		);

		if (result.kind !== 'reservation.set') throw new Error('wrong kind');
		expect(result.created?.from_entity_id).toBe('sav-1');
		expect(result.created?.to_entity_id).toBe('acc-1');
		expect(result.created?.amount_minor).toBe(5000);
	});

	test('is a null no-op when the target equals the current net', async () => {
		const entities = await seedReservationEntities();
		const existing = await db.createTransaction(
			makeTx({
				id: 'resv-2',
				from_entity_id: 'acc-1',
				to_entity_id: 'sav-1',
				amount_minor: 4000,
			})
		);

		const result = await applyOperation(
			{
				kind: 'reservation.set',
				accountEntityId: 'acc-1',
				savingEntityId: 'sav-1',
				desiredTotalMinor: 4000,
			},
			'local',
			{ entities, transactions: [existing], recurrenceTemplates: [] }
		);

		if (result.kind !== 'reservation.set') throw new Error('wrong kind');
		expect(result.created).toBeNull();
		expect(await db.getAllTransactions()).toHaveLength(1);
	});

	test('throws when an entity is missing', async () => {
		expect(
			applyOperation(
				{
					kind: 'reservation.set',
					accountEntityId: 'ghost',
					savingEntityId: 'sav-1',
					desiredTotalMinor: 100,
				},
				'local',
				{ entities: [], transactions: [], recurrenceTemplates: [] }
			)
		).rejects.toThrow('Cannot reserve with non-existent entities');
	});
});

describe('applyOperation — recurrence.exclude', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('records an exclusion for the series', async () => {
		await seedEntities();
		const template = buildRecurringTemplate({
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 500,
			currency: 'USD',
			timestamp: 1700000000000,
			rule: { type: 'monthly' },
		});
		await db.createRecurrenceTemplate(template);

		const result = await applyOperation(
			{ kind: 'recurrence.exclude', seriesId: template.id, timestamp: 1702600000000 },
			'local',
			{ entities: [], transactions: [], recurrenceTemplates: [] }
		);

		expect(result.kind).toBe('recurrence.exclude');
		expect(await db.getExclusionsForTemplate(template.id)).toContain(1702600000000);
	});
});

describe('applyOperation — recurrence.create', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('persists the template and returns it stamped', async () => {
		const entities = await seedEntities();
		const template = buildRecurringTemplate({
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 900,
			currency: 'USD',
			timestamp: 1700000000000,
			rule: { type: 'monthly' },
		});

		const result = await applyOperation({ kind: 'recurrence.create', template }, 'local', {
			entities,
			transactions: [],
			recurrenceTemplates: [],
		});

		if (result.kind !== 'recurrence.create') throw new Error('wrong kind');
		expect(result.created.id).toBe(template.id);
		expect(await db.getRecurrenceTemplateById(template.id)).not.toBeNull();
	});

	test('rejects a template whose entities are invalid', async () => {
		const template = buildRecurringTemplate({
			from_entity_id: 'ghost-from',
			to_entity_id: 'ghost-to',
			amount_minor: 900,
			currency: 'USD',
			timestamp: 1700000000000,
			rule: { type: 'monthly' },
		});

		expect(
			applyOperation({ kind: 'recurrence.create', template }, 'local', {
				entities: [],
				transactions: [],
				recurrenceTemplates: [],
			})
		).rejects.toThrow(TransactionValidationError);
	});
});

describe('applyOperation — recurrence.update_future', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	async function seedSeries() {
		const entities = await seedEntities();
		const template = buildRecurringTemplate({
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 500,
			currency: 'USD',
			timestamp: 1700000000000,
			rule: { type: 'monthly' },
		});
		await db.createRecurrenceTemplate(template);
		const past = await db.createTransaction(
			makeTx({ id: 'occ-past', series_id: template.id, timestamp: 1697000000000 })
		);
		const anchor = await db.createTransaction(
			makeTx({ id: 'occ-anchor', series_id: template.id, timestamp: 1700000000000 })
		);
		const future = await db.createTransaction(
			makeTx({ id: 'occ-future', series_id: template.id, timestamp: 1702600000000 })
		);
		return { entities, template, past, anchor, future };
	}

	test('updates the template and rows from the anchor onward; past rows untouched', async () => {
		const { entities, template, past, anchor, future } = await seedSeries();
		const fullTemplate = { ...template, exclusions: [] };

		const result = await applyOperation(
			{
				kind: 'recurrence.update_future',
				anchorId: 'occ-anchor',
				updates: { amount_minor: 999 },
			},
			'local',
			{
				entities,
				transactions: [past, anchor, future],
				recurrenceTemplates: [fullTemplate],
			}
		);

		if (result.kind !== 'recurrence.update_future') throw new Error('wrong kind');
		expect(result.template?.amount_minor).toBe(999);
		expect(result.transactions.map((t) => t.id).sort()).toEqual(['occ-anchor', 'occ-future']);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'occ-past')?.amount_minor).toBe(1234);
		expect(all.find((t) => t.id === 'occ-anchor')?.amount_minor).toBe(999);
		expect(all.find((t) => t.id === 'occ-future')?.amount_minor).toBe(999);
	});

	test('orphaned series (template gone) still updates the rows, template null', async () => {
		const { entities, past, anchor, future } = await seedSeries();

		const result = await applyOperation(
			{
				kind: 'recurrence.update_future',
				anchorId: 'occ-anchor',
				updates: { amount_minor: 777 },
			},
			'local',
			{
				entities,
				transactions: [past, anchor, future],
				recurrenceTemplates: [], // template not in ctx → treated as orphan
			}
		);

		if (result.kind !== 'recurrence.update_future') throw new Error('wrong kind');
		expect(result.template).toBeNull();
		expect(result.transactions.map((t) => t.id).sort()).toEqual(['occ-anchor', 'occ-future']);
	});

	test('unknown anchor is a no-op result', async () => {
		const entities = await seedEntities();

		const result = await applyOperation(
			{ kind: 'recurrence.update_future', anchorId: 'missing', updates: { note: 'x' } },
			'local',
			{ entities, transactions: [], recurrenceTemplates: [] }
		);

		if (result.kind !== 'recurrence.update_future') throw new Error('wrong kind');
		expect(result.template).toBeNull();
		expect(result.transactions).toHaveLength(0);
	});
});

describe('applyOperation — recurrence.delete_future', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	async function seedSeries() {
		const entities = await seedEntities();
		const template = buildRecurringTemplate({
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 500,
			currency: 'USD',
			timestamp: 1697000000000,
			rule: { type: 'monthly' },
		});
		await db.createRecurrenceTemplate(template);
		const past = await db.createTransaction(
			makeTx({ id: 'del-past', series_id: template.id, timestamp: 1697000000000 })
		);
		const anchor = await db.createTransaction(
			makeTx({ id: 'del-anchor', series_id: template.id, timestamp: 1700000000000 })
		);
		return { entities, template, past, anchor };
	}

	test('clamps end_date to the last remaining occurrence when some remain', async () => {
		const { entities, past, anchor } = await seedSeries();

		const result = await applyOperation(
			{
				kind: 'recurrence.delete_future',
				seriesId: past.series_id!,
				fromTimestamp: anchor.timestamp,
			},
			'local',
			{ entities, transactions: [past, anchor], recurrenceTemplates: [] }
		);

		if (result.kind !== 'recurrence.delete_future') throw new Error('wrong kind');
		expect(result.template?.end_date).toBe(past.timestamp);
		expect(result.template?.is_deleted).not.toBe(true);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'del-anchor')).toBeUndefined();
		expect(all.find((t) => t.id === 'del-past')).toBeDefined();
	});

	test('soft-deletes the template when nothing remains', async () => {
		const { entities, past, anchor } = await seedSeries();

		const result = await applyOperation(
			{
				kind: 'recurrence.delete_future',
				seriesId: past.series_id!,
				fromTimestamp: past.timestamp,
			},
			'local',
			{ entities, transactions: [past, anchor], recurrenceTemplates: [] }
		);

		if (result.kind !== 'recurrence.delete_future') throw new Error('wrong kind');
		expect(result.template?.is_deleted).toBe(true);
		expect(await db.getAllTransactions()).toHaveLength(0);
	});
});

describe('applyOperation — recurrence.deactivate', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('deletes future rows and unconditionally soft-deletes the template', async () => {
		const entities = await seedEntities();
		const template = buildRecurringTemplate({
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 500,
			currency: 'USD',
			timestamp: 1697000000000,
			rule: { type: 'monthly' },
		});
		await db.createRecurrenceTemplate(template);
		const past = await db.createTransaction(
			makeTx({ id: 'deact-past', series_id: template.id, timestamp: 1697000000000 })
		);
		const future = await db.createTransaction(
			makeTx({ id: 'deact-future', series_id: template.id, timestamp: 1700000000000 })
		);

		const result = await applyOperation(
			{ kind: 'recurrence.deactivate', seriesId: template.id, fromTimestamp: 1699000000000 },
			'local',
			{ entities, transactions: [past, future], recurrenceTemplates: [] }
		);

		if (result.kind !== 'recurrence.deactivate') throw new Error('wrong kind');
		// Unconditional soft-delete even though a past row remains — this is what
		// distinguishes deactivate from delete_future.
		expect(result.template?.is_deleted).toBe(true);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'deact-past')).toBeDefined();
		expect(all.find((t) => t.id === 'deact-future')).toBeUndefined();
	});
});

describe('applyOperation — market_value.*', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	const snapshot = {
		id: 'mv-op-1',
		entity_id: 'acc-1',
		amount_minor: 250000,
		date: 1700000000000,
		currency: 'USD',
	};

	async function seedInvestment(): Promise<Entity[]> {
		const investment: Entity = { ...account, is_investment: true };
		await db.createEntity(investment);
		return [investment];
	}

	test('market_value.create persists and returns the stamped snapshot', async () => {
		const entities = await seedInvestment();

		const result = await applyOperation({ kind: 'market_value.create', snapshot }, 'local', {
			entities,
			transactions: [],
			recurrenceTemplates: [],
		});

		if (result.kind !== 'market_value.create') throw new Error('wrong kind');
		expect(result.created.id).toBe('mv-op-1');
		expect(await db.getMarketValueSnapshots('acc-1')).toHaveLength(1);
	});

	test('market_value.update patches the row; unknown id returns null', async () => {
		const entities = await seedInvestment();
		await db.createMarketValueSnapshot(snapshot);

		const result = await applyOperation(
			{ kind: 'market_value.update', id: 'mv-op-1', updates: { amount_minor: 300000 } },
			'local',
			{ entities, transactions: [], recurrenceTemplates: [] }
		);
		if (result.kind !== 'market_value.update') throw new Error('wrong kind');
		expect(result.updated?.amount_minor).toBe(300000);

		const missing = await applyOperation(
			{ kind: 'market_value.update', id: 'ghost', updates: { amount_minor: 1 } },
			'local',
			{ entities, transactions: [], recurrenceTemplates: [] }
		);
		if (missing.kind !== 'market_value.update') throw new Error('wrong kind');
		expect(missing.updated).toBeNull();
	});

	test('market_value.delete and delete_all remove rows', async () => {
		const entities = await seedInvestment();
		await db.createMarketValueSnapshot(snapshot);
		await db.createMarketValueSnapshot({ ...snapshot, id: 'mv-op-2', date: 1700100000000 });

		await applyOperation({ kind: 'market_value.delete', id: 'mv-op-1' }, 'local', {
			entities,
			transactions: [],
			recurrenceTemplates: [],
		});
		expect((await db.getMarketValueSnapshots('acc-1')).map((s) => s.id)).toEqual(['mv-op-2']);

		await applyOperation({ kind: 'market_value.delete_all', entityId: 'acc-1' }, 'local', {
			entities,
			transactions: [],
			recurrenceTemplates: [],
		});
		expect(await db.getMarketValueSnapshots('acc-1')).toHaveLength(0);
	});
});

describe('applyOperation — import.replace_all', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('replaces the whole dataset atomically and returns the re-read state', async () => {
		// Pre-existing data that must vanish.
		await db.createEntity({ ...account, id: 'old-acc' });
		await db.createTransaction(
			makeTx({ id: 'old-tx', from_entity_id: 'old-acc', to_entity_id: 'old-acc' })
		);

		const result = await applyOperation(
			{
				kind: 'import.replace_all',
				entities: [account, category],
				plans: [
					{
						id: 'imp-plan',
						entity_id: 'cat-1',
						period: 'all-time',
						period_start: '2026-01',
						planned_amount_minor: 7000,
					},
				],
				transactions: [makeTx({ id: 'imp-tx' })],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
			},
			'local',
			{ entities: [], transactions: [], recurrenceTemplates: [] }
		);

		if (result.kind !== 'import.replace_all') throw new Error('wrong kind');
		expect(result.entities.map((e) => e.id).sort()).toEqual(['acc-1', 'cat-1']);
		expect(result.plans.map((p) => p.id)).toEqual(['imp-plan']);
		expect(result.transactions.map((t) => t.id)).toEqual(['imp-tx']);

		const all = await db.getAllTransactions();
		expect(all.find((t) => t.id === 'old-tx')).toBeUndefined();
		expect(all.find((t) => t.id === 'imp-tx')).toBeDefined();
	});
});
