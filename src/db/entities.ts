import { eq, max } from 'drizzle-orm';
import type { Entity, EntityType } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { entities } from './drizzle-schema';

export async function getAllEntities(): Promise<Entity[]> {
	const db = getDrizzleDb();
	return await db.select().from(entities).orderBy(entities.type, entities.order);
}

export async function getEntitiesByType(type: EntityType): Promise<Entity[]> {
	const db = getDrizzleDb();
	return await db.select().from(entities).where(eq(entities.type, type)).orderBy(entities.order);
}

export async function getEntityById(id: string): Promise<Entity | null> {
	const db = getDrizzleDb();
	const result = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
	return result[0] ?? null;
}

export async function createEntity(entity: Entity): Promise<void> {
	const db = getDrizzleDb();
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
	const db = getDrizzleDb();
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
	const db = getDrizzleDb();
	// Cascade delete is handled by FK constraint in schema
	await db.delete(entities).where(eq(entities.id, id));
}

export async function getNextOrder(type: EntityType): Promise<number> {
	const db = getDrizzleDb();
	const result = await db
		.select({ maxOrder: max(entities.order) })
		.from(entities)
		.where(eq(entities.type, type));
	return (result[0]?.maxOrder ?? -1) + 1;
}

export async function updateEntityOrders(updates: { id: string; order: number }[]): Promise<void> {
	const db = getDrizzleDb();
	// Update each entity's order in a transaction
	for (const update of updates) {
		await db.update(entities).set({ order: update.order }).where(eq(entities.id, update.id));
	}
}
