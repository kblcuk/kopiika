import type { Entity, Transaction } from '@/src/types';

/**
 * Net reservation for a specific (account, saving) pair, derived from transactions.
 * Positive = money reserved; zero if more has been released than reserved.
 */
export function getReservationForPair(
	transactions: Transaction[],
	accountId: string,
	savingId: string
): number {
	let net = 0;
	for (const tx of transactions) {
		if (tx.from_entity_id === accountId && tx.to_entity_id === savingId) {
			net += tx.amount;
		} else if (tx.from_entity_id === savingId && tx.to_entity_id === accountId) {
			net -= tx.amount;
		}
	}
	return Math.max(0, net);
}

/**
 * Per-account breakdown of net reservations for a given saving.
 * Only returns entries with positive net amounts.
 */
export function getReservationsForSaving(
	transactions: Transaction[],
	entities: Entity[],
	savingId: string
): { accountEntityId: string; amount: number }[] {
	const accountIds = new Set(entities.filter((e) => e.type === 'account').map((e) => e.id));
	const perAccount = new Map<string, number>();

	for (const tx of transactions) {
		if (tx.to_entity_id === savingId && accountIds.has(tx.from_entity_id)) {
			perAccount.set(tx.from_entity_id, (perAccount.get(tx.from_entity_id) ?? 0) + tx.amount);
		} else if (tx.from_entity_id === savingId && accountIds.has(tx.to_entity_id)) {
			perAccount.set(tx.to_entity_id, (perAccount.get(tx.to_entity_id) ?? 0) - tx.amount);
		}
	}

	return Array.from(perAccount.entries())
		.filter(([, amount]) => amount > 0)
		.map(([accountEntityId, amount]) => ({ accountEntityId, amount }));
}

/**
 * Per-saving breakdown of net reservations for a given account.
 * Only returns entries with positive net amounts.
 */
export function getReservationsForAccount(
	transactions: Transaction[],
	entities: Entity[],
	accountId: string
): { savingEntityId: string; amount: number }[] {
	const savingIds = new Set(entities.filter((e) => e.type === 'saving').map((e) => e.id));
	const perSaving = new Map<string, number>();

	for (const tx of transactions) {
		if (tx.from_entity_id === accountId && savingIds.has(tx.to_entity_id)) {
			perSaving.set(tx.to_entity_id, (perSaving.get(tx.to_entity_id) ?? 0) + tx.amount);
		} else if (tx.to_entity_id === accountId && savingIds.has(tx.from_entity_id)) {
			perSaving.set(tx.from_entity_id, (perSaving.get(tx.from_entity_id) ?? 0) - tx.amount);
		}
	}

	return Array.from(perSaving.entries())
		.filter(([, amount]) => amount > 0)
		.map(([savingEntityId, amount]) => ({ savingEntityId, amount }));
}

/**
 * Total amount reserved on an account across all savings.
 */
export function getTotalReservedForAccount(
	transactions: Transaction[],
	entities: Entity[],
	accountId: string
): number {
	return getReservationsForAccount(transactions, entities, accountId).reduce(
		(sum, r) => sum + r.amount,
		0
	);
}
