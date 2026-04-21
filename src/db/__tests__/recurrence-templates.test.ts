import { describe, expect, test, beforeEach } from 'bun:test';
import type { Entity } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	createRecurrenceTemplate,
	getAllRecurrenceTemplates,
	getRecurrenceTemplateById,
	updateRecurrenceTemplate,
	softDeleteRecurrenceTemplate,
	addExclusion,
	getActiveTemplatesForEntity,
} from '../recurrence-templates';
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
	amount: 50,
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
		expect(result!.amount).toBe(50);
		expect(result!.rule).toBe(JSON.stringify({ type: 'monthly' }));
		expect(result!.is_deleted).toBe(false);
	});

	test('getAllRecurrenceTemplates excludes deleted', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await createRecurrenceTemplate({ ...baseTemplate, id: 'rec-2', is_deleted: true });
		const all = await getAllRecurrenceTemplates();
		expect(all.length).toBe(1);
		expect(all[0].id).toBe('rec-1');
	});

	test('updateRecurrenceTemplate', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await updateRecurrenceTemplate('rec-1', { amount: 100, note: 'Updated' });
		const result = await getRecurrenceTemplateById('rec-1');
		expect(result!.amount).toBe(100);
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

	test('addExclusion appends to exclusions array', async () => {
		await createRecurrenceTemplate(baseTemplate);
		const ts1 = 1000;
		const ts2 = 2000;
		await addExclusion('rec-1', ts1);
		await addExclusion('rec-1', ts2);
		const result = await getRecurrenceTemplateById('rec-1');
		const exclusions = JSON.parse(result!.exclusions ?? '[]');
		expect(exclusions).toEqual([ts1, ts2]);
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
