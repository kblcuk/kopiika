import { eq, and, between, or, desc, sum } from 'drizzle-orm';
import type { Transaction } from '@/src/types';
import { getDrizzleDb } from './drizzle-client';
import { transactions } from './drizzle-schema';

export async function getAllTransactions(): Promise<Transaction[]> {
	const db = getDrizzleDb();
	return await db.select().from(transactions).orderBy(desc(transactions.timestamp));
}

export async function getTransactionsByPeriod(
	startTimestamp: number,
	endTimestamp: number
): Promise<Transaction[]> {
	const db = getDrizzleDb();
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
	const db = getDrizzleDb();

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

export async function createTransaction(transaction: Transaction): Promise<void> {
	const db = getDrizzleDb();
	await db.insert(transactions).values({
		id: transaction.id,
		from_entity_id: transaction.from_entity_id,
		to_entity_id: transaction.to_entity_id,
		amount: transaction.amount,
		currency: transaction.currency,
		timestamp: transaction.timestamp,
		note: transaction.note ?? null,
	});
}

export async function deleteTransaction(id: string): Promise<void> {
	const db = getDrizzleDb();
	await db.delete(transactions).where(eq(transactions.id, id));
}

export async function updateTransaction(
	id: string,
	updates: { amount?: number; note?: string; timestamp?: number }
): Promise<void> {
	const db = getDrizzleDb();

	// Build update object, filtering out undefined values
	const updateData: Partial<typeof transactions.$inferInsert> = {};
	if (updates.amount !== undefined) {
		updateData.amount = updates.amount;
	}
	if (updates.note !== undefined) {
		updateData.note = updates.note || null;
	}
	if (updates.timestamp !== undefined) {
		updateData.timestamp = updates.timestamp;
	}

	if (Object.keys(updateData).length > 0) {
		await db.update(transactions).set(updateData).where(eq(transactions.id, id));
	}
}

export async function getEntityActual(
	entityId: string,
	startTimestamp: number,
	endTimestamp: number
): Promise<number> {
	const db = getDrizzleDb();

	// Money coming INTO this entity (to_entity_id = entityId)
	const inflowResult = await db
		.select({ total: sum(transactions.amount) })
		.from(transactions)
		.where(
			and(
				eq(transactions.to_entity_id, entityId),
				between(transactions.timestamp, startTimestamp, endTimestamp)
			)
		);

	// Money going OUT of this entity (from_entity_id = entityId)
	const outflowResult = await db
		.select({ total: sum(transactions.amount) })
		.from(transactions)
		.where(
			and(
				eq(transactions.from_entity_id, entityId),
				between(transactions.timestamp, startTimestamp, endTimestamp)
			)
		);

	const inflow = Number(inflowResult[0]?.total ?? 0);
	const outflow = Number(outflowResult[0]?.total ?? 0);

	// For categories/savings: actual = inflow (money received)
	// For accounts: actual = inflow - outflow (balance change)
	// For income: actual = outflow (money distributed), which becomes negative
	return inflow - outflow;
}
