import { eq, and, between, or, desc, sum, inArray, gte } from 'drizzle-orm';
import type { Transaction } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { transactions, recurrenceTemplates, recurrenceExclusions } from './drizzle-schema';

/**
 * Shape used by `update*` helpers. Forbidding `id`, `created_at`, and
 * `updated_at` at the type level (KII-126) prevents a spread-style caller
 * from accidentally rewriting write-time metadata. `updated_at` is owned
 * by the helper; `created_at` must never change after insert.
 */
export type TransactionUpdate = Omit<Partial<Transaction>, 'id' | 'created_at' | 'updated_at'>;

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

export async function createTransaction(transaction: Transaction): Promise<Transaction> {
	const db = await getDrizzleDb();
	const now = Date.now();
	const [row] = await db
		.insert(transactions)
		.values({
			id: transaction.id,
			from_entity_id: transaction.from_entity_id,
			to_entity_id: transaction.to_entity_id,
			amount: transaction.amount,
			currency: transaction.currency,
			timestamp: transaction.timestamp,
			note: transaction.note ?? null,
			series_id: transaction.series_id ?? null,
			is_confirmed: transaction.is_confirmed ?? true,
			created_at: transaction.created_at ?? now,
			updated_at: transaction.updated_at ?? now,
		})
		.returning();
	return row!;
}

export async function deleteTransaction(
	id: string,
	options?: { seriesExclusion?: { templateId: string; timestamp: number } }
): Promise<void> {
	const db = await getDrizzleDb();

	if (!options?.seriesExclusion) {
		await db.delete(transactions).where(eq(transactions.id, id));
		return;
	}

	// KII-123: When deleting one occurrence of a recurring series, the delete
	// AND the exclusion insert must be atomic. Two separate awaited calls
	// would let a crash between them strand state — transaction row gone,
	// exclusion never written — and the next `backfillRecurrences` would
	// silently resurrect the occurrence.
	const { templateId, timestamp } = options.seriesExclusion;
	await db.transaction((tx) => {
		tx.delete(transactions).where(eq(transactions.id, id)).run();
		// Mirrors replaceTransactionAtomic: verify the template exists so a
		// missing FK target produces a specific error rather than a raw
		// constraint failure on the INSERT.
		const existing = tx
			.select({ id: recurrenceTemplates.id })
			.from(recurrenceTemplates)
			.where(eq(recurrenceTemplates.id, templateId))
			.all();
		if (existing.length === 0) {
			throw new Error(`deleteTransaction: recurrence template ${templateId} not found`);
		}
		tx.insert(recurrenceExclusions)
			.values({ template_id: templateId, timestamp })
			.onConflictDoNothing()
			.run();
	});
}

export async function updateTransaction(
	id: string,
	updates: TransactionUpdate
): Promise<Transaction | null> {
	const db = await getDrizzleDb();

	const updateData: Partial<typeof transactions.$inferInsert> = {};
	for (const [key, value] of Object.entries(updates)) {
		if (value === undefined) continue;
		// Belt-and-suspenders against `any`-typed callers bypassing the type
		// guard (KII-126).
		if (key === 'created_at' || key === 'updated_at' || key === 'id') continue;
		(updateData as Record<string, unknown>)[key] = value;
	}

	if (Object.keys(updateData).length === 0) return null;

	updateData.updated_at = Date.now();
	const [row] = await db
		.update(transactions)
		.set(updateData)
		.where(eq(transactions.id, id))
		.returning();
	return row ?? null;
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
	updates: TransactionUpdate
): Promise<Transaction[]> {
	const db = await getDrizzleDb();
	const updateData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(updates)) {
		if (value === undefined) continue;
		if (key === 'created_at' || key === 'updated_at' || key === 'id') continue;
		updateData[key] = value;
	}
	if (Object.keys(updateData).length === 0) return [];
	updateData.updated_at = Date.now();
	return await db
		.update(transactions)
		.set(updateData)
		.where(
			and(eq(transactions.series_id, seriesId), gte(transactions.timestamp, fromTimestamp))
		)
		.returning();
}

