import type { Transaction } from '@/src/types';

const MAX_SCHEDULED = 60; // iOS allows 64; keep buffer for other notifications

/**
 * Returns future unconfirmed transactions that need a notification scheduled.
 * Past-due transactions (timestamp <= now) are intentionally excluded — the in-app
 * badge and background task handle those. Notifications target the moment a
 * transaction becomes due, not after the fact.
 */
export function getNotifiableTransactions(transactions: Transaction[], now: number): Transaction[] {
	return transactions
		.filter((t) => t.is_confirmed === false && t.timestamp > now && !t.notification_id)
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(0, MAX_SCHEDULED);
}
