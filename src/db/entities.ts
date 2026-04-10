import { eq, max, and } from 'drizzle-orm';
import type { Entity, EntityType } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { entities, plans } from './drizzle-schema';

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
			row: entity.row,
			position: entity.position,
			order: entity.order ?? 0,
			include_in_total: entity.include_in_total ?? true,
			is_deleted: entity.is_deleted ?? false,
		})
		.where(eq(entities.id, entity.id));
}

export async function deleteEntity(id: string): Promise<void> {
	await softDeleteEntity(id);
}

export async function softDeleteEntity(id: string): Promise<void> {
	const db = await getDrizzleDb();
	const entity = await getEntityById(id);
	if (!entity || entity.is_deleted) {
		return;
	}

	await db.transaction((tx) => {
		tx.update(entities).set({ is_deleted: true }).where(eq(entities.id, id)).run();

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

export async function moveEntity(
	entityId: string,
	toRow: number,
	toPosition: number
): Promise<void> {
	const entity = await getEntityById(entityId);
	if (!entity || entity.is_deleted) {
		return;
	}

	const fromRow = entity.row;

	// Get all entities in both source and target rows
	const sourceRowEntities = await getEntitiesInRow(entity.type, fromRow);
	const targetRowEntities =
		fromRow === toRow ? sourceRowEntities : await getEntitiesInRow(entity.type, toRow);

	const updates: { id: string; row: number; position: number }[] = [];

	// If moving within the same row
	if (fromRow === toRow) {
		const filtered = sourceRowEntities.filter((e) => e.id !== entityId);
		const reordered = [...filtered.slice(0, toPosition), entity, ...filtered.slice(toPosition)];
		updates.push(
			...reordered.map((e, index) => ({
				id: e.id,
				row: toRow,
				position: index,
			}))
		);
	} else {
		// Moving to different row - update both rows
		// Source row: remove entity and close gap
		const sourceFiltered = sourceRowEntities.filter((e) => e.id !== entityId);
		updates.push(
			...sourceFiltered.map((e, index) => ({
				id: e.id,
				row: fromRow,
				position: index,
			}))
		);

		// Target row: insert entity and shift others
		const targetReordered = [
			...targetRowEntities.slice(0, toPosition),
			entity,
			...targetRowEntities.slice(toPosition),
		];
		updates.push(
			...targetReordered.map((e, index) => ({
				id: e.id,
				row: toRow,
				position: index,
			}))
		);
	}

	await updateEntityPositions(updates);
}

export async function deleteEntityAndReindex(entityId: string): Promise<void> {
	const entity = await getEntityById(entityId);
	if (!entity || entity.is_deleted) {
		return;
	}

	await softDeleteEntity(entityId);
	await reindexRow(entity.type, entity.row);
}
