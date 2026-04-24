import { eq, desc } from 'drizzle-orm';
import type { MarketValueSnapshot } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { marketValueSnapshots } from './drizzle-schema';

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

export async function createMarketValueSnapshot(snapshot: MarketValueSnapshot): Promise<void> {
	const db = await getDrizzleDb();
	await db.insert(marketValueSnapshots).values({
		id: snapshot.id,
		entity_id: snapshot.entity_id,
		amount: snapshot.amount,
		currency: snapshot.currency,
		date: snapshot.date,
	});
}

export async function updateMarketValueSnapshot(
	id: string,
	updates: { amount?: number; date?: number }
): Promise<void> {
	const db = await getDrizzleDb();
	await db.update(marketValueSnapshots).set(updates).where(eq(marketValueSnapshots.id, id));
}

export async function deleteMarketValueSnapshot(id: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(marketValueSnapshots).where(eq(marketValueSnapshots.id, id));
}

export async function deleteAllMarketValueSnapshots(entityId: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(marketValueSnapshots).where(eq(marketValueSnapshots.entity_id, entityId));
}
