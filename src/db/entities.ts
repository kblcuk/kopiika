import { eq, max, and, ne } from 'drizzle-orm';
import type { Entity, EntityType } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { entities, marketValueSnapshots, plans } from './drizzle-schema';

export async function getAllEntities(): Promise<Entity[]> {
	const db = await getDrizzleDb();
	return await db.select().from(entities).orderBy(entities.type, entities.row, entities.position);
}

export async function getEntitiesByType(type: EntityType): Promise<Entity[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(entities)
		.where(and(eq(entities.type, type), eq(entities.is_deleted, false)))
		.orderBy(entities.row, entities.position);
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
		row: entity.row,
		position: entity.position,
		order: entity.order ?? 0,
		include_in_total: entity.include_in_total ?? true,
		is_deleted: entity.is_deleted ?? false,
		is_default: entity.is_default ?? false,
		is_investment: entity.is_investment ?? false,
	});
}

export async function updateEntity(
	entity: Entity,
	options?: { deleteMarketValueSnapshots?: boolean }
): Promise<void> {
	const db = await getDrizzleDb();
	await db.transaction((tx) => {
		tx.update(entities)
			.set({
				type: entity.type,
				name: entity.name,
				currency: entity.currency,
				icon: entity.icon ?? null,
				color: entity.color ?? null,
				row: entity.row,
				position: entity.position,
				order: entity.order ?? 0,
				include_in_total: entity.include_in_total ?? true,
				is_deleted: entity.is_deleted ?? false,
				is_default: entity.is_default ?? false,
				is_investment: entity.is_investment ?? false,
			})
			.where(eq(entities.id, entity.id))
			.run();

		if (options?.deleteMarketValueSnapshots) {
			tx.delete(marketValueSnapshots)
				.where(eq(marketValueSnapshots.entity_id, entity.id))
				.run();
		}
	});
}

export async function deleteEntity(id: string): Promise<void> {
	await softDeleteEntity(id);
}

async function softDeleteEntity(id: string): Promise<void> {
	const db = await getDrizzleDb();
	const entity = await getEntityById(id);
	if (!entity || entity.is_deleted) {
		return;
	}

	await db.transaction((tx) => {
		tx.update(entities).set({ is_deleted: true }).where(eq(entities.id, id)).run();

		tx.delete(marketValueSnapshots).where(eq(marketValueSnapshots.entity_id, id)).run();

		tx.delete(plans).where(eq(plans.entity_id, id)).run();
	});
}

export async function getNextPosition(type: EntityType, row: number): Promise<number> {
	const db = await getDrizzleDb();
	const result = await db
		.select({ maxPosition: max(entities.position) })
		.from(entities)
		.where(and(eq(entities.type, type), eq(entities.row, row)));
	return (result[0]?.maxPosition ?? -1) + 1;
}

export async function updateEntityPositions(
	updates: { id: string; row: number; position: number }[]
): Promise<void> {
	const db = await getDrizzleDb();
	// Update each entity's row and position in a transaction
	for (const update of updates) {
		await db
			.update(entities)
			.set({ row: update.row, position: update.position })
			.where(eq(entities.id, update.id));
	}
}

async function getEntitiesInRow(type: EntityType, row: number): Promise<Entity[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(entities)
		.where(and(eq(entities.type, type), eq(entities.row, row), eq(entities.is_deleted, false)))
		.orderBy(entities.position);
}

async function reindexRow(type: EntityType, row: number): Promise<void> {
	const entitiesInRow = await getEntitiesInRow(type, row);
	const updates = entitiesInRow.map((entity, index) => ({
		id: entity.id,
		row: row,
		position: index,
	}));
	await updateEntityPositions(updates);
}

/**
 * Atomically set (or clear) the default account. Clearing all other accounts'
 * `is_default` and promoting the new one happen inside a single transaction —
 * either both apply or neither. Pass `null` to clear all defaults. Throws if
 * `accountId` does not refer to an existing account (KII-113).
 */
export async function setDefaultAccount(accountId: string | null): Promise<void> {
	const db = await getDrizzleDb();
	await db.transaction((tx) => {
		const clearConditions = [eq(entities.type, 'account'), eq(entities.is_default, true)];
		if (accountId) clearConditions.push(ne(entities.id, accountId));
		tx.update(entities)
			.set({ is_default: false })
			.where(and(...clearConditions))
			.run();

		if (accountId) {
			// Verify target exists inside the transaction. A missing id throws
			// here so the clear above is rolled back — guarantees rather than
			// trusts the atomicity boundary at runtime.
			const existing = tx
				.select({ id: entities.id })
				.from(entities)
				.where(and(eq(entities.id, accountId), eq(entities.type, 'account')))
				.all();
			if (existing.length === 0) {
				throw new Error(`setDefaultAccount: account "${accountId}" does not exist`);
			}
			tx.update(entities).set({ is_default: true }).where(eq(entities.id, accountId)).run();
		}
	});
}

export async function deleteEntityAndReindex(entityId: string): Promise<void> {
	const entity = await getEntityById(entityId);
	if (!entity || entity.is_deleted) {
		return;
	}

	await softDeleteEntity(entityId);
	await reindexRow(entity.type, entity.row);
}
