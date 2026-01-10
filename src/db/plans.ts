import { eq, and, desc } from 'drizzle-orm';
import type { Plan } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { plans } from './drizzle-schema';

export async function getAllPlans(): Promise<Plan[]> {
	const db = getDrizzleDb();
	return await db.select().from(plans).orderBy(desc(plans.period_start));
}

export async function getPlansByPeriod(periodStart: string): Promise<Plan[]> {
	const db = getDrizzleDb();
	return await db.select().from(plans).where(eq(plans.period_start, periodStart));
}

export async function getPlanForEntity(
	entityId: string,
	periodStart: string
): Promise<Plan | null> {
	const db = getDrizzleDb();
	const result = await db
		.select()
		.from(plans)
		.where(and(eq(plans.entity_id, entityId), eq(plans.period_start, periodStart)))
		.limit(1);
	return result[0] ?? null;
}

export async function createPlan(plan: Plan): Promise<void> {
	const db = getDrizzleDb();
	await db.insert(plans).values(plan);
}

export async function updatePlan(plan: Plan): Promise<void> {
	const db = getDrizzleDb();
	await db
		.update(plans)
		.set({
			entity_id: plan.entity_id,
			period: plan.period,
			period_start: plan.period_start,
			planned_amount: plan.planned_amount,
		})
		.where(eq(plans.id, plan.id));
}

export async function upsertPlan(plan: Plan): Promise<void> {
	const db = getDrizzleDb();
	await db
		.insert(plans)
		.values(plan)
		.onConflictDoUpdate({
			target: plans.id,
			set: { planned_amount: plan.planned_amount },
		});
}

export async function deletePlan(id: string): Promise<void> {
	const db = getDrizzleDb();
	await db.delete(plans).where(eq(plans.id, id));
}
