import type { Plan } from '@/src/types';
import { getDatabase } from './schema';

export async function getAllPlans(): Promise<Plan[]> {
	const db = await getDatabase();
	const result = await db.getAllAsync<Plan>('SELECT * FROM plans ORDER BY period_start DESC');
	return result;
}

export async function getPlansByPeriod(periodStart: string): Promise<Plan[]> {
	const db = await getDatabase();
	const result = await db.getAllAsync<Plan>('SELECT * FROM plans WHERE period_start = ?', [
		periodStart,
	]);
	return result;
}

export async function getPlanForEntity(
	entityId: string,
	periodStart: string
): Promise<Plan | null> {
	const db = await getDatabase();
	const result = await db.getFirstAsync<Plan>(
		'SELECT * FROM plans WHERE entity_id = ? AND period_start = ?',
		[entityId, periodStart]
	);
	return result;
}

export async function createPlan(plan: Plan): Promise<void> {
	const db = await getDatabase();
	await db.runAsync(
		`INSERT INTO plans (id, entity_id, period, period_start, planned_amount)
		 VALUES (?, ?, ?, ?, ?)`,
		[plan.id, plan.entity_id, plan.period, plan.period_start, plan.planned_amount]
	);
}

export async function updatePlan(plan: Plan): Promise<void> {
	const db = await getDatabase();
	await db.runAsync(
		`UPDATE plans SET entity_id = ?, period = ?, period_start = ?, planned_amount = ?
		 WHERE id = ?`,
		[plan.entity_id, plan.period, plan.period_start, plan.planned_amount, plan.id]
	);
}

export async function upsertPlan(plan: Plan): Promise<void> {
	const db = await getDatabase();
	await db.runAsync(
		`INSERT INTO plans (id, entity_id, period, period_start, planned_amount)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET planned_amount = excluded.planned_amount`,
		[plan.id, plan.entity_id, plan.period, plan.period_start, plan.planned_amount]
	);
}

export async function deletePlan(id: string): Promise<void> {
	const db = await getDatabase();
	await db.runAsync('DELETE FROM plans WHERE id = ?', [id]);
}
