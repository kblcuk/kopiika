import type { Transaction } from '@/src/types';
import type { ParsedBankRow, ReconciledRow } from './types';

const MS_PER_DAY = 86_400_000;

/**
 * Banks post a charge 1-3 days after the day a recurring template (or a
 * manual entry) is dated for — later for standing orders/direct debits,
 * sometimes *earlier* for Revolut, whose export dates a card charge to the
 * statement's start date rather than its execution date. Confirmed real
 * cases drift up to 2 days either direction, so match within a symmetric
 * window instead of requiring the exact same civil day.
 */
const DATE_WINDOW_DAYS = 3;

/**
 * Recurring charges drift in AMOUNT from one occurrence to the next —
 * mortgage-interest portions and FX-converted subscriptions both confirmed
 * (594.16→593.86, 0.05%; 26.09→25.90, 0.73%; 17.09→17.29, 1.17%) — so those
 * get a relative tolerance. One-off purchases do NOT: amount drift is a
 * property of a recurring series re-billing, not of a card swipe, and
 * loosening the match for them hides real, distinct transactions instead of
 * catching a genuine duplicate. Confirmed by replaying this against a real
 * user's full statement: an absolute floor plus percentage (this module's
 * first version) silently matched five distinct same-week purchases at
 * this user's typical 1-15 EUR spend (13.90↔13.50, 5.98↔6.00, ...) as
 * `duplicate`, inverting the "when uncertain, prefer `new`" stance — the
 * whole point of reconciliation is that a missed duplicate is visible (an
 * extra reviewable row) while a wrongly-hidden purchase is invisible.
 * `series_id` is exactly the signal for "this is a recurring template's
 * occurrence, not a one-off": only entries carrying it get the tolerance.
 */
const AMOUNT_REL_TOLERANCE = 0.02; // 2%, recurring entries only

/**
 * Local-calendar-day index of a timestamp, for date-window arithmetic.
 * `Date.UTC` is applied to the LOCAL y/m/d components (not `timestamp`
 * itself) purely to get a DST-proof integer day count — the identity this
 * produces is still the local civil day, same convention as
 * `toCivilDate` in `src/utils/recurrence.ts`.
 */
function civilDayIndex(ms: number): number {
	const d = new Date(ms);
	return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
}

/** Signed effect of a transaction on `accountId`: +credit (money in), -debit. */
function accountEffect(txn: Transaction, accountId: string): number | null {
	if (txn.to_entity_id === accountId) return txn.amount_minor; // inflow
	if (txn.from_entity_id === accountId) return -txn.amount_minor; // outflow
	return null;
}

/** One matchable unit after split-folding: a civil-day index + a signed account effect. */
interface BucketEntry {
	dayIndex: number;
	effect: number;
	/** True if any leg folded into this entry belongs to a recurring series (`series_id` set). */
	isRecurring: boolean;
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
		const dayIndex = civilDayIndex(txn.timestamp);
		const isRecurring = !!txn.series_id;
		if (!txn.split_id) {
			entries.push({ dayIndex, effect, isRecurring });
			continue;
		}
		// Legs share one account and timestamp at creation time; nothing
		// enforces it afterwards, since `updateTransaction` writes only the
		// keys it is given and so a per-leg date edit leaves `split_id` intact.
		// A group straddling two civil days is keyed on whichever leg this loop
		// reaches first, which depends on the caller's ordering. Either way the
		// folded total lands on a day the bank's line for the original charge
		// will not match, so that line surfaces as `new` — the safe direction.
		// A split and a recurring series are not known to co-occur in practice,
		// but if a leg ever did carry `series_id` the group tolerates the 2%
		// drift rather than silently losing that signal.
		const group = splits.get(txn.split_id);
		if (group) {
			group.effect += effect;
			group.isRecurring = group.isRecurring || isRecurring;
		} else {
			splits.set(txn.split_id, { dayIndex, effect, isRecurring });
		}
	}

	return [...entries, ...splits.values()];
}

