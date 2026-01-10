import type { Entity, EntityType } from '@/src/types';
import { getDatabase } from './schema';

export async function getAllEntities(): Promise<Entity[]> {
	const db = await getDatabase();
	const result = await db.getAllAsync<Entity>('SELECT * FROM entities ORDER BY type, "order"');
	return result;
}

export async function getEntitiesByType(type: EntityType): Promise<Entity[]> {
	const db = await getDatabase();
	const result = await db.getAllAsync<Entity>(
		'SELECT * FROM entities WHERE type = ? ORDER BY "order"',
		[type]
	);
	return result;
}

export async function getEntityById(id: string): Promise<Entity | null> {
	const db = await getDatabase();
	const result = await db.getFirstAsync<Entity>('SELECT * FROM entities WHERE id = ?', [id]);
	return result;
}

export async function createEntity(entity: Entity): Promise<void> {
	const db = await getDatabase();
	await db.runAsync(
		`INSERT INTO entities (id, type, name, currency, icon, color, owner_id, "order")
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			entity.id,
			entity.type,
			entity.name,
			entity.currency,
			entity.icon ?? null,
			entity.color ?? null,
			entity.owner_id ?? null,
			entity.order,
		]
	);
}

export async function updateEntity(entity: Entity): Promise<void> {
	const db = await getDatabase();
	await db.runAsync(
		`UPDATE entities SET type = ?, name = ?, currency = ?, icon = ?, color = ?, owner_id = ?, "order" = ?
		 WHERE id = ?`,
		[
			entity.type,
			entity.name,
			entity.currency,
			entity.icon ?? null,
			entity.color ?? null,
			entity.owner_id ?? null,
			entity.order,
			entity.id,
		]
	);
}

export async function deleteEntity(id: string): Promise<void> {
	const db = await getDatabase();
	await db.runAsync('DELETE FROM entities WHERE id = ?', [id]);
}

export async function getNextOrder(type: EntityType): Promise<number> {
	const db = await getDatabase();
	const result = await db.getFirstAsync<{ maxOrder: number | null }>(
		'SELECT MAX("order") as maxOrder FROM entities WHERE type = ?',
		[type]
	);
	return (result?.maxOrder ?? -1) + 1;
}
