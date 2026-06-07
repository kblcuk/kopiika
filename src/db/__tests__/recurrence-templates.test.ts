import { describe, expect, test, beforeEach } from 'bun:test';
import type { Entity } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	createRecurrenceTemplate,
	getAllRecurrenceTemplates,
	getRecurrenceTemplateById,
	updateRecurrenceTemplate,
	softDeleteRecurrenceTemplate,
	getActiveTemplatesForEntity,
} from '../recurrence-templates';
import {
	addExclusion,
	getExclusionsForTemplate,
	getAllExclusionsByTemplate,
} from '../recurrence-exclusions';
import { createEntity } from '../entities';
import { resetDrizzleDb } from '../drizzle-client';

const makeEntity = (id: string, type: Entity['type']): Entity => ({
	id,
	type,
	name: `Entity ${id}`,
	currency: 'USD',
	row: 0,
	position: 0,
	order: 0,
});

const baseTemplate: RecurrenceTemplate = {
	id: 'rec-1',
	from_entity_id: 'account-1',
	to_entity_id: 'category-1',
	amount_minor: 5000,
	currency: 'USD',
	rule: JSON.stringify({ type: 'monthly' }),
	start_date: Date.now(),
	horizon: 90,
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

	test('softDeleteRecurrenceTemplate', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await softDeleteRecurrenceTemplate('rec-1');
		const result = await getRecurrenceTemplateById('rec-1');
		expect(result!.is_deleted).toBe(true);
		const all = await getAllRecurrenceTemplates();
		expect(all.length).toBe(0);
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

	test('softDeleteRecurrenceTemplate does not cascade-delete exclusions (template still present)', async () => {
		// Soft-delete keeps the template row, so its exclusions stick around too.
		// Hard-delete via FK CASCADE is exercised by the migration test instead.
		await createRecurrenceTemplate(baseTemplate);
		await addExclusion('rec-1', 1000);
		await softDeleteRecurrenceTemplate('rec-1');
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
