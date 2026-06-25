import { resolveDropFlow } from '../drop-flow';
import type { EntityType, EntityWithBalance } from '@/src/types';

function entity(id: string, type: EntityType): EntityWithBalance {
	return {
		id,
		type,
		name: id,
		currency: 'EUR',
		icon: 'circle',
		order: 0,
		row: 0,
		position: 0,
		actual: 0,
		planned: 0,
		remaining: 0,
		upcoming: 0,
	} as EntityWithBalance;
}

const income = entity('inc-1', 'income');
const account = entity('acc-1', 'account');
const account2 = entity('acc-2', 'account');
const category = entity('cat-1', 'category');
const saving = entity('sav-1', 'saving');

describe('resolveDropFlow', () => {
	describe('no-op drops', () => {
		it('returns none when there is no target', () => {
			expect(resolveDropFlow(account, null)).toEqual({ kind: 'none' });
		});

		it('returns none when dropped on itself', () => {
			expect(resolveDropFlow(account, account)).toEqual({ kind: 'none' });
		});
	});

	describe('refund flows (reverse direction)', () => {
		it('category → account opens a refund against the original account → category', () => {
			expect(resolveDropFlow(category, account)).toEqual({
				kind: 'refund',
				originalFrom: account,
				originalTo: category,
			});
		});

		it('account → income opens a refund against the original income → account', () => {
			expect(resolveDropFlow(account, income)).toEqual({
				kind: 'refund',
				originalFrom: income,
				originalTo: account,
			});
		});
	});

	describe('reservation flow', () => {
		it('account → saving reserves funds', () => {
			expect(resolveDropFlow(account, saving)).toEqual({
				kind: 'reservation',
				account,
				saving,
			});
		});
	});

	describe('default transaction flow', () => {
		it('account → category moves money from account to category', () => {
			expect(resolveDropFlow(account, category)).toEqual({
				kind: 'transaction',
				from: account,
				to: category,
			});
		});

		it('income → account moves money from income to account', () => {
			expect(resolveDropFlow(income, account)).toEqual({
				kind: 'transaction',
				from: income,
				to: account,
			});
		});

		it('account → account (transfer) moves money between accounts', () => {
			expect(resolveDropFlow(account, account2)).toEqual({
				kind: 'transaction',
				from: account,
				to: account2,
			});
		});

		it('saving → account releases funds via the regular transaction flow', () => {
			expect(resolveDropFlow(saving, account)).toEqual({
				kind: 'transaction',
				from: saving,
				to: account,
			});
		});
	});
});
