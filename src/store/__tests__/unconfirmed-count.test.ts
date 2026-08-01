import { describe, expect, test } from 'bun:test';
import type { Transaction } from '@/src/types';
import { getUnconfirmedCount } from '../index';

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
	id: crypto.randomUUID(),
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount_minor: 10000,
	currency: 'USD',
	timestamp: now - day,
	is_confirmed: true,
	...overrides,
});

// Same civil day as `now`, but late enough that a raw `timestamp <= now`
// comparison would exclude it — this is the KII-159 regression guard.
const laterToday = (): number => {
	const d = new Date(now);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();
};

describe('getUnconfirmedCount', () => {
	test('returns 0 for empty transactions', () => {
		expect(getUnconfirmedCount([])).toBe(0);
	});

	test('returns 0 when all transactions are confirmed', () => {
		expect(getUnconfirmedCount([tx(), tx(), tx()])).toBe(0);
	});

	test('counts past-due unconfirmed transactions', () => {
		const txs = [
			tx({ is_confirmed: false, timestamp: now - day }),
			tx({ is_confirmed: false, timestamp: now - 2 * day }),
			tx({ is_confirmed: true }),
		];
		expect(getUnconfirmedCount(txs)).toBe(2);
	});

	test('excludes unconfirmed transactions dated tomorrow', () => {
		const txs = [
			tx({ is_confirmed: false, timestamp: now + day }),
			tx({ is_confirmed: false, timestamp: now - day }),
		];
		expect(getUnconfirmedCount(txs)).toBe(1);
	});

	test('counts an unconfirmed transaction later today (KII-159)', () => {
		expect(getUnconfirmedCount([tx({ is_confirmed: false, timestamp: laterToday() })])).toBe(1);
	});

	test('treats is_confirmed undefined as not unconfirmed', () => {
		expect(getUnconfirmedCount([tx({ is_confirmed: undefined, timestamp: now - day })])).toBe(
			0
		);
	});

	test('includes transactions exactly at now', () => {
		expect(getUnconfirmedCount([tx({ is_confirmed: false, timestamp: now })])).toBe(1);
	});
});
