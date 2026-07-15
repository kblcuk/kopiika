import { describe, it, expect } from 'bun:test';
import { reconcile } from '../reconcile';
import type { ParsedBankRow } from '../types';
import type { Transaction } from '@/src/types';

const ACCT = 'acct-1';
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0).getTime();

function tx(over: Partial<Transaction>): Transaction {
	return { id: 't', from_entity_id: ACCT, to_entity_id: 'cat', amount_minor: 25000,
		currency: 'EUR', timestamp: day(2026, 7, 12), is_confirmed: true, ...over };
}

describe('reconcile', () => {
	it('marks a same-day same-amount outflow as duplicate', () => {
		const rows: ParsedBankRow[] = [{ rowIndex: 0, dateMs: day(2026, 7, 12), amountMinor: -25000, description: 'ATB' }];
		const result = reconcile(rows, [tx({ id: 'a' })], ACCT);
		expect(result[0].status).toBe('duplicate');
		expect(result[0].selected).toBe(false);
	});

	it('marks a different-day row as new even if amount matches', () => {
		const rows: ParsedBankRow[] = [{ rowIndex: 0, dateMs: day(2026, 7, 11), amountMinor: -25000, description: 'ATB' }];
		const result = reconcile(rows, [tx({ id: 'a', timestamp: day(2026, 7, 12) })], ACCT);
		expect(result[0].status).toBe('new');
		expect(result[0].selected).toBe(true);
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
		const rows: ParsedBankRow[] = [{ rowIndex: 0, dateMs: day(2026, 7, 12), amountMinor: 10000, description: 'from A' }];
		const transfer = tx({ id: 'x', from_entity_id: 'acct-A', to_entity_id: ACCT, amount_minor: 10000 });
		const result = reconcile(rows, [transfer], ACCT);
		expect(result[0].status).toBe('duplicate');
	});
});
