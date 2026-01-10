import { eq, and, desc } from 'drizzle-orm';
import type { Plan } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { plans, entities } from './drizzle-schema';
import { generateId } from '@/src/store';

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

/**
 * Migrates existing savings plans to use 'all-time' period.
 * This should be called once during app initialization after updating to the new period model.
 *
 * For each saving entity, this function:
 * 1. Finds all plans with period='month' (old monthly-based savings plans)
 * 2. Either updates an existing period='all-time' plan or creates a new one
 * 3. Uses the most recent monthly plan's amount as the goal
 * 4. Preserves the period_start date from the most recent plan
 * 5. Deletes the old monthly plans
 */
export async function migrateSavingsPlansToAllTime(): Promise<void> {
	const db = getDrizzleDb();

	// Get all saving entities
	const savingEntities = await db.select().from(entities).where(eq(entities.type, 'saving'));

	for (const entity of savingEntities) {
		// Get all plans for this saving with period='month' (old monthly-based plans)
		const monthlyPlans = await db
			.select()
			.from(plans)
			.where(and(eq(plans.entity_id, entity.id), eq(plans.period, 'month')))
			.orderBy(desc(plans.period_start));

		if (monthlyPlans.length === 0) {
			// No monthly plans to migrate
			continue;
		}

		// Check if an 'all-time' plan already exists
		const allTimePlans = await db
			.select()
			.from(plans)
			.where(and(eq(plans.entity_id, entity.id), eq(plans.period, 'all-time')));

		if (allTimePlans.length > 0) {
			// Update existing all-time plan with the most recent monthly plan's amount
			// Keep the earliest period_start to preserve when the goal was first created
			await updatePlan({
				...allTimePlans[0],
				planned_amount: monthlyPlans[0].planned_amount,
			});
		} else {
			// Create new all-time plan using the most recent monthly plan
			// Preserve the period_start date to show when the goal was created
			const newPlan: Plan = {
				...monthlyPlans[0],
				id: generateId(), // Generate new ID to avoid UNIQUE constraint violation
				period: 'all-time',
				// period_start stays as-is (e.g., '2026-01') to show when goal was created
			};
			await createPlan(newPlan);
		}

		// Delete old monthly plans for this saving
		for (const plan of monthlyPlans) {
			await deletePlan(plan.id);
		}
	}
}
