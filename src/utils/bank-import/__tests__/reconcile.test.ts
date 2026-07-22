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

	it('marks a different-day row as new even if amount matches', () => {
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: day(2026, 7, 11), amountMinor: -25000, description: 'ATB' },
		];
		const result = reconcile(rows, [tx({ id: 'a', timestamp: day(2026, 7, 12) })], ACCT);
		expect(result[0]!.status).toBe('new');
		expect(result[0]!.selected).toBe(true);
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
		// A -50.00 charge was entered then split into -30.00 (groceries) + -20.00
		// (household), sharing an identical timestamp + note. The bank still
		// reports the -50.00 total.
		const ts = day(2026, 7, 12);
		const legA = tx({
			id: 'l1',
			to_entity_id: 'groceries',
			amount_minor: 3000,
			timestamp: ts,
			note: 'ATB',
		});
		const legB = tx({
			id: 'l2',
			to_entity_id: 'household',
			amount_minor: 2000,
			timestamp: ts,
			note: 'ATB',
		});
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: ts, amountMinor: -5000, description: 'ATB' },
		];
		const result = reconcile(rows, [legA, legB], ACCT);
		expect(result[0]!.status).toBe('duplicate');
		expect(result[0]!.selected).toBe(false);
	});

	it('does not collapse duplicate charges to the same category', () => {
		// Two identical -30.00 charges, same day + note, SAME category — these are
		// genuinely separate, not a split. Each must still match its own line.
		const ts = day(2026, 7, 12);
		const a = tx({
			id: 'd1',
			to_entity_id: 'coffee',
			amount_minor: 3000,
			timestamp: ts,
			note: 'Cafe',
		});
		const b = tx({
			id: 'd2',
			to_entity_id: 'coffee',
			amount_minor: 3000,
			timestamp: ts,
			note: 'Cafe',
		});
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
			note: 'ATB',
		});
		const legB = tx({
			id: 'l2',
			to_entity_id: 'household',
			amount_minor: 2000,
			timestamp: ts,
			note: 'ATB',
		});
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: ts, amountMinor: -3000, description: 'ATB' },
		];
		const result = reconcile(rows, [legA, legB], ACCT);
		expect(result[0]!.status).toBe('new');
	});

	it('greedy 1:1 across two identical splits', () => {
		// Two separate -50 splits on the same day (distinct timestamps) match two
		// -50 lines; a third -50 line stays new.
		const t1 = day(2026, 7, 12);
		const t2 = day(2026, 7, 12) + 3600_000; // one hour later, distinct split event
		const split1 = [
			tx({
				id: 's1a',
				to_entity_id: 'groceries',
				amount_minor: 3000,
				timestamp: t1,
				note: 'ATB',
			}),
			tx({
				id: 's1b',
				to_entity_id: 'household',
				amount_minor: 2000,
				timestamp: t1,
				note: 'ATB',
			}),
		];
		const split2 = [
			tx({
				id: 's2a',
				to_entity_id: 'groceries',
				amount_minor: 3000,
				timestamp: t2,
				note: 'ATB',
			}),
			tx({
				id: 's2b',
				to_entity_id: 'household',
				amount_minor: 2000,
				timestamp: t2,
				note: 'ATB',
			}),
		];
		const rows: ParsedBankRow[] = [
			{ rowIndex: 0, dateMs: t1, amountMinor: -5000, description: 'ATB' },
			{ rowIndex: 1, dateMs: t1, amountMinor: -5000, description: 'ATB' },
			{ rowIndex: 2, dateMs: t1, amountMinor: -5000, description: 'ATB' },
		];
		const result = reconcile(rows, [...split1, ...split2], ACCT);
		expect(result.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'new']);
	});
});
