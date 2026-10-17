import { describe, expect, test, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { Entity, Transaction } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	createRecurrenceTemplate,
	getAllRecurrenceTemplates,
	getRecurrenceTemplateById,
	updateRecurrenceTemplate,
	getActiveTemplatesForEntity,
	deleteSeriesFuture,
} from '../recurrence-templates';
import {
	addExclusion,
	getExclusionsForTemplate,
	getAllExclusionsByTemplate,
} from '../recurrence-exclusions';
import { createEntity } from '../entities';
import { createTransactionBatch, getTransactionsBySeriesId } from '../transactions';
import { getDrizzleDb, resetDrizzleDb } from '../drizzle-client';

const makeEntity = (id: string, type: Entity['type']): Entity => ({
	id,
	type,
	name: `Entity ${id}`,
	currency: 'USD',
	row: 0,
	position: 0,
});

const baseTemplate: RecurrenceTemplate = {
	id: 'rec-1',
	from_entity_id: 'account-1',
	to_entity_id: 'category-1',
	amount_minor: 5000,
	currency: 'USD',
	rule: JSON.stringify({ type: 'monthly' }),
	start_date: Date.now(),
	created_at: Date.now(),
};

describe('recurrence-templates.ts', () => {
	beforeEach(async () => {
		resetDrizzleDb();
		await createEntity(makeEntity('account-1', 'account'));
		await createEntity(makeEntity('category-1', 'category'));
		await createEntity(makeEntity('income-1', 'income'));
	});

	test('createRecurrenceTemplate + getById', async () => {
		await createRecurrenceTemplate(baseTemplate);
		const result = await getRecurrenceTemplateById('rec-1');
		expect(result).not.toBeNull();
		expect(result!.amount_minor).toBe(5000);
		expect(result!.rule).toBe(JSON.stringify({ type: 'monthly' }));
		expect(result!.is_deleted).toBe(false);
	});

	test('getAllRecurrenceTemplates excludes deleted', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await createRecurrenceTemplate({ ...baseTemplate, id: 'rec-2', is_deleted: true });
		const all = await getAllRecurrenceTemplates();
		expect(all.length).toBe(1);
		expect(all[0]!.id).toBe('rec-1');
	});

	test('updateRecurrenceTemplate', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await updateRecurrenceTemplate('rec-1', { amount_minor: 10000, note: 'Updated' });
		const result = await getRecurrenceTemplateById('rec-1');
		expect(result!.amount_minor).toBe(10000);
		expect(result!.note).toBe('Updated');
	});

	describe('deleteSeriesFuture', () => {
		const occurrence = (id: string, timestamp: number): Transaction => ({
			id,
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 5000,
			currency: 'USD',
			timestamp,
			series_id: 'rec-1',
		});
		const seriesIds = async () => (await getTransactionsBySeriesId('rec-1')).map((t) => t.id);

		beforeEach(async () => {
			await createRecurrenceTemplate({ ...baseTemplate, updated_at: 1 });
			await createTransactionBatch([
				occurrence('occ-1', 1000),
				occurrence('occ-2', 2000),
				occurrence('occ-3', 3000),
			]);
		});

		test.each([
			{
				label: "'end_date' ends the series at the last survivor",
				from: 2500,
				retire: 'end_date',
				template: { end_date: 2000, is_deleted: false },
				survivors: ['occ-1', 'occ-2'],
			},
			{
				label: "'end_date' soft-deletes when no occurrence survives",
				from: 1000,
				retire: 'end_date',
				template: { end_date: null, is_deleted: true },
				survivors: [],
			},
			{
				label: "'soft_delete' soft-deletes even when occurrences survive",
				from: 2500,
				retire: 'soft_delete',
				template: { end_date: null, is_deleted: true },
				survivors: ['occ-1', 'occ-2'],
			},
		] as const)('$label', async ({ from, retire, template, survivors }) => {
			expect(await deleteSeriesFuture('rec-1', from, retire)).toMatchObject({
				id: 'rec-1',
				...template,
			});
			expect(await getAllRecurrenceTemplates()).toHaveLength(template.is_deleted ? 0 : 1);
			expect(await seriesIds()).toEqual([...survivors]);
		});

		test('still deletes the occurrences but leaves a missing or already-deleted template alone', async () => {
			await deleteSeriesFuture('rec-1', 9999, 'soft_delete');
			const deletedAt = (await getRecurrenceTemplateById('rec-1'))!.updated_at;

			expect(await deleteSeriesFuture('rec-1', 2500, 'end_date')).toBeNull();
			expect(await seriesIds()).toEqual(['occ-1', 'occ-2']);
			expect(await getRecurrenceTemplateById('rec-1')).toMatchObject({
				updated_at: deletedAt,
				end_date: null,
			});
			expect(await deleteSeriesFuture('missing', 0, 'soft_delete')).toBeNull();
		});

		// KII-198: the occurrence delete and the template write used to commit
		// separately, so a failure in between left the occurrences gone and the
		// template active and unbounded. A trigger aborts the template write; the
		// occurrence delete must roll back with it.
		test.each(['end_date', 'soft_delete'] as const)(
			"'%s' is atomic: a failed template write rolls back the occurrence delete",
			async (retire) => {
				const db = await getDrizzleDb();
				db.run(
					sql.raw(`CREATE TRIGGER fail_retire BEFORE UPDATE ON recurrence_templates
						BEGIN SELECT RAISE(ABORT, 'boom'); END`)
				);

				await expect(deleteSeriesFuture('rec-1', 2500, retire)).rejects.toThrow();

				expect(await seriesIds()).toEqual(['occ-1', 'occ-2', 'occ-3']);
				expect(await getRecurrenceTemplateById('rec-1')).toMatchObject({
					is_deleted: false,
					end_date: null,
					updated_at: 1,
				});
			}
		);
	});

	test('addExclusion writes one row per (template_id, timestamp)', async () => {
		await createRecurrenceTemplate(baseTemplate);
		const ts1 = 1000;
		const ts2 = 2000;
		await addExclusion('rec-1', ts1);
		await addExclusion('rec-1', ts2);
		expect(await getExclusionsForTemplate('rec-1')).toEqual([ts1, ts2]);
	});

	test('addExclusion is idempotent — same (template_id, timestamp) twice is a no-op', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await addExclusion('rec-1', 1000);
		await addExclusion('rec-1', 1000);
		expect(await getExclusionsForTemplate('rec-1')).toEqual([1000]);
	});

	test('concurrent addExclusion calls produce the set-union of all timestamps (KII-123)', async () => {
		// Regression for the pre-KII-123 race: two read-modify-write callers
		// could each parse the same JSON snapshot, append, and stringify back —
		// the second writer would clobber the first's addition. With the
		// normalized table + composite PK, the DB merges concurrent inserts as
		// a set-union.
		await createRecurrenceTemplate(baseTemplate);
		const timestamps = [1000, 2000, 3000, 4000, 5000];
		await Promise.all(timestamps.map((ts) => addExclusion('rec-1', ts)));
		const exclusions = await getExclusionsForTemplate('rec-1');
		expect(exclusions.sort((a, b) => a - b)).toEqual(timestamps);
	});

	test('getAllExclusionsByTemplate groups by template_id', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await createRecurrenceTemplate({ ...baseTemplate, id: 'rec-2' });
		await addExclusion('rec-1', 1000);
		await addExclusion('rec-1', 2000);
		await addExclusion('rec-2', 3000);
		const grouped = await getAllExclusionsByTemplate();
		expect(grouped.get('rec-1')).toEqual([1000, 2000]);
		expect(grouped.get('rec-2')).toEqual([3000]);
	});

	test('soft-deleting a template does not cascade-delete exclusions (template still present)', async () => {
		// Soft-delete keeps the template row, so its exclusions stick around too.
		// Hard-delete via FK CASCADE is exercised by the migration test instead.
		await createRecurrenceTemplate(baseTemplate);
		await addExclusion('rec-1', 1000);
		await deleteSeriesFuture('rec-1', 0, 'soft_delete');
		expect(await getExclusionsForTemplate('rec-1')).toEqual([1000]);
	});

	test('getActiveTemplatesForEntity returns templates referencing entity', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await createRecurrenceTemplate({
			...baseTemplate,
			id: 'rec-2',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
		});

		const forAccount = await getActiveTemplatesForEntity('account-1');
		expect(forAccount.length).toBe(2);

		const forCategory = await getActiveTemplatesForEntity('category-1');
		expect(forCategory.length).toBe(1);
	});
});
