import { describe, expect, it } from 'bun:test';

import {
	QUICK_ADD_KINDS,
	getQuickAddKind,
	isQuickAddKind,
	isQuickAddKindAvailable,
	seedQuickAddSelection,
	type QuickAddKind,
} from '../quick-add-kinds';
import { isAllowedPair } from '../transaction-validation';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import type { Entity, EntityType } from '@/src/types';

let seq = 0;
function entity(type: EntityType, name: string, extra: Partial<Entity> = {}): Entity {
	seq += 1;
	return {
		id: `${type}-${name}-${seq}`,
		type,
		name,
		currency: 'EUR',
		row: 0,
		position: seq,
		...extra,
	};
}

describe('QUICK_ADD_KINDS', () => {
	it('offers expense, income, transfer and reserve in that order', () => {
		expect(QUICK_ADD_KINDS.map((k) => k.key)).toEqual([
			'expense',
			'income',
			'transfer',
			'reserve',
		]);
	});

	it('only describes flows the transaction rules already allow', () => {
		for (const kind of QUICK_ADD_KINDS) {
			for (const fromType of kind.fromTypes) {
				for (const toType of kind.toTypes) {
					expect([kind.key, fromType, toType, isAllowedPair(fromType, toType)]).toEqual([
						kind.key,
						fromType,
						toType,
						true,
					]);
				}
			}
		}
	});
});

describe('isQuickAddKind', () => {
	it('accepts every declared key', () => {
		for (const kind of QUICK_ADD_KINDS) {
			expect(isQuickAddKind(kind.key)).toBe(true);
		}
	});

	it('rejects anything else', () => {
		expect(isQuickAddKind('refund')).toBe(false);
		expect(isQuickAddKind(undefined)).toBe(false);
		expect(isQuickAddKind('')).toBe(false);
	});
});

describe('getQuickAddKind', () => {
	it('falls back to expense — the pre-menu behaviour — for an unknown key', () => {
		expect(getQuickAddKind('nonsense').key).toBe('expense');
		expect(getQuickAddKind(undefined).key).toBe('expense');
	});

	it('returns the requested kind', () => {
		expect(getQuickAddKind('reserve').toTypes).toEqual(['saving']);
	});
});

describe('isQuickAddKindAvailable', () => {
	const kindOf = (key: QuickAddKind) => getQuickAddKind(key);

	it('offers expense once an account can reach a category', () => {
		const board = [entity('account', 'Main Card'), entity('category', 'Groceries')];

		expect(isQuickAddKindAvailable(kindOf('expense'), board)).toBe(true);
	});

	it('withholds expense on a board with no categories', () => {
		const board = [entity('account', 'Main Card'), entity('income', 'Salary')];

		expect(isQuickAddKindAvailable(kindOf('expense'), board)).toBe(false);
	});

	it('withholds transfer until a second account exists', () => {
		const card = entity('account', 'Main Card');

		expect(isQuickAddKindAvailable(kindOf('transfer'), [card])).toBe(false);
		expect(isQuickAddKindAvailable(kindOf('transfer'), [card, entity('account', 'Cash')])).toBe(
			true
		);
	});

	it('does not count the balance-adjustment account as the second account', () => {
		const system: Entity = {
			id: BALANCE_ADJUSTMENT_ENTITY_ID,
			type: 'account',
			name: 'Balance Adjustments',
			currency: 'EUR',
			row: 0,
			position: -1,
		};

		expect(
			isQuickAddKindAvailable(kindOf('transfer'), [system, entity('account', 'Main Card')])
		).toBe(false);
	});

	it('withholds income and reserve when the board has no such entity', () => {
		const board = [entity('account', 'Main Card'), entity('category', 'Groceries')];

		expect(isQuickAddKindAvailable(kindOf('income'), board)).toBe(false);
		expect(isQuickAddKindAvailable(kindOf('reserve'), board)).toBe(false);
	});

	it('withholds a kind whose only counterpart is in another currency', () => {
		const board = [
			entity('account', 'Main Card'),
			entity('category', 'Groceries', { currency: 'USD' }),
		];

		expect(isQuickAddKindAvailable(kindOf('expense'), board)).toBe(false);
	});

	it('ignores deleted entities on both sides', () => {
		expect(
			isQuickAddKindAvailable(kindOf('expense'), [
				entity('account', 'Main Card'),
				entity('category', 'Retired', { is_deleted: true }),
			])
		).toBe(false);
		expect(
			isQuickAddKindAvailable(kindOf('expense'), [
				entity('account', 'Closed', { is_deleted: true }),
				entity('category', 'Groceries'),
			])
		).toBe(false);
	});
});

