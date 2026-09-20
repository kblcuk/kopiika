import { describe, it, expect } from 'bun:test';
import { reconcile } from '../reconcile';
import type { ParsedBankRow } from '../types';
import type { Transaction } from '@/src/types';

const ACCT = 'acct-1';
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0).getTime();

function tx(over: Partial<Transaction>): Transaction {
	return {
		id: 't',
		from_entity_id: ACCT,
		to_entity_id: 'cat',
		amount_minor: 25000,
		currency: 'EUR',
		timestamp: day(2026, 7, 12),
		is_confirmed: true,
		...over,
	};
}

describe('reconcile', () => {
	it('marks a same-day same-amount outflow as duplicate', () => {
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 12), amountMinor: -25000, description: 'ATB' },
		];
		const result = reconcile(rows, [tx({ id: 'a' })], ACCT);
		expect(result[0]!.status).toBe('duplicate');
		expect(result[0]!.selected).toBe(false);
	});

	it('marks a row outside the ±3 day window as new even if amount matches', () => {
		// 5 days out is outside the window banks actually drift by — a real
		// distinct charge, not the same one posting late.
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 7), amountMinor: -25000, description: 'ATB' },
		];
		const result = reconcile(rows, [tx({ id: 'a', timestamp: day(2026, 7, 12) })], ACCT);
		expect(result[0]!.status).toBe('new');
		expect(result[0]!.selected).toBe(true);
	});

	it('matches a bank row posted 1-3 days after the template date (exact amount)', () => {
		// Confirmed real case: `Rehearsal rent` template 2026-07-30 vs bank
		// `MobilePay ...` 2026-07-31 — banks post recurring charges late.
		const rows: ParsedBankRow[] = [
			{
				rowIndex: 0,
				dateMs: day(2026, 7, 31),
				amountMinor: -25000,
				description: 'MobilePay',
			},
		];
		const result = reconcile(rows, [tx({ id: 'a', timestamp: day(2026, 7, 30) })], ACCT);
		expect(result[0]!.status).toBe('duplicate');
		expect(result[0]!.selected).toBe(false);
	});

	it('matches a bank row dated BEFORE the template date (Revolut statement-start dating)', () => {
		// Confirmed real case: `GitHub sponsorship` template dated on the
		// execution date, Revolut's export dated on the statement's start date
		// — one day earlier.
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 8, 10), amountMinor: -1709, description: 'Revolut' },
		];
		const result = reconcile(
			rows,
			[tx({ id: 'a', amount_minor: 1709, timestamp: day(2026, 8, 11) })],
			ACCT
		);
		expect(result[0]!.status).toBe('duplicate');
	});

	it('exactly 3 days out still matches; 4 days out does not (window boundary)', () => {
		const existing = tx({ id: 'a', timestamp: day(2026, 7, 1) });
		const within: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 4), amountMinor: -25000, description: 'ATB' },
		];
		const outside: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 5), amountMinor: -25000, description: 'ATB' },
		];
		expect(reconcile(within, [existing], ACCT)[0]!.status).toBe('duplicate');
		expect(reconcile(outside, [existing], ACCT)[0]!.status).toBe('new');
	});

	it('matches a recurring series charge whose amount drifted by a small absolute amount', () => {
		// Confirmed real case: `Apartment Loan` template 594.16 vs bank `Loan
		// repayment` 593.86 — the mortgage-interest portion changes monthly.
		// 0.30 drift on 594.16 is ~0.05%, comfortably under the 2% relative
		// tolerance — but that tolerance only applies because this template
		// has a `series_id`; the same drift would fail for a one-off row.
		const rows: ParsedBankRow[] = [
			{
				rowIndex: 0,
				dateMs: day(2026, 7, 12),
				amountMinor: -59386,
				description: 'Loan repayment',
			},
		];
		const result = reconcile(
			rows,
			[tx({ id: 'a', amount_minor: 59416, series_id: 'series-loan' })],
			ACCT
		);
		expect(result[0]!.status).toBe('duplicate');
	});

	it('matches an FX-varying subscription series whose relative drift is within 2%', () => {
		// Confirmed real case: `GitHub sponsorship` template 17.09 vs bank 17.29
		// — a ~1.17% drift from FX conversion, within the 2% tolerance that
		// applies to series rows (this template carries a `series_id`).
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 12), amountMinor: -1729, description: 'GitHub' },
		];
		const result = reconcile(
			rows,
			[tx({ id: 'a', amount_minor: 1709, series_id: 'series-github' })],
			ACCT
		);
		expect(result[0]!.status).toBe('duplicate');
	});

	it('does not match a non-series row on amount drift, even a small one', () => {
		// A one-off charge gets NO tolerance at all — only rows with a
		// `series_id` do. Without that signal, amount drift is exactly what
		// distinguishes two different purchases (e.g. two different cafes
		// charging within a few cents of each other), so requiring an exact
		// match is what keeps distinct transactions from being hidden as
		// `duplicate`. 5.00 drift on a 17.09 charge would also fail the 2%
		// relative tolerance even if this row were a series row.
		const rows: ParsedBankRow[] = [
			{
				rowIndex: 0,
				dateMs: day(2026, 7, 12),
				amountMinor: -2209,
				description: 'Something else',
			},
		];
		const result = reconcile(rows, [tx({ id: 'a', amount_minor: 1709 })], ACCT);
		expect(result[0]!.status).toBe('new');
	});

	it('does not match a series row once drift exceeds the 2% relative tolerance', () => {
		// Even for a recurring series, tolerance has a ceiling: a bank row
		// 5.00 off a 17.09 series charge (~29% drift) is a different charge,
		// not this month's re-billing.
		const rows: ParsedBankRow[] = [
			{
				rowIndex: 0,
				dateMs: day(2026, 7, 12),
				amountMinor: -2209,
				description: 'Something else',
			},
		];
		const result = reconcile(
			rows,
			[tx({ id: 'a', amount_minor: 1709, series_id: 'series-github' })],
			ACCT
		);
		expect(result[0]!.status).toBe('new');
	});

	it('does not match two distinct non-series charges within the date window and within 0.50 of each other', () => {
		// Confirmed real false positive under the old absolute-floor tolerance:
		// bank `Swad Nepal -13.90` one day away from an unrelated existing
		// `Halikarnas -13.50` — two different merchants, 0.40 apart, neither
		// row part of a recurring series. Both must stay `new`.
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 9, 2), amountMinor: -1390, description: 'Swad Nepal' },
		];
		const result = reconcile(
			rows,
			[tx({ id: 'a', amount_minor: 1350, timestamp: day(2026, 9, 3) })],
			ACCT
		);
		expect(result[0]!.status).toBe('new');
		expect(result[0]!.selected).toBe(true);
	});

	it('prefers the closest date over the first candidate, so a same-day charge is not stolen', () => {
		// Two existing -14.70 charges on consecutive days (e.g. daily lunch);
		// bank rows land on the same two days. Each bank row must pair with
		// its OWN day's charge, not the other one, even though both are within
		// the ±3 day window and match exactly on amount.
		const day1 = tx({ id: 'd1', amount_minor: 1470, timestamp: day(2026, 7, 12) });
		const day2 = tx({ id: 'd2', amount_minor: 1470, timestamp: day(2026, 7, 13) });
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 12), amountMinor: -1470, description: 'Lunch' },
			{ rowIndex: 1, dateMs: day(2026, 7, 13), amountMinor: -1470, description: 'Lunch' },
		];
		const result = reconcile(rows, [day1, day2], ACCT);
		expect(result.map((r) => r.status)).toEqual(['duplicate', 'duplicate']);
	});

	it('leaves an exact same-day match for its own row instead of an earlier near row', () => {
		// One existing -100.00 on the 10th. The bank reports a *distinct*
		// -100.00 charge on the 8th plus the 10th's own line. Matching rows in
		// statement order, the 8th would take the 10th's entry (2 days out but
		// inside the window, amount exact) and the real duplicate on the 10th
		// would import a second time — the exact double-entry this module
		// exists to prevent, while hiding a genuinely new charge.
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 8), amountMinor: -10000, description: 'Shop' },
			{ rowIndex: 1, dateMs: day(2026, 7, 10), amountMinor: -10000, description: 'Shop' },
		];
		const result = reconcile(
			rows,
			[tx({ id: 'a', amount_minor: 10000, timestamp: day(2026, 7, 10) })],
			ACCT
		);
		expect(result.map((r) => r.status)).toEqual(['new', 'duplicate']);
	});

	it('does not let a same-day near-day amount collide with a distinct nearby amount', () => {
		// This user has many distinct-amount rows on consecutive days (14.70 /
		// 13.50 / 2.00). A 13.50 bank row must never match a 14.70 existing
		// entry a day away — the gap (1.20) is far outside tolerance.
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 13), amountMinor: -1350, description: 'Coffee' },
		];
		const result = reconcile(
			rows,
			[tx({ id: 'a', amount_minor: 1470, timestamp: day(2026, 7, 12) })],
			ACCT
		);
		expect(result[0]!.status).toBe('new');
	});

	it('greedy 1:1 — two identical rows need two existing txns', () => {
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 12), amountMinor: -25000, description: 'ATB' },
			{ rowIndex: 1, dateMs: day(2026, 7, 12), amountMinor: -25000, description: 'ATB' },
		];
		const result = reconcile(rows, [tx({ id: 'a' })], ACCT);
		expect(result.map((r) => r.status)).toEqual(['duplicate', 'new']);
	});

	it('matches an inflow against a transfer that credits the account', () => {
		// A->acct transfer of 100.00 credits acct; +10000 import row is a dup.
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 12), amountMinor: 10000, description: 'from A' },
		];
		const transfer = tx({
			id: 'x',
			from_entity_id: 'acct-A',
			to_entity_id: ACCT,
			amount_minor: 10000,
		});
		const result = reconcile(rows, [transfer], ACCT);
		expect(result[0]!.status).toBe('duplicate');
	});

	it('matches a statement line against an already-split transaction', () => {
		// A -50.00 charge split into -30.00 (groceries) + -20.00 (household),
		// sharing a split_id. The bank still reports the -50.00 total.
		const ts = day(2026, 7, 12);
		const legA = tx({
			id: 'l1',
			to_entity_id: 'groceries',
			amount_minor: 3000,
			timestamp: ts,
			split_id: 'sp-1',
		});
		const legB = tx({
			id: 'l2',
			to_entity_id: 'household',
			amount_minor: 2000,
			timestamp: ts,
			split_id: 'sp-1',
		});
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: ts, amountMinor: -5000, description: 'ATB' },
		];
		const result = reconcile(rows, [legA, legB], ACCT);
		expect(result[0]!.status).toBe('duplicate');
		expect(result[0]!.selected).toBe(false);
	});

	it('folds a split whose legs share one category', () => {
		// KII-146: -60 groceries + -40 groceries is one -100 charge. The old
		// timestamp+note heuristic could not tell this from two separate charges
		// and refused to fold, so the bank's -100 line came back as `new` and
		// defaulted to selected — double-adding on import.
		const ts = day(2026, 7, 12);
		const legA = tx({
			id: 'l1',
			to_entity_id: 'groceries',
			amount_minor: 6000,
			timestamp: ts,
			split_id: 'sp-1',
		});
		const legB = tx({
			id: 'l2',
			to_entity_id: 'groceries',
			amount_minor: 4000,
			timestamp: ts,
			split_id: 'sp-1',
		});
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: ts, amountMinor: -10000, description: 'ATB' },
		];
		const result = reconcile(rows, [legA, legB], ACCT);
		expect(result[0]!.status).toBe('duplicate');
	});

	it('does not collapse duplicate charges to the same category', () => {
		// Two identical -30.00 charges, same day and category, no split_id — these
		// are genuinely separate. Each must still match its own line.
		const ts = day(2026, 7, 12);
		const a = tx({ id: 'd1', to_entity_id: 'coffee', amount_minor: 3000, timestamp: ts });
		const b = tx({ id: 'd2', to_entity_id: 'coffee', amount_minor: 3000, timestamp: ts });
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: ts, amountMinor: -3000, description: 'Cafe' },
			{ rowIndex: 1, dateMs: ts, amountMinor: -3000, description: 'Cafe' },
		];
		const result = reconcile(rows, [a, b], ACCT);
		expect(result.map((r) => r.status)).toEqual(['duplicate', 'duplicate']);
	});

	it('does not treat a split total line as matching a single leg', () => {
		// The -50 split (legs -30/-20) must NOT let a stray -30 line match a leg.
		const ts = day(2026, 7, 12);
		const legA = tx({
			id: 'l1',
			to_entity_id: 'groceries',
			amount_minor: 3000,
			timestamp: ts,
			split_id: 'sp-1',
		});
		const legB = tx({
			id: 'l2',
			to_entity_id: 'household',
			amount_minor: 2000,
			timestamp: ts,
			split_id: 'sp-1',
		});
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: ts, amountMinor: -3000, description: 'ATB' },
		];
		const result = reconcile(rows, [legA, legB], ACCT);
		expect(result[0]!.status).toBe('new');
	});

	it('greedy 1:1 across two identical splits at the same timestamp', () => {
		// Two -50 splits sharing one timestamp match two -50 lines; a third stays
		// new. Distinct split_ids keep them apart — the old heuristic needed
		// distinct timestamps to tell these two events apart at all.
		const ts = day(2026, 7, 12);
		const leg = (id: string, cat: string, amt: number, split: string) =>
			tx({ id, to_entity_id: cat, amount_minor: amt, timestamp: ts, split_id: split });
		const existing = [
			leg('s1a', 'groceries', 3000, 'sp-1'),
			leg('s1b', 'household', 2000, 'sp-1'),
			leg('s2a', 'groceries', 3000, 'sp-2'),
			leg('s2b', 'household', 2000, 'sp-2'),
		];
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: ts, amountMinor: -5000, description: 'ATB' },
			{ rowIndex: 1, dateMs: ts, amountMinor: -5000, description: 'ATB' },
			{ rowIndex: 2, dateMs: ts, amountMinor: -5000, description: 'ATB' },
		];
		const result = reconcile(rows, existing, ACCT);
		expect(result.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'new']);
	});
});
