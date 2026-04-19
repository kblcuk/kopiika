import { eq, and, or } from 'drizzle-orm';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import { getDrizzleDb } from './drizzle-client';
import { recurrenceTemplates } from './drizzle-schema';

export async function getAllRecurrenceTemplates(): Promise<RecurrenceTemplate[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(recurrenceTemplates)
		.where(eq(recurrenceTemplates.is_deleted, false));
}

export async function getRecurrenceTemplateById(
	id: string
): Promise<RecurrenceTemplate | null> {
	const db = await getDrizzleDb();
	const result = await db
		.select()
		.from(recurrenceTemplates)
		.where(eq(recurrenceTemplates.id, id))
		.limit(1);
	return result[0] ?? null;
}

export async function createRecurrenceTemplate(template: RecurrenceTemplate): Promise<void> {
	const db = await getDrizzleDb();
	await db.insert(recurrenceTemplates).values({
		id: template.id,
		from_entity_id: template.from_entity_id,
		to_entity_id: template.to_entity_id,
		amount: template.amount,
		currency: template.currency,
		note: template.note ?? null,
		rule: template.rule,
		start_date: template.start_date,
		end_date: template.end_date ?? null,
		end_count: template.end_count ?? null,
		horizon: template.horizon,
		exclusions: template.exclusions ?? null,
		is_deleted: template.is_deleted ?? false,
		created_at: template.created_at,
	});
}

export async function updateRecurrenceTemplate(
	id: string,
	updates: Partial<Omit<RecurrenceTemplate, 'id'>>
): Promise<void> {
	const db = await getDrizzleDb();
	const updateData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) updateData[key] = value;
	}
	if (Object.keys(updateData).length > 0) {
		await db
			.update(recurrenceTemplates)
			.set(updateData)
			.where(eq(recurrenceTemplates.id, id));
	}
}

export async function softDeleteRecurrenceTemplate(id: string): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.update(recurrenceTemplates)
		.set({ is_deleted: true })
		.where(eq(recurrenceTemplates.id, id));
}

export async function addExclusion(templateId: string, timestamp: number): Promise<void> {
	const template = await getRecurrenceTemplateById(templateId);
	if (!template) return;

	const exclusions: number[] = JSON.parse(template.exclusions ?? '[]');
	exclusions.push(timestamp);

	const db = await getDrizzleDb();
	await db
		.update(recurrenceTemplates)
		.set({ exclusions: JSON.stringify(exclusions) })
		.where(eq(recurrenceTemplates.id, templateId));
}

export async function getActiveTemplatesForEntity(
	entityId: string
): Promise<RecurrenceTemplate[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(recurrenceTemplates)
		.where(
			and(
				eq(recurrenceTemplates.is_deleted, false),
				or(
					eq(recurrenceTemplates.from_entity_id, entityId),
					eq(recurrenceTemplates.to_entity_id, entityId)
				)
			)
		);
}
