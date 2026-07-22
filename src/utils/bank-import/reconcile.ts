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

/** The entity on the far side of `accountId` — a split leg's category. */
function counterparty(txn: Transaction, accountId: string): string {
	return txn.to_entity_id === accountId ? txn.from_entity_id : txn.to_entity_id;
}

/** One matchable unit after split-folding: a day + a signed account effect. */
interface BucketEntry {
	day: string;
	effect: number;
}

/**
 * Turn the existing account transactions into matchable entries, folding each
 * genuine split into a single summed entry.
 *
 * A split is stored as N independent rows sharing an identical `timestamp` and
 * `note` but distributing one charge across distinct categories (see
 * `buildSplitRows`). The bank only ever reports the original total, never the
 * legs — so a folded total matches the statement line while the individual legs
 * never do.
 *
 * A "genuine split" is ≥2 same-direction rows sharing timestamp+note whose
 * counterparty categories are pairwise-distinct. That distinct-category guard is
 * load-bearing: imported rows all land on midnight (`parseFlexibleDate` drops
 * the time) with `note = description`, so two legitimately-separate identical
 * charges share the same timestamp+note. Folding those would merge them and
 * break dedup on re-import; requiring distinct categories tells a real split
 * apart from duplicate charges. Everything else stays one entry per row, exactly
 * as before.
 *
 * The guard is deliberately conservative, so some real splits aren't folded and
 * their total line falls back to `new`: (a) a split with a repeated category
 * (e.g. two legs both "groceries" — the set is smaller than the member count),
 * and (b) a split that coincidentally shares timestamp+note with an unrelated
 * charge. Both are safe (a reviewable extra row, never a false positive), and
 * match the spec's "when uncertain, prefer `new`" stance — we'd rather miss a
 * fold than silently hide a genuinely-new transaction.
 */
function toBucketEntries(existingAccountTxns: Transaction[], accountId: string): BucketEntry[] {
	interface Member {
		day: string;
		effect: number;
		category: string;
	}
	const groups = new Map<string, Member[]>();
	for (const txn of existingAccountTxns) {
		const effect = accountEffect(txn, accountId);
		if (effect === null) continue;
		const sig = `${txn.timestamp}|${txn.note ?? ''}`;
		const member: Member = {
			day: civilDay(txn.timestamp),
			effect,
			category: counterparty(txn, accountId),
		};
		const members = groups.get(sig);
		if (members) members.push(member);
		else groups.set(sig, [member]);
	}

	const entries: BucketEntry[] = [];
	for (const members of groups.values()) {
		const sameDirection = members.every(
			(m) => Math.sign(m.effect) === Math.sign(members[0]!.effect)
		);
		const distinctCategories = new Set(members.map((m) => m.category)).size === members.length;
		const isSplit = members.length >= 2 && sameDirection && distinctCategories;
		if (isSplit) {
			const total = members.reduce((sum, m) => sum + m.effect, 0);
			entries.push({ day: members[0]!.day, effect: total });
		} else {
			for (const m of members) entries.push({ day: m.day, effect: m.effect });
		}
	}
	return entries;
}

export function reconcile(
	rows: ParsedBankRow[],
	existingAccountTxns: Transaction[],
	accountId: string
): ReconciledRow[] {
	// Fold genuine splits into their totals, then bucket by "day|effect" for
	// greedy 1:1 consumption.
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