/**
 * Tolerance for two amounts (minor units) to count as "the same charge".
 * Zero for a one-off entry — a bank row must match a non-recurring existing
 * transaction exactly, or it stays `new`. Only a recurring entry (`series_id`
 * set) gets the 2% relative allowance, since amount drift is a property of a
 * series re-billing, not of an ordinary purchase.
 */
function amountTolerance(isRecurring: boolean, a: number, b: number): number {
	return isRecurring ? AMOUNT_REL_TOLERANCE * Math.max(Math.abs(a), Math.abs(b)) : 0;
}

/** A bucket entry still available to match, with a remaining consume count
 * (several folded entries can share one civil day + effect, e.g. two
 * identical splits on the same day — see `toBucketEntries`'s doc comment). */
interface Candidate extends BucketEntry {
	remaining: number;
}

export function reconcile(
	rows: ParsedBankRow[],
	existingAccountTxns: Transaction[],
	accountId: string
): ReconciledRow[] {
	// Fold each `split_id` group into its total. Entries sharing a civil day
	// and effect are merged into one candidate with a `remaining` count, so
	// greedy 1:1 consumption below still works.
	const candidates: Candidate[] = [];
	for (const entry of toBucketEntries(existingAccountTxns, accountId)) {
		const existing = candidates.find(
			(c) =>
				c.dayIndex === entry.dayIndex &&
				c.effect === entry.effect &&
				c.isRecurring === entry.isRecurring
		);
		if (existing) existing.remaining += 1;
		else candidates.push({ ...entry, remaining: 1 });
	}

	// Match in two passes. The fuzzy search below consumes the nearest
	// available candidate for one row at a time, which makes it dependent on
	// statement order: a row whose match is merely *near* would otherwise take
	// the candidate that a later row matches on the nose, leaving that later
	// row to import a second copy of a charge already on file — both halves of
	// the wrong answer at once. Settling every exact same-day, same-amount
	// pairing first removes that, since an exact match is unambiguous and can
	// never be a better fit for some other row. Rows left over are genuinely
	// approximate, and the order they resolve in no longer costs an exact
	// pairing elsewhere; a full bipartite assignment would buy nothing beyond
	// that for the statement sizes this runs on.
	const pending = rows.map((parsed) => ({
		parsed,
		dayIndex: civilDayIndex(parsed.dateMs),
		matched: false,
	}));

	for (const row of pending) {
		const exact = candidates.find(
			(c) =>
				c.remaining > 0 &&
				c.dayIndex === row.dayIndex &&
				c.effect === row.parsed.amountMinor
		);
		if (!exact) continue;
		exact.remaining -= 1;
		row.matched = true;
	}

	for (const row of pending) {
		if (row.matched) continue;

		// Prefer the closest date, then the closest amount, over the first
		// candidate found: a ±3-day window means several qualifying candidates
		// can exist at once (e.g. this user's many identical 14.70/13.50/2.00
		// rows on consecutive days), and picking anything but the nearest one
		// would let a same-amount charge from a different day steal the slot
		// that actually belongs to today's row.
		let best: Candidate | null = null;
		let bestDayDiff = Infinity;
		let bestAmountDiff = Infinity;
		for (const candidate of candidates) {
			if (candidate.remaining <= 0) continue;
			const dayDiff = Math.abs(candidate.dayIndex - row.dayIndex);
			if (dayDiff > DATE_WINDOW_DAYS) continue;
			const amountDiff = Math.abs(candidate.effect - row.parsed.amountMinor);
			if (
				amountDiff >
				amountTolerance(candidate.isRecurring, candidate.effect, row.parsed.amountMinor)
			)
				continue;
			if (dayDiff < bestDayDiff || (dayDiff === bestDayDiff && amountDiff < bestAmountDiff)) {
				best = candidate;
				bestDayDiff = dayDiff;
				bestAmountDiff = amountDiff;
			}
		}

		if (best) {
			best.remaining -= 1;
			row.matched = true;
		}
	}

	return pending.map(({ parsed, matched }) => ({
		parsed,
		status: matched ? ('duplicate' as const) : ('new' as const),
		selected: !matched,
		assignment: null,
	}));
}
