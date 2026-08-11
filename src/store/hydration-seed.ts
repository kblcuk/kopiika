import type { BalanceSeedGroup, EntityWithBalance, Transaction } from '@/src/types';

/**
 * Two-phase hydration support (KII-144). Balance derivation is linear in
 * (from, to, amount) within each bucket, so pre-period confirmed history can
 * be collapsed into (from, to, currency) sums and fed through the existing
 * derivation as synthetic rows with identical results. Rows the derivation
 * inspects individually — current-period, unconfirmed, and series rows (whose
 * slot feeds virtual-occurrence dedup even when their timestamp was edited
 * across the period boundary) — stay real.
 */
const seedable = (t: Transaction, periodStart: number): boolean =>
	t.timestamp < periodStart && t.is_confirmed !== false && t.series_id == null;

/** JS reference implementation of the phase-1 split; the DB queries must match it. */
export function partitionForPhase1(
	all: Transaction[],
	periodStart: number
): { recent: Transaction[]; seedGroups: BalanceSeedGroup[] } {
	const recent: Transaction[] = [];
	const groups = new Map<string, BalanceSeedGroup>();
	for (const t of all) {
		if (!seedable(t, periodStart)) {
			recent.push(t);
			continue;
		}
		const key = `${t.from_entity_id}:${t.to_entity_id}:${t.currency}`;
		const group = groups.get(key);
		if (group) {
			group.total_minor += t.amount_minor;
		} else {
			groups.set(key, {
				from_entity_id: t.from_entity_id,
				to_entity_id: t.to_entity_id,
				currency: t.currency,
				total_minor: t.amount_minor,
			});
		}
	}
	return { recent, seedGroups: [...groups.values()] };
}

export function buildBalanceSeed(groups: BalanceSeedGroup[], periodStart: number): Transaction[] {
	return groups.map((g) => ({
		id: `__balance_seed__:${g.from_entity_id}:${g.to_entity_id}:${g.currency}`,
		from_entity_id: g.from_entity_id,
		to_entity_id: g.to_entity_id,
		amount_minor: g.total_minor,
		currency: g.currency,
		timestamp: periodStart - 1,
		note: null,
		is_confirmed: true,
	}));
}

/**
 * Value equality for derived balance lists. Used to keep the phase-2 swap
 * from recommitting the board: when the full array derives the same values
 * the seed did, the hook returns its previous (identity-stable) result.
 * Shallow-compares every own field so a changed entity attribute (name,
 * color) is never masked.
 */
export function isSameEntitiesWithBalance(a: EntityWithBalance[], b: EntityWithBalance[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const x = a[i]!;
		const y = b[i]!;
		if (x === y) continue;
		const keys = Object.keys(x) as (keyof EntityWithBalance)[];
		if (keys.length !== Object.keys(y).length) return false;
		for (const k of keys) {
			if (x[k] !== y[k]) return false;
		}
	}
	return true;
}
