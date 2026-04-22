import { describe, expect, test } from 'bun:test';
import type { Transaction } from '@/src/types';
import { getNotifiableTransactions } from '../notification-logic';

const hour = 60 * 60 * 1000;

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
	id: crypto.randomUUID(),
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount: 100,
	currency: 'USD',
	timestamp: Date.now() + hour,
	is_confirmed: false,
	...overrides,
});

describe('getNotifiableTransactions', () => {
	test('returns empty array for no transactions', () => {
		expect(getNotifiableTransactions([], Date.now())).toEqual([]);
	});

	test('returns only future unconfirmed transactions', () => {
		const now = Date.now();
		const txs = [
			tx({ id: 'future-1', timestamp: now + hour, is_confirmed: false }),
			tx({ id: 'past-1', timestamp: now - hour, is_confirmed: false }),
			tx({
				id: 'future-confirmed',
				timestamp: now + hour,
				is_confirmed: true,
			}),
		];
		const result = getNotifiableTransactions(txs, now);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('future-1');
	});

	test('excludes transactions that already have a notification_id', () => {
		const now = Date.now();
		const txs = [
			tx({
				id: 'scheduled',
				timestamp: now + hour,
				notification_id: 'notif-1',
			}),
			tx({ id: 'unscheduled', timestamp: now + hour }),
		];
		const result = getNotifiableTransactions(txs, now);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('unscheduled');
	});

	test('sorts by timestamp ascending (soonest first)', () => {
		const now = Date.now();
		const txs = [
			tx({ id: 'later', timestamp: now + 3 * hour }),
			tx({ id: 'soon', timestamp: now + hour }),
			tx({ id: 'mid', timestamp: now + 2 * hour }),
		];
		const result = getNotifiableTransactions(txs, now);
		expect(result.map((t) => t.id)).toEqual(['soon', 'mid', 'later']);
	});

	test('caps at 60 transactions (iOS 64 limit with buffer)', () => {
		const now = Date.now();
		const txs = Array.from({ length: 80 }, (_, i) =>
			tx({ id: `tx-${i}`, timestamp: now + (i + 1) * hour })
		);
		const result = getNotifiableTransactions(txs, now);
		expect(result).toHaveLength(60);
		expect(result[0].id).toBe('tx-0');
		expect(result[59].id).toBe('tx-59');
	});
});
