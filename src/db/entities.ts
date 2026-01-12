import { eq, max } from 'drizzle-orm';
import type { Entity, EntityType } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { entities } from './drizzle-schema';
import {
	BALANCE_ADJUSTMENT_ENTITY_ID,
	createBalanceAdjustmentEntity,
} from '@/src/constants/system-entities';

export async function getAllEntities(): Promise<Entity[]> {
	const db = await getDrizzleDb();
	return await db.select().from(entities).orderBy(entities.type, entities.order);
}

export async function getEntitiesByType(type: EntityType): Promise<Entity[]> {
	const db = await getDrizzleDb();
	return await db.select().from(entities).where(eq(entities.type, type)).orderBy(entities.order);
}

export async function getEntityById(id: string): Promise<Entity | null> {
	const db = await getDrizzleDb();
	const result = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
	return result[0] ?? null;
}

export async function createEntity(entity: Entity): Promise<void> {
	const db = await getDrizzleDb();
	await db.insert(entities).values({
		id: entity.id,
		type: entity.type,
		name: entity.name,
		currency: entity.currency,
		icon: entity.icon ?? null,
		color: entity.color ?? null,
		owner_id: entity.owner_id ?? null,
		order: entity.order,
	});
}

export async function updateEntity(entity: Entity): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.update(entities)
		.set({
			type: entity.type,
			name: entity.name,
			currency: entity.currency,
			icon: entity.icon ?? null,
			color: entity.color ?? null,
			owner_id: entity.owner_id ?? null,
			order: entity.order,
		})
		.where(eq(entities.id, entity.id));
}

export async function deleteEntity(id: string): Promise<void> {
	const db = await getDrizzleDb();
	// Cascade delete is handled by FK constraint in schema
	await db.delete(entities).where(eq(entities.id, id));
}

export async function getNextOrder(type: EntityType): Promise<number> {
	const db = await getDrizzleDb();
	const result = await db
		.select({ maxOrder: max(entities.order) })
		.from(entities)
		.where(eq(entities.type, type));
	return (result[0]?.maxOrder ?? -1) + 1;
}

export async function updateEntityOrders(updates: { id: string; order: number }[]): Promise<void> {
	const db = await getDrizzleDb();
	// Update each entity's order in a transaction
	for (const update of updates) {
		await db.update(entities).set({ order: update.order }).where(eq(entities.id, update.id));
	}
}

/**
 * Ensures the balance adjustment system entity exists.
 * This is idempotent and safe to call multiple times.
 */
export async function ensureBalanceAdjustmentEntity(): Promise<void> {
	const existing = await getEntityById(BALANCE_ADJUSTMENT_ENTITY_ID);
	if (!existing) {
		await createEntity(createBalanceAdjustmentEntity());
	}
}
