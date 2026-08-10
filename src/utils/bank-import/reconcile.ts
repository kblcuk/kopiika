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

/** One matchable unit after split-folding: a day + a signed account effect. */
interface BucketEntry {
	day: string;
	effect: number;
}

/**
 * Turn the existing account transactions into matchable entries, folding each
 * split into a single summed entry.
 *
 * A split is stored as N rows sharing a `split_id`, one per category (see
 * `buildSplitRows`), but the bank only ever reports the original total — so
 * the folded total matches the statement line while the individual legs never
 * do. Rows with no `split_id` are standalone and yield one entry each.
 *
 * Rows predating KII-146 were stamped by migration 0024, which applied the
 * heuristic this used to run inline. Groups it declined (a repeated category,
 * or a coincidental timestamp+note collision) stay unstamped, so their total
 * surfaces as `new` — a reviewable extra row, never a false positive, matching
 * reconciliation's "when uncertain, prefer `new`" stance.
 */
function toBucketEntries(existingAccountTxns: Transaction[], accountId: string): BucketEntry[] {
	const entries: BucketEntry[] = [];
	const splits = new Map<string, BucketEntry>();

	for (const txn of existingAccountTxns) {
		const effect = accountEffect(txn, accountId);
		if (effect === null) continue;
		const day = civilDay(txn.timestamp);
		if (!txn.split_id) {
			entries.push({ day, effect });
			continue;
		}
		// Legs share one account and timestamp at creation time; nothing
		// enforces it afterwards, since `updateTransaction` writes only the
		// keys it is given and so a per-leg date edit leaves `split_id` intact.
		// A group straddling two civil days is keyed on its first-seen leg —
		// and reads are ordered by timestamp DESC, so that is the latest leg.
		// The bank's line for the original date then surfaces as `new`, which
		// is the safe direction.
		const group = splits.get(txn.split_id);
		if (group) group.effect += effect;
		else splits.set(txn.split_id, { day, effect });
	}

	return [...entries, ...splits.values()];
}

export function reconcile(
	rows: ParsedBankRow[],
	existingAccountTxns: Transaction[],
	accountId: string
): ReconciledRow[] {
	// Fold each `split_id` group into its total, then bucket by "day|effect"
	// for greedy 1:1 consumption.
	const buckets = new Map<string, number>();
	for (const entry of toBucketEntries(existingAccountTxns, accountId)) {
		const key = `${entry.day}|${entry.effect}`;
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
