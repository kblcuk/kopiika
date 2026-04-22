import { describe, expect, test } from 'bun:test';
import type { Transaction } from '@/src/types';
import { getUnconfirmedCount } from '../index';

const now = Date.now();
const hour = 60 * 60 * 1000;

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
	id: crypto.randomUUID(),
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount: 100,
	currency: 'USD',
	timestamp: now - hour,
	is_confirmed: true,
	...overrides,
});

describe('getUnconfirmedCount', () => {
	test('returns 0 for empty transactions', () => {
		expect(getUnconfirmedCount([])).toBe(0);
	});

	test('returns 0 when all transactions are confirmed', () => {
		const txs = [tx(), tx(), tx()];
		expect(getUnconfirmedCount(txs)).toBe(0);
	});

	test('counts past-due unconfirmed transactions', () => {
		const txs = [
			tx({ is_confirmed: false, timestamp: now - hour }),
			tx({ is_confirmed: false, timestamp: now - 2 * hour }),
			tx({ is_confirmed: true }),
		];
		expect(getUnconfirmedCount(txs)).toBe(2);
	});

	test('excludes future unconfirmed transactions', () => {
		const txs = [
			tx({ is_confirmed: false, timestamp: now + hour }),
			tx({ is_confirmed: false, timestamp: now - hour }),
		];
		expect(getUnconfirmedCount(txs)).toBe(1);
	});

	test('treats is_confirmed undefined as not unconfirmed', () => {
		const txs = [tx({ is_confirmed: undefined, timestamp: now - hour })];
		expect(getUnconfirmedCount(txs)).toBe(0);
	});

	test('includes transactions exactly at now', () => {
		const txs = [tx({ is_confirmed: false, timestamp: now })];
		expect(getUnconfirmedCount(txs)).toBe(1);
	});
});