describe('seedQuickAddSelection', () => {
	const kindOf = (key: QuickAddKind) => getQuickAddKind(key);

	it('seeds expense from the default account', () => {
		const card = entity('account', 'Main Card', { is_default: true });
		const cash = entity('account', 'Cash');
		const groceries = entity('category', 'Groceries');
		const transport = entity('category', 'Transport');

		const seed = seedQuickAddSelection(kindOf('expense'), [card, cash, groceries, transport]);

		expect(seed).toEqual({ fromId: card.id, toId: null });
	});

	it('seeds the destination too when the board has only one of that type', () => {
		const card = entity('account', 'Main Card', { is_default: true });
		const groceries = entity('category', 'Groceries');

		const seed = seedQuickAddSelection(kindOf('expense'), [card, groceries]);

		expect(seed).toEqual({ fromId: card.id, toId: groceries.id });
	});

	it('seeds income from the only income entity into the default account', () => {
		const salary = entity('income', 'Salary');
		const card = entity('account', 'Main Card', { is_default: true });
		const cash = entity('account', 'Cash');

		const seed = seedQuickAddSelection(kindOf('income'), [salary, card, cash]);

		expect(seed).toEqual({ fromId: salary.id, toId: card.id });
	});

	it('leaves the income source empty when there is more than one to choose from', () => {
		const salary = entity('income', 'Salary');
		const freelance = entity('income', 'Freelance');
		const card = entity('account', 'Main Card', { is_default: true });

		const seed = seedQuickAddSelection(kindOf('income'), [salary, freelance, card]);

		expect(seed).toEqual({ fromId: null, toId: card.id });
	});

	it('never seeds a transfer from an account to itself', () => {
		const card = entity('account', 'Main Card', { is_default: true });
		const cash = entity('account', 'Cash');

		const seed = seedQuickAddSelection(kindOf('transfer'), [card, cash]);

		expect(seed).toEqual({ fromId: card.id, toId: null });
	});

	it('seeds reserve into the only savings goal', () => {
		const card = entity('account', 'Main Card', { is_default: true });
		const japan = entity('saving', 'Trip to Japan');

		const seed = seedQuickAddSelection(kindOf('reserve'), [card, japan]);

		expect(seed).toEqual({ fromId: card.id, toId: japan.id });
	});

	it('ignores deleted entities when counting the only candidate', () => {
		const card = entity('account', 'Main Card', { is_default: true });
		const groceries = entity('category', 'Groceries');
		const oldCategory = entity('category', 'Retired', { is_deleted: true });

		const seed = seedQuickAddSelection(kindOf('expense'), [card, groceries, oldCategory]);

		expect(seed).toEqual({ fromId: card.id, toId: groceries.id });
	});

	it('ignores the balance-adjustment system account', () => {
		const system: Entity = {
			id: BALANCE_ADJUSTMENT_ENTITY_ID,
			type: 'account',
			name: 'Balance Adjustments',
			currency: 'EUR',
			row: 0,
			position: -1,
		};
		const salary = entity('income', 'Salary');
		const card = entity('account', 'Main Card', { is_default: true });

		const seed = seedQuickAddSelection(kindOf('transfer'), [system, card, salary]);

		expect(seed).toEqual({ fromId: card.id, toId: null });
	});

	it('leaves the destination empty when its currency differs from the source', () => {
		const card = entity('account', 'Main Card', { is_default: true });
		const usdGroceries = entity('category', 'Groceries', { currency: 'USD' });

		const seed = seedQuickAddSelection(kindOf('expense'), [card, usdGroceries]);

		expect(seed).toEqual({ fromId: card.id, toId: null });
	});

	it('falls back to the only account when none is marked default', () => {
		const cash = entity('account', 'Cash');
		const groceries = entity('category', 'Groceries');
		const transport = entity('category', 'Transport');

		const seed = seedQuickAddSelection(kindOf('expense'), [cash, groceries, transport]);

		expect(seed).toEqual({ fromId: cash.id, toId: null });
	});

	it('leaves the source empty when the board has no account at all', () => {
		const groceries = entity('category', 'Groceries');

		const seed = seedQuickAddSelection(kindOf('expense'), [groceries]);

		expect(seed).toEqual({ fromId: null, toId: groceries.id });
	});
});
