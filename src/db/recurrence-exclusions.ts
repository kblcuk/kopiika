import { eq } from 'drizzle-orm';
import { getDrizzleDb } from './drizzle-client';
import { recurrenceExclusions } from './drizzle-schema';

export interface RecurrenceExclusion {
	template_id: string;
	timestamp: number;
}

/**
 * Insert (template_id, timestamp). Idempotent thanks to the composite PK +
 * INSERT OR IGNORE — calling twice with the same args is a no-op and produces
 * the same on-disk state as a single call. Concurrent callers therefore
 * converge on the set-union of all attempted timestamps (KII-123).
 */
export async function addExclusion(templateId: string, timestamp: number): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.insert(recurrenceExclusions)
		.values({ template_id: templateId, timestamp })
		.onConflictDoNothing();
}

/**
 * Bulk hydration. Returns a `Map<templateId, number[]>` so the store can
 * attach exclusions to each in-memory template in a single pass.
 */
export async function getAllExclusionsByTemplate(): Promise<Map<string, number[]>> {
	const db = await getDrizzleDb();
	const rows = await db
		.select()
		.from(recurrenceExclusions)
		.orderBy(recurrenceExclusions.template_id, recurrenceExclusions.timestamp);
	const grouped = new Map<string, number[]>();
	for (const row of rows) {
		const list = grouped.get(row.template_id);
		if (list) {
			list.push(row.timestamp);
		} else {
			grouped.set(row.template_id, [row.timestamp]);
		}
	}
	return grouped;
}

export async function getExclusionsForTemplate(templateId: string): Promise<number[]> {
	const db = await getDrizzleDb();
	const rows = await db
		.select({ timestamp: recurrenceExclusions.timestamp })
		.from(recurrenceExclusions)
		.where(eq(recurrenceExclusions.template_id, templateId))
		.orderBy(recurrenceExclusions.timestamp);
	return rows.map((r) => r.timestamp);
}
