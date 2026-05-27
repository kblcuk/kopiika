import { eq, max, and, ne, inArray } from 'drizzle-orm';
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

/**
 * Insert an entity. Returns the persisted row, including DB-stamped
 * `created_at`/`updated_at`, so callers (e.g. the store) can mirror the
 * exact persisted timestamps in their in-memory state (KII-126).
 */
export async function createEntity(entity: Entity): Promise<Entity> {
	const db = await getDrizzleDb();
	const now = Date.now();
	const [row] = await db
		.insert(entities)
		.values({
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
			created_at: entity.created_at ?? now,
			updated_at: entity.updated_at ?? now,
		})
		.returning();
	return row!;
}

/**
 * Update an entity. `created_at` is deliberately not in the SET clause — an
 * UPDATE can never bump it (KII-126). Returns the stamped row.
 */
export async function updateEntity(
	entity: Entity,
	options?: { deleteMarketValueSnapshots?: boolean }
): Promise<Entity> {
	const db = await getDrizzleDb();
	return await db.transaction((tx) => {
		const [row] = tx
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
				is_default: entity.is_default ?? false,
				is_investment: entity.is_investment ?? false,
				updated_at: Date.now(),
			})
			.where(eq(entities.id, entity.id))
			.returning()
			.all();

		if (options?.deleteMarketValueSnapshots) {
			tx.delete(marketValueSnapshots)
				.where(eq(marketValueSnapshots.entity_id, entity.id))
				.run();
		}
		return row!;
	});
}

export async function deleteEntity(id: string): Promise<Entity | null> {
	return softDeleteEntity(id);
}

async function softDeleteEntity(id: string): Promise<Entity | null> {
	const db = await getDrizzleDb();
	// KII-132: TOCTOU between this read and the UPDATE inside the transaction —
	// a concurrent caller can re-delete. Move the guard into the UPDATE's WHERE
	// (`is_deleted = false`) and check `changes > 0`.
	const entity = await getEntityById(id);
	if (!entity || entity.is_deleted) {
		return null;
	}

	return await db.transaction((tx) => {
		const [row] = tx
			.update(entities)
			.set({ is_deleted: true, updated_at: Date.now() })
			.where(eq(entities.id, id))
			.returning()
			.all();

		tx.delete(marketValueSnapshots).where(eq(marketValueSnapshots.entity_id, id)).run();

		tx.delete(plans).where(eq(plans.entity_id, id)).run();
		return row ?? null;
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

/**
 * Update positions for a batch of entities. Returns the stamped rows so
 * callers can update in-memory state with the exact persisted `updated_at`.
 */
export async function updateEntityPositions(
	updates: { id: string; row: number; position: number }[]
): Promise<Entity[]> {
	if (updates.length === 0) return [];
	const db = await getDrizzleDb();
	const now = Date.now();
	return await db.transaction((tx) => {
		const stamped: Entity[] = [];
		for (const update of updates) {
			const [row] = tx
				.update(entities)
				.set({ row: update.row, position: update.position, updated_at: now })
				.where(eq(entities.id, update.id))
				.returning()
				.all();
			if (row) stamped.push(row);
		}
		return stamped;
	});
}

async function getEntitiesInRow(type: EntityType, row: number): Promise<Entity[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(entities)
		.where(and(eq(entities.type, type), eq(entities.row, row), eq(entities.is_deleted, false)))
		.orderBy(entities.position);
}

async function reindexRow(type: EntityType, row: number): Promise<Entity[]> {
	const entitiesInRow = await getEntitiesInRow(type, row);
	const updates = entitiesInRow.map((entity, index) => ({
		id: entity.id,
		row: row,
		position: index,
	}));
	return updateEntityPositions(updates);
}

/**
 * Atomically set (or clear) the default account. Clearing all other accounts'
 * `is_default` and promoting the new one happen inside a single transaction —
 * either both apply or neither. Pass `null` to clear all defaults. Throws if
 * `accountId` does not refer to an existing account (KII-113). Returns the
 * stamped rows touched by the operation so callers can mirror them.
 */
export async function setDefaultAccount(accountId: string | null): Promise<Entity[]> {
	const db = await getDrizzleDb();
	const now = Date.now();
	return await db.transaction((tx) => {
		const clearConditions = [eq(entities.type, 'account'), eq(entities.is_default, true)];
		if (accountId) clearConditions.push(ne(entities.id, accountId));
		const cleared = tx
			.update(entities)
			.set({ is_default: false, updated_at: now })
			.where(and(...clearConditions))
			.returning()
			.all();

		if (!accountId) return cleared;

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
		const [promoted] = tx
			.update(entities)
			.set({ is_default: true, updated_at: now })
			.where(eq(entities.id, accountId))
			.returning()
			.all();
		return promoted ? [...cleared, promoted] : cleared;
	});
}

/**
 * Soft-delete an entity and reindex remaining entities in the same row.
 * Returns all entities whose row position was touched, so callers can
 * replace the affected slice of in-memory state with the stamped rows.
 */
export async function deleteEntityAndReindex(entityId: string): Promise<{
	deleted: Entity | null;
	reindexed: Entity[];
}> {
	const entity = await getEntityById(entityId);
	if (!entity || entity.is_deleted) {
		return { deleted: null, reindexed: [] };
	}

	const deleted = await softDeleteEntity(entityId);
	const reindexed = await reindexRow(entity.type, entity.row);
	return { deleted, reindexed };
}

// Utility for callers that need to bulk-fetch entities by id (e.g. the
// store mirroring batch updates back into state).
export async function getEntitiesByIds(ids: string[]): Promise<Entity[]> {
	if (ids.length === 0) return [];
	const db = await getDrizzleDb();
	return await db.select().from(entities).where(inArray(entities.id, ids));
}
