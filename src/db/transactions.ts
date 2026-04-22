import { eq, and, between, or, desc, sum, inArray, gte } from 'drizzle-orm';
import type { Transaction } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { transactions } from './drizzle-schema';

export async function getAllTransactions(): Promise<Transaction[]> {
	const db = await getDrizzleDb();
	return await db.select().from(transactions).orderBy(desc(transactions.timestamp));
}

export async function getTransactionsByPeriod(
	startTimestamp: number,
	endTimestamp: number
): Promise<Transaction[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(transactions)
		.where(between(transactions.timestamp, startTimestamp, endTimestamp))
		.orderBy(desc(transactions.timestamp));
}

export async function getTransactionsForEntity(
	entityId: string,
	startTimestamp?: number,
	endTimestamp?: number
): Promise<Transaction[]> {
	const db = await getDrizzleDb();

	const entityCondition = or(
		eq(transactions.from_entity_id, entityId),
		eq(transactions.to_entity_id, entityId)
	);

	if (startTimestamp !== undefined && endTimestamp !== undefined) {
		return await db
			.select()
			.from(transactions)
			.where(
				and(entityCondition, between(transactions.timestamp, startTimestamp, endTimestamp))
			)
			.orderBy(desc(transactions.timestamp));
	}

	return await db
		.select()
		.from(transactions)
		.where(entityCondition)
		.orderBy(desc(transactions.timestamp));
}

export async function getTransactionsBetweenEntities(
	fromEntityId: string,
	toEntityId: string
): Promise<Transaction[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(transactions)
		.where(
			and(
				eq(transactions.from_entity_id, fromEntityId),
				eq(transactions.to_entity_id, toEntityId)
			)
		)
		.orderBy(desc(transactions.timestamp));
}

export async function createTransaction(transaction: Transaction): Promise<void> {
	const db = await getDrizzleDb();
	await db.insert(transactions).values({
		id: transaction.id,
		from_entity_id: transaction.from_entity_id,
		to_entity_id: transaction.to_entity_id,
		amount: transaction.amount,
		currency: transaction.currency,
		timestamp: transaction.timestamp,
		note: transaction.note ?? null,
		series_id: transaction.series_id ?? null,
		is_confirmed: transaction.is_confirmed ?? true,
	});
}

export async function deleteTransaction(id: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(transactions).where(eq(transactions.id, id));
}

export async function updateTransaction(
	id: string,
	updates: Omit<Partial<Transaction>, 'id'>
): Promise<void> {
	const db = await getDrizzleDb();

	// Purge undefined values from updates
	const updateData: Partial<typeof transactions.$inferInsert> = Object.fromEntries(
		Object.entries(updates).filter(([, value]) => value !== undefined)
	);

	if (Object.keys(updateData).length > 0) {
		await db.update(transactions).set(updateData).where(eq(transactions.id, id));
	}
}

export async function getBatchEntityActuals(
	entityIds: string[],
	startTimestamp: number,
	endTimestamp: number
): Promise<Map<string, number>> {
	if (entityIds.length === 0) {
		return new Map();
	}

	const db = await getDrizzleDb();

	// Money coming INTO entities (to_entity_id in entityIds)
	const inflowResults = await db
		.select({
			entity_id: transactions.to_entity_id,
			total: sum(transactions.amount),
		})
		.from(transactions)
		.where(
			and(
				inArray(transactions.to_entity_id, entityIds),
				between(transactions.timestamp, startTimestamp, endTimestamp)
			)
		)
		.groupBy(transactions.to_entity_id);

	// Money going OUT of entities (from_entity_id in entityIds)
	const outflowResults = await db
		.select({
			entity_id: transactions.from_entity_id,
			total: sum(transactions.amount),
		})
		.from(transactions)
		.where(
			and(
				inArray(transactions.from_entity_id, entityIds),
				between(transactions.timestamp, startTimestamp, endTimestamp)
			)
		)
		.groupBy(transactions.from_entity_id);

	// Build maps for quick lookup
	const inflowMap = new Map<string, number>();
	for (const row of inflowResults) {
		inflowMap.set(row.entity_id, Number(row.total ?? 0));
	}

	const outflowMap = new Map<string, number>();
	for (const row of outflowResults) {
		outflowMap.set(row.entity_id, Number(row.total ?? 0));
	}

	// Calculate actual for each entity (inflow - outflow)
	const results = new Map<string, number>();
	for (const entityId of entityIds) {
		const inflow = inflowMap.get(entityId) ?? 0;
		const outflow = outflowMap.get(entityId) ?? 0;
		results.set(entityId, inflow - outflow);
	}

	return results;
}

export async function getEntityActual(
	entityId: string,
	startTimestamp: number,
	endTimestamp: number
): Promise<number> {
	const results = await getBatchEntityActuals([entityId], startTimestamp, endTimestamp);
	return results.get(entityId) ?? 0;
}

export async function getTransactionsBySeriesId(seriesId: string): Promise<Transaction[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(transactions)
		.where(eq(transactions.series_id, seriesId))
		.orderBy(transactions.timestamp);
}

export async function deleteTransactionsBySeriesFuture(
	seriesId: string,
	fromTimestamp: number
): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.delete(transactions)
		.where(
			and(eq(transactions.series_id, seriesId), gte(transactions.timestamp, fromTimestamp))
		);
}

export async function updateTransactionsBySeriesFuture(
	seriesId: string,
	fromTimestamp: number,
	updates: Omit<Partial<Transaction>, 'id'>
): Promise<void> {
	const db = await getDrizzleDb();
	const updateData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) updateData[key] = value;
	}
	if (Object.keys(updateData).length > 0) {
		await db
			.update(transactions)
			.set(updateData)
			.where(
				and(
					eq(transactions.series_id, seriesId),
					gte(transactions.timestamp, fromTimestamp)
				)
			);
	}
}

export async function createTransactionBatch(txns: Transaction[]): Promise<void> {
	if (txns.length === 0) return;
	const db = await getDrizzleDb();
	db.transaction((tx) => {
		for (const txn of txns) {
			tx.insert(transactions)
				.values({
					id: txn.id,
					from_entity_id: txn.from_entity_id,
					to_entity_id: txn.to_entity_id,
					amount: txn.amount,
					currency: txn.currency,
					timestamp: txn.timestamp,
					note: txn.note ?? null,
					series_id: txn.series_id ?? null,
					is_confirmed: txn.is_confirmed ?? true,
					notification_id: txn.notification_id ?? null,
				})
				.run();
		}
	});
}

export async function confirmTransaction(id: string): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.update(transactions)
		.set({ is_confirmed: true, notification_id: null })
		.where(eq(transactions.id, id));
}

export async function confirmTransactionsBatch(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	const db = await getDrizzleDb();
	await db
		.update(transactions)
		.set({ is_confirmed: true, notification_id: null })
		.where(inArray(transactions.id, ids));
}

export async function updateTransactionNotificationId(
	id: string,
	notificationId: string | null
): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.update(transactions)
		.set({ notification_id: notificationId })
		.where(eq(transactions.id, id));
}

export async function updateTransactionNotificationIdsBatch(
	updates: { id: string; notificationId: string }[]
): Promise<void> {
	if (updates.length === 0) return;
	const db = await getDrizzleDb();
	for (const { id, notificationId } of updates) {
		await db
			.update(transactions)
			.set({ notification_id: notificationId })
			.where(eq(transactions.id, id));
	}
}
