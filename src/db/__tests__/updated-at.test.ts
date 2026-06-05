/**
 * KII-126: every DB mutation must advance `updated_at` so the household
 * sync op-log (KII-96) can order concurrent edits. `created_at` is set on
 * insert and must never be bumped by an UPDATE — that distinction is what
 * lets a freshly-restored device preserve cross-device "first written"
 * time vs "last touched on this device" time.
 *
 * Each test reads the row's `created_at`/`updated_at`, sleeps 2 ms (so
 * `Date.now()` is guaranteed to tick), mutates, and asserts:
 *   - `updated_at` strictly increased
 *   - `created_at` is unchanged
 */
import { describe, expect, test, beforeEach } from 'bun:test';
import type { Entity, MarketValueSnapshot, Plan, Transaction } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import { resetDrizzleDb } from '../drizzle-client';
import {
	createEntity,
	deleteEntity,
	getEntityById,
	setDefaultAccount,
	updateEntity,
	updateEntityPositions,
} from '../entities';
import {
	confirmTransaction,
	confirmTransactionsBatch,
	createTransaction,
	createTransactionBatch,
	getAllTransactions,
	replaceTransactionAtomic,
	updateTransaction,
	updateTransactionNotificationId,
	updateTransactionNotificationIdsBatch,
	updateTransactionsBySeriesFuture,
} from '../transactions';
import { getPlanForEntity, upsertPlan } from '../plans';
import {
	createRecurrenceTemplate,
	getRecurrenceTemplateById,
	softDeleteRecurrenceTemplate,
	updateRecurrenceTemplate,
} from '../recurrence-templates';
import {
	createMarketValueSnapshot,
	getLatestMarketValueSnapshot,
	updateMarketValueSnapshot,
} from '../market-values';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const baseEntity = (id: string, overrides: Partial<Entity> = {}): Entity => ({
	id,
	type: 'account',
	name: id,
	currency: 'USD',
	row: 0,
	position: 0,
	order: 0,
	...overrides,
});

const baseTransaction = (id: string, overrides: Partial<Transaction> = {}): Transaction => ({
	id,
	from_entity_id: 'e1',
	to_entity_id: 'e2',
	amount: 10,
	currency: 'USD',
	timestamp: Date.now(),
	...overrides,
});

const baseTemplate = (
	id: string,
	overrides: Partial<RecurrenceTemplate> = {}
): RecurrenceTemplate => ({
	id,
	from_entity_id: 'e1',
	to_entity_id: 'e2',
	amount: 50,
	currency: 'USD',
	rule: JSON.stringify({ type: 'monthly' }),
	start_date: Date.now(),
	horizon: 30,
	created_at: Date.now(),
	...overrides,
});

