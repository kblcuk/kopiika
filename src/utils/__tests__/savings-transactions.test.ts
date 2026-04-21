import type { Entity, Transaction } from '@/src/types';
import {
	getReservationForPair,
	getReservationsForSaving,
	getReservationsForAccount,
	getTotalReservedForAccount,
} from '../savings-transactions';

const account1: Entity = {
	id: 'acc-1',
	type: 'account',
	name: 'Checking',
	currency: 'USD',
	order: 0,
	row: 0,
	position: 0,
};
const account2: Entity = {
	id: 'acc-2',
	type: 'account',
	name: 'Cash',
	currency: 'USD',
	order: 1,
	row: 0,
	position: 1,
};
const saving1: Entity = {
	id: 'sav-1',
	type: 'saving',
	name: 'Vacation',
	currency: 'USD',
	order: 0,
	row: 0,
	position: 0,
};
const saving2: Entity = {
	id: 'sav-2',
	type: 'saving',
	name: 'Emergency',
	currency: 'USD',
	order: 1,
	row: 0,
	position: 1,
};
const category1: Entity = {
	id: 'cat-1',
	type: 'category',
	name: 'Food',
	currency: 'USD',
	order: 0,
	row: 0,
	position: 0,
};

const entities = [account1, account2, saving1, saving2, category1];

function tx(
	id: string,
	from: string,
	to: string,
	amount: number,
	timestamp = Date.now()
): Transaction {
	return {
		id,
		from_entity_id: from,
		to_entity_id: to,
		amount,
		currency: 'USD',
		timestamp,
	};
}

describe('savings-transactions', () => {
	describe('getReservationForPair', () => {
		it('returns 0 for empty transactions', () => {
			expect(getReservationForPair([], 'acc-1', 'sav-1')).toBe(0);
		});

		it('returns amount for single reserve transaction', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 500)];
			expect(getReservationForPair(txns, 'acc-1', 'sav-1')).toBe(500);
		});

		it('sums multiple reserve transactions', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 300), tx('t2', 'acc-1', 'sav-1', 200)];
			expect(getReservationForPair(txns, 'acc-1', 'sav-1')).toBe(500);
		});

		it('subtracts release transactions', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 500), tx('t2', 'sav-1', 'acc-1', 200)];
			expect(getReservationForPair(txns, 'acc-1', 'sav-1')).toBe(300);
		});

		it('clamps negative net to 0', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 100), tx('t2', 'sav-1', 'acc-1', 300)];
			expect(getReservationForPair(txns, 'acc-1', 'sav-1')).toBe(0);
		});

		it('ignores transactions for other pairs', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 500), tx('t2', 'acc-2', 'sav-1', 300)];
			expect(getReservationForPair(txns, 'acc-1', 'sav-1')).toBe(500);
		});

		it('ignores non-savings transactions', () => {
			const txns = [tx('t1', 'acc-1', 'cat-1', 500)];
			expect(getReservationForPair(txns, 'acc-1', 'sav-1')).toBe(0);
		});
	});

	describe('getReservationsForSaving', () => {
		it('returns empty for no transactions', () => {
			expect(getReservationsForSaving([], entities, 'sav-1')).toEqual([]);
		});

		it('returns per-account breakdown', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 500), tx('t2', 'acc-2', 'sav-1', 300)];
			const result = getReservationsForSaving(txns, entities, 'sav-1');

			expect(result).toHaveLength(2);
			expect(result).toContainEqual({ accountEntityId: 'acc-1', amount: 500 });
			expect(result).toContainEqual({ accountEntityId: 'acc-2', amount: 300 });
		});

		it('nets reserves and releases per account', () => {
			const txns = [
				tx('t1', 'acc-1', 'sav-1', 500),
				tx('t2', 'sav-1', 'acc-1', 200),
				tx('t3', 'acc-2', 'sav-1', 100),
			];
			const result = getReservationsForSaving(txns, entities, 'sav-1');

			expect(result).toContainEqual({ accountEntityId: 'acc-1', amount: 300 });
			expect(result).toContainEqual({ accountEntityId: 'acc-2', amount: 100 });
		});

		it('excludes accounts with zero or negative net', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 100), tx('t2', 'sav-1', 'acc-1', 100)];
			expect(getReservationsForSaving(txns, entities, 'sav-1')).toEqual([]);
		});

		it('ignores transactions from non-account entities', () => {
			const txns = [tx('t1', 'cat-1', 'sav-1', 500)];
			expect(getReservationsForSaving(txns, entities, 'sav-1')).toEqual([]);
		});
	});

	describe('getReservationsForAccount', () => {
		it('returns empty for no transactions', () => {
			expect(getReservationsForAccount([], entities, 'acc-1')).toEqual([]);
		});

		it('returns per-saving breakdown', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 500), tx('t2', 'acc-1', 'sav-2', 300)];
			const result = getReservationsForAccount(txns, entities, 'acc-1');

			expect(result).toHaveLength(2);
			expect(result).toContainEqual({ savingEntityId: 'sav-1', amount: 500 });
			expect(result).toContainEqual({ savingEntityId: 'sav-2', amount: 300 });
		});

		it('nets reserves and releases per saving', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 500), tx('t2', 'sav-1', 'acc-1', 200)];
			const result = getReservationsForAccount(txns, entities, 'acc-1');

			expect(result).toEqual([{ savingEntityId: 'sav-1', amount: 300 }]);
		});

		it('excludes savings with zero or negative net', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 100), tx('t2', 'sav-1', 'acc-1', 200)];
			expect(getReservationsForAccount(txns, entities, 'acc-1')).toEqual([]);
		});

		it('ignores transactions to non-saving entities', () => {
			const txns = [tx('t1', 'acc-1', 'cat-1', 500)];
			expect(getReservationsForAccount(txns, entities, 'acc-1')).toEqual([]);
		});
	});

	describe('getTotalReservedForAccount', () => {
		it('returns 0 for no transactions', () => {
			expect(getTotalReservedForAccount([], entities, 'acc-1')).toBe(0);
		});

		it('sums across all savings', () => {
			const txns = [tx('t1', 'acc-1', 'sav-1', 500), tx('t2', 'acc-1', 'sav-2', 300)];
			expect(getTotalReservedForAccount(txns, entities, 'acc-1')).toBe(800);
		});

		it('accounts for releases', () => {
			const txns = [
				tx('t1', 'acc-1', 'sav-1', 500),
				tx('t2', 'acc-1', 'sav-2', 300),
				tx('t3', 'sav-1', 'acc-1', 200),
			];
			expect(getTotalReservedForAccount(txns, entities, 'acc-1')).toBe(600);
		});
	});
});
