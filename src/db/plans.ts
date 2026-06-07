import { eq, and, desc } from 'drizzle-orm';
import type { Plan } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { plans } from './drizzle-schema';

export async function getAllPlans(): Promise<Plan[]> {
	const db = await getDrizzleDb();
	return await db.select().from(plans).orderBy(desc(plans.period_start));
}

export async function getPlanForEntity(
	entityId: string,
	periodStart: string
): Promise<Plan | null> {
	const db = await getDrizzleDb();
	const result = await db
		.select()
		.from(plans)
		.where(and(eq(plans.entity_id, entityId), eq(plans.period_start, periodStart)))
		.limit(1);
	return result[0] ?? null;
}

/**
 * Insert-or-update a plan. Returns the persisted row, including DB-stamped
 * timestamps (KII-126). `onConflictDoUpdate` bypasses Drizzle's `$onUpdate`,
 * so `updated_at` is set explicitly on both code paths.
 */
export async function upsertPlan(plan: Plan): Promise<Plan> {
	const db = await getDrizzleDb();
	const now = Date.now();
	const [row] = await db
		.insert(plans)
		.values({
			...plan,
			created_at: plan.created_at ?? now,
			updated_at: plan.updated_at ?? now,
		})
		.onConflictDoUpdate({
			target: [plans.entity_id, plans.period_start],
			set: { planned_amount_minor: plan.planned_amount_minor, updated_at: now },
		})
		.returning();
	return row!;
}

export async function deletePlan(id: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(plans).where(eq(plans.id, id));
}
