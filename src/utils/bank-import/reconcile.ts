import type { Transaction } from '@/src/types';
import type { ParsedBankRow, ReconciledRow } from './types';

function civilDay(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Signed effect of a transaction on `accountId`: +credit (money in), -debit. */
function accountEffect(txn: Transaction, accountId: string): number | null {
	if (txn.to_entity_id === accountId) return txn.amount_minor; // inflow
	if (txn.from_entity_id === accountId) return -txn.amount_minor; // outflow
	return null;
}

export function reconcile(
	rows: ParsedBankRow[],
	existingAccountTxns: Transaction[],
	accountId: string
): ReconciledRow[] {
	// Bucket existing txns by "day|effect" for greedy 1:1 consumption.
	const buckets = new Map<string, number>();
	for (const txn of existingAccountTxns) {
		const effect = accountEffect(txn, accountId);
		if (effect === null) continue;
		const key = `${civilDay(txn.timestamp)}|${effect}`;
		buckets.set(key, (buckets.get(key) ?? 0) + 1);
	}

	return rows.map((parsed) => {
		const key = `${civilDay(parsed.dateMs)}|${parsed.amountMinor}`;
		const available = buckets.get(key) ?? 0;
		const isDuplicate = available > 0;
		if (isDuplicate) buckets.set(key, available - 1);
		return {
			parsed,
			status: isDuplicate ? 'duplicate' : 'new',
			selected: !isDuplicate,
			assignment: null,
		};
	});
}
