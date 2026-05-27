import { eq, desc } from 'drizzle-orm';
import type { MarketValueSnapshot } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { marketValueSnapshots } from './drizzle-schema';

/**
 * Update-input shape for partial updates. Forbidding `created_at`/`updated_at`
 * at the type level prevents accidental rewrite of write-time metadata (KII-126).
 */
export type MarketValueSnapshotUpdate = { amount?: number; date?: number };

export async function getAllMarketValueSnapshots(): Promise<MarketValueSnapshot[]> {
	const db = await getDrizzleDb();
	return db.select().from(marketValueSnapshots).orderBy(desc(marketValueSnapshots.date));
}

export async function getMarketValueSnapshots(entityId: string): Promise<MarketValueSnapshot[]> {
	const db = await getDrizzleDb();
	return db
		.select()
		.from(marketValueSnapshots)
		.where(eq(marketValueSnapshots.entity_id, entityId))
		.orderBy(desc(marketValueSnapshots.date));
}

export async function getLatestMarketValueSnapshot(
	entityId: string
): Promise<MarketValueSnapshot | null> {
	const db = await getDrizzleDb();
	const result = await db
		.select()
		.from(marketValueSnapshots)
		.where(eq(marketValueSnapshots.entity_id, entityId))
		.orderBy(desc(marketValueSnapshots.date))
		.limit(1);
	return result[0] ?? null;
}

export async function createMarketValueSnapshot(
	snapshot: MarketValueSnapshot
): Promise<MarketValueSnapshot> {
	const db = await getDrizzleDb();
	const now = Date.now();
	const [row] = await db
		.insert(marketValueSnapshots)
		.values({
			id: snapshot.id,
			entity_id: snapshot.entity_id,
			amount: snapshot.amount,
			currency: snapshot.currency,
			date: snapshot.date,
			created_at: snapshot.created_at ?? now,
			updated_at: snapshot.updated_at ?? now,
		})
		.returning();
	return row!;
}

export async function updateMarketValueSnapshot(
	id: string,
	updates: MarketValueSnapshotUpdate
): Promise<MarketValueSnapshot | null> {
	const db = await getDrizzleDb();
	const [row] = await db
		.update(marketValueSnapshots)
		.set({ ...updates, updated_at: Date.now() })
		.where(eq(marketValueSnapshots.id, id))
		.returning();
	return row ?? null;
}

export async function deleteMarketValueSnapshot(id: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(marketValueSnapshots).where(eq(marketValueSnapshots.id, id));
}

export async function deleteAllMarketValueSnapshots(entityId: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(marketValueSnapshots).where(eq(marketValueSnapshots.entity_id, entityId));
}