describe('updated_at advances on every mutation (KII-126)', () => {
	beforeEach(async () => {
		resetDrizzleDb();
		// Two entities used by transactions and templates.
		await createEntity(baseEntity('e1'));
		await createEntity(baseEntity('e2', { type: 'category', position: 1 }));
	});

	describe('entities', () => {
		test('createEntity stamps created_at and updated_at', async () => {
			const before = Date.now();
			await createEntity(baseEntity('new', { position: 2 }));
			const row = (await getEntityById('new'))!;
			expect(row.created_at).toBeGreaterThanOrEqual(before);
			expect(row.updated_at).toBeGreaterThanOrEqual(before);
			expect(row.updated_at).toBe(row.created_at!);
		});

		test('updateEntity bumps updated_at and preserves created_at', async () => {
			const original = (await getEntityById('e1'))!;
			await sleep(2);
			await updateEntity({ ...baseEntity('e1'), name: 'Renamed' });
			const updated = (await getEntityById('e1'))!;
			expect(updated.updated_at).toBeGreaterThan(original.updated_at!);
			expect(updated.created_at).toBe(original.created_at!);
		});

		test('deleteEntity (soft-delete) bumps updated_at', async () => {
			const original = (await getEntityById('e1'))!;
			await sleep(2);
			await deleteEntity('e1');
			const deleted = (await getEntityById('e1'))!;
			expect(deleted.is_deleted).toBe(true);
			expect(deleted.updated_at).toBeGreaterThan(original.updated_at!);
			expect(deleted.created_at).toBe(original.created_at!);
		});

		test('updateEntityPositions bumps updated_at on every touched row', async () => {
			const a = (await getEntityById('e1'))!;
			const b = (await getEntityById('e2'))!;
			await sleep(2);
			await updateEntityPositions([
				{ id: 'e1', row: 1, position: 0 },
				{ id: 'e2', row: 1, position: 1 },
			]);
			const aAfter = (await getEntityById('e1'))!;
			const bAfter = (await getEntityById('e2'))!;
			expect(aAfter.updated_at).toBeGreaterThan(a.updated_at!);
			expect(bAfter.updated_at).toBeGreaterThan(b.updated_at!);
		});

		test('setDefaultAccount bumps updated_at on promoted account', async () => {
			const original = (await getEntityById('e1'))!;
			await sleep(2);
			await setDefaultAccount('e1');
			const updated = (await getEntityById('e1'))!;
			expect(updated.is_default).toBe(true);
			expect(updated.updated_at).toBeGreaterThan(original.updated_at!);
			expect(updated.created_at).toBe(original.created_at!);
		});
	});

	describe('transactions', () => {
		const readTxn = async (id: string): Promise<Transaction | undefined> => {
			const all = await getAllTransactions();
			return all.find((t) => t.id === id);
		};

		test('createTransaction stamps created_at and updated_at', async () => {
			const before = Date.now();
			await createTransaction(baseTransaction('t1'));
			const row = await readTxn('t1');
			expect(row?.created_at).toBeGreaterThanOrEqual(before);
			expect(row?.updated_at).toBeGreaterThanOrEqual(before);
		});

		test('updateTransaction bumps updated_at and preserves created_at', async () => {
			await createTransaction(baseTransaction('t1'));
			const before = await readTxn('t1');
			await sleep(2);
			await updateTransaction('t1', { amount: 25 });
			const after = await readTxn('t1');
			expect(after?.updated_at).toBeGreaterThan(before!.updated_at as number);
			expect(after?.created_at).toBe(before!.created_at as number);
		});

		test('confirmTransaction bumps updated_at', async () => {
			await createTransaction(baseTransaction('t1', { is_confirmed: false }));
			const before = await readTxn('t1');
			await sleep(2);
			await confirmTransaction('t1');
			const after = await readTxn('t1');
			expect(after?.updated_at).toBeGreaterThan(before!.updated_at as number);
		});

		test('confirmTransactionsBatch bumps updated_at on each id', async () => {
			await createTransaction(baseTransaction('t1', { is_confirmed: false }));
			await createTransaction(baseTransaction('t2', { is_confirmed: false }));
			const beforeA = await readTxn('t1');
			const beforeB = await readTxn('t2');
			await sleep(2);
			await confirmTransactionsBatch(['t1', 't2']);
			const afterA = await readTxn('t1');
			const afterB = await readTxn('t2');
			expect(afterA?.updated_at).toBeGreaterThan(beforeA!.updated_at as number);
			expect(afterB?.updated_at).toBeGreaterThan(beforeB!.updated_at as number);
		});

		test('updateTransactionNotificationId bumps updated_at', async () => {
			await createTransaction(baseTransaction('t1'));
			const before = await readTxn('t1');
			await sleep(2);
			await updateTransactionNotificationId('t1', 'notif-1');
			const after = await readTxn('t1');
			expect(after?.updated_at).toBeGreaterThan(before!.updated_at as number);
		});

		test('updateTransactionNotificationIdsBatch bumps updated_at on each id', async () => {
			await createTransaction(baseTransaction('t1'));
			await createTransaction(baseTransaction('t2'));
			const beforeA = await readTxn('t1');
			const beforeB = await readTxn('t2');
			await sleep(2);
			await updateTransactionNotificationIdsBatch([
				{ id: 't1', notificationId: 'n1' },
				{ id: 't2', notificationId: 'n2' },
			]);
			const afterA = await readTxn('t1');
			const afterB = await readTxn('t2');
			expect(afterA?.updated_at).toBeGreaterThan(beforeA!.updated_at as number);
			expect(afterB?.updated_at).toBeGreaterThan(beforeB!.updated_at as number);
		});

		test('updateTransactionsBySeriesFuture bumps updated_at on matched rows', async () => {
			const ts = Date.now() + 1_000_000;
			await createTransaction(baseTransaction('t1', { series_id: 's1', timestamp: ts }));
			const before = await readTxn('t1');
			await sleep(2);
			await updateTransactionsBySeriesFuture('s1', ts - 1, { amount: 99 });
			const after = await readTxn('t1');
			expect(after?.amount).toBe(99);
			expect(after?.updated_at).toBeGreaterThan(before!.updated_at as number);
		});

		test('createTransactionBatch stamps created_at and updated_at on every row', async () => {
			const before = Date.now();
			await createTransactionBatch([baseTransaction('t1'), baseTransaction('t2')]);
			const a = await readTxn('t1');
			const b = await readTxn('t2');
			expect(a?.created_at).toBeGreaterThanOrEqual(before);
			expect(b?.updated_at).toBeGreaterThanOrEqual(before);
		});

		test('replaceTransactionAtomic stamps new rows and writes the exclusion', async () => {
			// KII-123: the exclusion side-effect now writes to the normalized
			// `recurrence_exclusions` table instead of mutating the template's
			// JSON column. The template's `updated_at` is intentionally NOT
			// bumped — the exclusion row's own existence is the change-tracked
			// unit (sync replay relies on it).
			const { getExclusionsForTemplate } = await import('../recurrence-exclusions');
			await createRecurrenceTemplate(baseTemplate('tpl-1'));
			await createTransaction(baseTransaction('t1', { series_id: 'tpl-1' }));
			const txTime = Date.now();
			await sleep(2);
			await replaceTransactionAtomic('t1', [baseTransaction('t2', { amount: 99 })], {
				seriesExclusion: { templateId: 'tpl-1', timestamp: txTime },
			});
			const t2 = await readTxn('t2');
			expect(t2?.updated_at).toBeGreaterThanOrEqual(txTime);
			expect(await getExclusionsForTemplate('tpl-1')).toContain(txTime);
		});
	});

	describe('plans', () => {
		const basePlan = (overrides: Partial<Plan> = {}): Plan => ({
			id: 'p1',
			entity_id: 'e1',
			period: 'all-time',
			period_start: '2026-01',
			planned_amount: 100,
			...overrides,
		});

		test('upsertPlan insert stamps created_at and updated_at', async () => {
			const before = Date.now();
			await upsertPlan(basePlan());
			const row = await getPlanForEntity('e1', '2026-01');
			expect(row?.created_at).toBeGreaterThanOrEqual(before);
			expect(row?.updated_at).toBeGreaterThanOrEqual(before);
		});

		test('upsertPlan conflict bumps updated_at, keeps created_at', async () => {
			await upsertPlan(basePlan({ planned_amount: 100 }));
			const before = await getPlanForEntity('e1', '2026-01');
			await sleep(2);
			await upsertPlan(basePlan({ id: 'p2', planned_amount: 200 }));
			const after = await getPlanForEntity('e1', '2026-01');
			expect(after?.planned_amount).toBe(200);
			expect(after?.updated_at).toBeGreaterThan(before!.updated_at as number);
			expect(after?.created_at).toBe(before!.created_at as number);
		});
	});

	describe('recurrence_templates', () => {
		test('createRecurrenceTemplate stamps updated_at', async () => {
			await createRecurrenceTemplate(baseTemplate('tpl-1'));
			const row = await getRecurrenceTemplateById('tpl-1');
			expect(row?.updated_at).toBeGreaterThan(0);
		});

		test('updateRecurrenceTemplate bumps updated_at', async () => {
			await createRecurrenceTemplate(baseTemplate('tpl-1'));
			const before = await getRecurrenceTemplateById('tpl-1');
			await sleep(2);
			await updateRecurrenceTemplate('tpl-1', { amount: 999 });
			const after = await getRecurrenceTemplateById('tpl-1');
			expect(after?.updated_at).toBeGreaterThan(before!.updated_at as number);
			expect(after?.created_at).toBe(before!.created_at);
		});

		test('softDeleteRecurrenceTemplate bumps updated_at', async () => {
			await createRecurrenceTemplate(baseTemplate('tpl-1'));
			const before = await getRecurrenceTemplateById('tpl-1');
			await sleep(2);
			await softDeleteRecurrenceTemplate('tpl-1');
			const after = await getRecurrenceTemplateById('tpl-1');
			expect(after?.is_deleted).toBe(true);
			expect(after?.updated_at).toBeGreaterThan(before!.updated_at as number);
		});

		// KII-123: `addExclusion` writes to the normalized `recurrence_exclusions`
		// table — it deliberately does NOT bump the template's `updated_at`. The
		// new exclusion's own row is the change-tracked unit for sync replay
		// (KII-96); double-stamping the template would mean every concurrent
		// addExclusion still has a read-modify-write contention point.
	});

	describe('created_at is immutable on update (KII-126)', () => {
		test('updateTransaction silently drops a hostile created_at in the payload', async () => {
			await createTransaction(baseTransaction('t1'));
			const before = (await getAllTransactions()).find((t) => t.id === 't1')!;
			await sleep(2);
			// Cast through unknown to bypass the type-level guard — simulates
			// a caller that bypasses our type system (e.g. `any`-typed JSON).
			await updateTransaction('t1', {
				amount: 99,
				created_at: 1,
			} as unknown as Parameters<typeof updateTransaction>[1]);
			const after = (await getAllTransactions()).find((t) => t.id === 't1')!;
			expect(after.amount).toBe(99);
			expect(after.created_at).toBe(before.created_at as number);
			expect(after.updated_at).toBeGreaterThan(before.updated_at as number);
		});

		test('updateRecurrenceTemplate silently drops a hostile created_at', async () => {
			await createRecurrenceTemplate(baseTemplate('tpl-1'));
			const before = await getRecurrenceTemplateById('tpl-1');
			await sleep(2);
			await updateRecurrenceTemplate('tpl-1', {
				amount: 999,
				created_at: 1,
			} as unknown as Parameters<typeof updateRecurrenceTemplate>[1]);
			const after = await getRecurrenceTemplateById('tpl-1');
			expect(after?.amount).toBe(999);
			expect(after?.created_at).toBe(before!.created_at);
		});

		test('updateEntity does not write created_at even when entity carries a stale one', async () => {
			const original = (await getEntityById('e1'))!;
			await sleep(2);
			await updateEntity({ ...baseEntity('e1'), name: 'Renamed', created_at: 1 });
			const after = (await getEntityById('e1'))!;
			expect(after.name).toBe('Renamed');
			expect(after.created_at).toBe(original.created_at!);
		});
	});

	describe('market_value_snapshots', () => {
		const baseSnap = (
			id: string,
			overrides: Partial<MarketValueSnapshot> = {}
		): MarketValueSnapshot => ({
			id,
			entity_id: 'e1',
			amount: 1000,
			currency: 'USD',
			date: Date.now(),
			...overrides,
		});

		test('createMarketValueSnapshot stamps created_at and updated_at', async () => {
			const before = Date.now();
			await createMarketValueSnapshot(baseSnap('s1'));
			const row = await getLatestMarketValueSnapshot('e1');
			expect(row?.created_at).toBeGreaterThanOrEqual(before);
			expect(row?.updated_at).toBeGreaterThanOrEqual(before);
		});

		test('updateMarketValueSnapshot bumps updated_at, preserves created_at', async () => {
			await createMarketValueSnapshot(baseSnap('s1'));
			const before = await getLatestMarketValueSnapshot('e1');
			await sleep(2);
			await updateMarketValueSnapshot('s1', { amount: 5555 });
			const after = await getLatestMarketValueSnapshot('e1');
			expect(after?.amount).toBe(5555);
			expect(after?.updated_at).toBeGreaterThan(before!.updated_at as number);
			expect(after?.created_at).toBe(before!.created_at as number);
		});
	});
});
