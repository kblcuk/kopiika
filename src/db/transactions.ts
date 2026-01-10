import type { Transaction } from '@/src/types';
import { getDatabase } from './schema';

export async function getAllTransactions(): Promise<Transaction[]> {
	const db = await getDatabase();
	const result = await db.getAllAsync<Transaction>(
		'SELECT * FROM transactions ORDER BY timestamp DESC'
	);
	return result;
}

export async function getTransactionsByPeriod(
	startTimestamp: number,
	endTimestamp: number
): Promise<Transaction[]> {
	const db = await getDatabase();
	const result = await db.getAllAsync<Transaction>(
		'SELECT * FROM transactions WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
		[startTimestamp, endTimestamp]
	);
	return result;
}

export async function getTransactionsForEntity(
	entityId: string,
	startTimestamp?: number,
	endTimestamp?: number
): Promise<Transaction[]> {
	const db = await getDatabase();

	if (startTimestamp !== undefined && endTimestamp !== undefined) {
		const result = await db.getAllAsync<Transaction>(
			`SELECT * FROM transactions
			 WHERE (from_entity_id = ? OR to_entity_id = ?)
			 AND timestamp >= ? AND timestamp <= ?
			 ORDER BY timestamp DESC`,
			[entityId, entityId, startTimestamp, endTimestamp]
		);
		return result;
	}

	const result = await db.getAllAsync<Transaction>(
		`SELECT * FROM transactions
		 WHERE from_entity_id = ? OR to_entity_id = ?
		 ORDER BY timestamp DESC`,
		[entityId, entityId]
	);
	return result;
}

export async function createTransaction(transaction: Transaction): Promise<void> {
	const db = await getDatabase();
	await db.runAsync(
		`INSERT INTO transactions (id, from_entity_id, to_entity_id, amount, currency, timestamp, note)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			transaction.id,
			transaction.from_entity_id,
			transaction.to_entity_id,
			transaction.amount,
			transaction.currency,
			transaction.timestamp,
			transaction.note ?? null,
		]
	);
}

export async function deleteTransaction(id: string): Promise<void> {
	const db = await getDatabase();
	await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

export async function updateTransaction(
	id: string,
	updates: { amount?: number; note?: string; timestamp?: number }
): Promise<void> {
	const db = await getDatabase();
	const fields: string[] = [];
	const values: (number | string | null)[] = [];

	if (updates.amount !== undefined) {
		fields.push('amount = ?');
		values.push(updates.amount);
	}
	if (updates.note !== undefined) {
		fields.push('note = ?');
		values.push(updates.note || null);
	}
	if (updates.timestamp !== undefined) {
		fields.push('timestamp = ?');
		values.push(updates.timestamp);
	}

	if (fields.length === 0) return;

	values.push(id);
	await db.runAsync(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`, values);
}

// Calculate actual spent/received for an entity in a period
export async function getEntityActual(
	entityId: string,
	startTimestamp: number,
	endTimestamp: number
): Promise<number> {
	const db = await getDatabase();

	// Money coming INTO this entity (to_entity_id = entityId)
	const inflow = await db.getFirstAsync<{ total: number | null }>(
		`SELECT SUM(amount) as total FROM transactions
		 WHERE to_entity_id = ? AND timestamp >= ? AND timestamp <= ?`,
		[entityId, startTimestamp, endTimestamp]
	);

	// Money going OUT of this entity (from_entity_id = entityId)
	const outflow = await db.getFirstAsync<{ total: number | null }>(
		`SELECT SUM(amount) as total FROM transactions
		 WHERE from_entity_id = ? AND timestamp >= ? AND timestamp <= ?`,
		[entityId, startTimestamp, endTimestamp]
	);

	// For categories/savings: actual = inflow (money received)
	// For accounts: actual = inflow - outflow (balance change)
	// For income: actual = outflow (money distributed)
	return (inflow?.total ?? 0) - (outflow?.total ?? 0);
}