export async function createTransactionBatch(txns: Transaction[]): Promise<Transaction[]> {
	if (txns.length === 0) return [];
	const db = await getDrizzleDb();
	const now = Date.now();
	return await db.transaction((tx) => {
		const rows: Transaction[] = [];
		for (const txn of txns) {
			const [row] = tx
				.insert(transactions)
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
					created_at: txn.created_at ?? now,
					updated_at: txn.updated_at ?? now,
				})
				.returning()
				.all();
			if (row) rows.push(row);
		}
		return rows;
	});
}

export async function confirmTransaction(id: string): Promise<Transaction | null> {
	const db = await getDrizzleDb();
	const [row] = await db
		.update(transactions)
		.set({ is_confirmed: true, notification_id: null, updated_at: Date.now() })
		.where(eq(transactions.id, id))
		.returning();
	return row ?? null;
}

export async function confirmTransactionsBatch(ids: string[]): Promise<Transaction[]> {
	if (ids.length === 0) return [];
	const db = await getDrizzleDb();
	return await db
		.update(transactions)
		.set({ is_confirmed: true, notification_id: null, updated_at: Date.now() })
		.where(inArray(transactions.id, ids))
		.returning();
}

export async function updateTransactionNotificationId(
	id: string,
	notificationId: string | null
): Promise<Transaction | null> {
	const db = await getDrizzleDb();
	const [row] = await db
		.update(transactions)
		.set({ notification_id: notificationId, updated_at: Date.now() })
		.where(eq(transactions.id, id))
		.returning();
	return row ?? null;
}

// KII-132: N awaited round-trips, no transaction wrap. Replace with a
// `CASE`-based bulk UPDATE or wrap the loop in `db.transaction(...)` so all
// rows commit atomically.
export async function updateTransactionNotificationIdsBatch(
	updates: { id: string; notificationId: string | null }[]
): Promise<Transaction[]> {
	if (updates.length === 0) return [];
	const db = await getDrizzleDb();
	const now = Date.now();
	const rows: Transaction[] = [];
	for (const { id, notificationId } of updates) {
		const [row] = await db
			.update(transactions)
			.set({ notification_id: notificationId, updated_at: now })
			.where(eq(transactions.id, id))
			.returning();
		if (row) rows.push(row);
	}
	return rows;
}

export async function replaceTransactionAtomic(
	idToDelete: string,
	txns: Transaction[],
	options?: { seriesExclusion?: { templateId: string; timestamp: number } }
): Promise<Transaction[]> {
	const db = await getDrizzleDb();
	const now = Date.now();
	return await db.transaction((tx) => {
		tx.delete(transactions).where(eq(transactions.id, idToDelete)).run();

		if (options?.seriesExclusion) {
			const { templateId, timestamp } = options.seriesExclusion;
			// Verify the template still exists so a missing FK target triggers a
			// rollback here rather than as a constraint error on the INSERT —
			// keeps the error message specific (KII-123).
			const existingTemplate = tx
				.select({ id: recurrenceTemplates.id })
				.from(recurrenceTemplates)
				.where(eq(recurrenceTemplates.id, templateId))
				.all();
			if (existingTemplate.length === 0) {
				throw new Error(
					`replaceTransactionAtomic: recurrence template ${templateId} not found`
				);
			}
			// Single INSERT, idempotent via the composite PK — no read-modify-write
			// race with concurrent confirm/delete flows (KII-123).
			tx.insert(recurrenceExclusions)
				.values({ template_id: templateId, timestamp })
				.onConflictDoNothing()
				.run();
		}

		const inserted: Transaction[] = [];
		for (const txn of txns) {
			const [row] = tx
				.insert(transactions)
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
					created_at: txn.created_at ?? now,
					updated_at: txn.updated_at ?? now,
				})
				.returning()
				.all();
			if (row) inserted.push(row);
		}
		return inserted;
	});
}
