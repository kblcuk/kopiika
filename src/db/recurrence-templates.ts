import { eq, and, or, gte, lt, max } from 'drizzle-orm';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import { getDrizzleDb } from './drizzle-client';
import { recurrenceTemplates, transactions } from './drizzle-schema';

/**
 * Update-input shape. Forbidding `id`, `created_at`, and `updated_at` at
 * the type level (KII-126) prevents a spread-style caller from rewriting
 * write-time metadata. `updated_at` is owned by the helper; `created_at`
 * must never change after insert.
 *
 * `exclusions` is also forbidden here — exclusions live in their own table
 * (KII-123) and are added via `addExclusion` in `recurrence-exclusions.ts`,
 * not via a template-row update.
 */
export type RecurrenceTemplateUpdate = Omit<
	Partial<RecurrenceTemplate>,
	'id' | 'created_at' | 'updated_at' | 'exclusions'
>;

// KII-132: `is_deleted` alone is low-cardinality. Consider composite indexes
// `(is_deleted, from_entity_id)` / `(is_deleted, to_entity_id)` to make
// `getActiveTemplatesForEntity` queries cheap as the table grows.
export async function getAllRecurrenceTemplates(): Promise<RecurrenceTemplate[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(recurrenceTemplates)
		.where(eq(recurrenceTemplates.is_deleted, false));
}

export async function getRecurrenceTemplateById(id: string): Promise<RecurrenceTemplate | null> {
	const db = await getDrizzleDb();
	const result = await db
		.select()
		.from(recurrenceTemplates)
		.where(eq(recurrenceTemplates.id, id))
		.limit(1);
	return result[0] ?? null;
}

export async function createRecurrenceTemplate(
	template: RecurrenceTemplate
): Promise<RecurrenceTemplate> {
	const db = await getDrizzleDb();
	const [row] = await db
		.insert(recurrenceTemplates)
		.values({
			id: template.id,
			from_entity_id: template.from_entity_id,
			to_entity_id: template.to_entity_id,
			amount_minor: template.amount_minor,
			currency: template.currency,
			note: template.note ?? null,
			rule: template.rule,
			start_date: template.start_date,
			end_date: template.end_date ?? null,
			end_count: template.end_count ?? null,
			is_deleted: template.is_deleted ?? false,
			created_at: template.created_at,
			updated_at: template.updated_at ?? template.created_at,
		})
		.returning();
	return row!;
}

export async function updateRecurrenceTemplate(
	id: string,
	updates: RecurrenceTemplateUpdate
): Promise<RecurrenceTemplate | null> {
	const db = await getDrizzleDb();
	const updateData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(updates)) {
		if (value === undefined) continue;
		// Belt-and-suspenders against `any`-typed callers (KII-126, KII-123).
		if (key === 'created_at' || key === 'updated_at' || key === 'id' || key === 'exclusions')
			continue;
		updateData[key] = value;
	}
	if (Object.keys(updateData).length === 0) return null;
	updateData.updated_at = Date.now();
	const [row] = await db
		.update(recurrenceTemplates)
		.set(updateData)
		.where(eq(recurrenceTemplates.id, id))
		.returning();
	return row ?? null;
}

/**
 * Delete each series' occurrences from `fromTimestamp` onward and retire its
 * template, all in a single SQLite transaction. Committed separately, a failure
 * in between left the occurrences gone but the template active and unbounded,
 * so backfill re-materialized them on next launch (KII-198). Batching several
 * series keeps a mid-way failure from committing the earlier ones while the
 * store still shows them (KII-199).
 *
 * - `'end_date'` (recurrence.delete_future): end the series at its last
 *   surviving occurrence, or soft-delete it when none survive. The survivor is
 *   read here rather than from the store, whose transactions can still be the
 *   partial phase-1 snapshot (KII-144).
 * - `'soft_delete'` (recurrence.deactivate): soft-delete unconditionally.
 *
 * The `is_deleted = false` guard lives in the UPDATE itself, so a missing or
 * already-deleted template is left out of the result and keeps its `updated_at`.
 */
export async function deleteSeriesFuture(
	seriesIds: readonly string[],
	fromTimestamp: number,
	retire: 'end_date' | 'soft_delete'
): Promise<RecurrenceTemplate[]> {
	const db = await getDrizzleDb();
	return db.transaction((tx) => {
		const retired: RecurrenceTemplate[] = [];
		for (const seriesId of seriesIds) {
			tx.delete(transactions)
				.where(
					and(
						eq(transactions.series_id, seriesId),
						gte(transactions.timestamp, fromTimestamp)
					)
				)
				.run();

			const lastSurvivor =
				retire === 'end_date'
					? tx
							.select({ timestamp: max(transactions.timestamp) })
							.from(transactions)
							.where(
								and(
									eq(transactions.series_id, seriesId),
									lt(transactions.timestamp, fromTimestamp)
								)
							)
							.all()[0]?.timestamp
					: null;
			const [row] = tx
				.update(recurrenceTemplates)
				.set({
					...(lastSurvivor == null ? { is_deleted: true } : { end_date: lastSurvivor }),
					updated_at: Date.now(),
				})
				.where(
					and(
						eq(recurrenceTemplates.id, seriesId),
						eq(recurrenceTemplates.is_deleted, false)
					)
				)
				.returning()
				.all();
			if (row) retired.push(row);
		}
		return retired;
	});
}

export async function getActiveTemplatesForEntity(entityId: string): Promise<RecurrenceTemplate[]> {
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
