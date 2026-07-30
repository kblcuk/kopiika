import { describe, test, expect } from 'bun:test';

import { resolveBubbleTapFlow, resolveFundingAccount } from '../bubble-tap-flow';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import type { EntityType, EntityWithBalance } from '@/src/types';

function entity(
	id: string,
	type: EntityType,
	overrides: Partial<EntityWithBalance> = {}
): EntityWithBalance {
	return {
		id,
		type,
		name: id,
		currency: 'EUR',
		icon: 'circle',
		row: 0,
		position: 0,
		actual: 0,
		planned: 0,
		remaining: 0,
		upcoming: 0,
		...overrides,
	} as EntityWithBalance;
}

const income = entity('inc-1', 'income');
const account = entity('acc-1', 'account');
const category = entity('cat-1', 'category');
const saving = entity('sav-1', 'saving');

describe('resolveFundingAccount', () => {
	test('prefers the is_default account over earlier positions', () => {
		const first = entity('acc-first', 'account', { position: 0 });
		const flagged = entity('acc-flagged', 'account', { position: 5, is_default: true });

		expect(resolveFundingAccount([first, flagged], 'EUR')).toBe(flagged);
	});

	test('falls back to the lowest (row, position) when nothing is flagged', () => {
		const later = entity('acc-later', 'account', { row: 0, position: 3 });
		const secondRow = entity('acc-second-row', 'account', { row: 1, position: 0 });
		const earliest = entity('acc-earliest', 'account', { row: 0, position: 1 });

		expect(resolveFundingAccount([later, secondRow, earliest], 'EUR')).toBe(earliest);
	});

	test('ignores non-account types', () => {
		expect(resolveFundingAccount([income, category, saving], 'EUR')).toBeNull();
	});

	test('ignores currency mismatches', () => {
		const usd = entity('acc-usd', 'account', { currency: 'USD' });

		expect(resolveFundingAccount([usd], 'EUR')).toBeNull();
		expect(resolveFundingAccount([usd], 'USD')).toBe(usd);
	});

	test('ignores deleted accounts and the balance-adjustment entity', () => {
		const deleted = entity('acc-deleted', 'account', { is_deleted: true });
		const system = entity(BALANCE_ADJUSTMENT_ENTITY_ID, 'account');

		expect(resolveFundingAccount([deleted, system], 'EUR')).toBeNull();
	});

	test('returns null for an empty list', () => {
		expect(resolveFundingAccount([], 'EUR')).toBeNull();
	});
});

describe('resolveBubbleTapFlow', () => {
	describe('edit mode', () => {
		test('every type opens the detail modal', () => {
			for (const tapped of [income, account, category, saving]) {
				expect(
					resolveBubbleTapFlow(tapped, { isEditing: true, entities: [account] })
				).toEqual({ kind: 'detail', entity: tapped });
			}
		});
	});

	describe('category', () => {
		test('fills the destination slot and resolves the flagged account as source', () => {
			const flagged = entity('acc-flagged', 'account', { is_default: true });

			expect(
				resolveBubbleTapFlow(category, { isEditing: false, entities: [account, flagged] })
			).toEqual({ kind: 'transaction', from: flagged, to: category });
		});

		test('falls back to the first account when none is flagged', () => {
			const second = entity('acc-2', 'account', { position: 1 });

			expect(
				resolveBubbleTapFlow(category, { isEditing: false, entities: [second, account] })
			).toEqual({ kind: 'transaction', from: account, to: category });
		});

		test('leaves the source null when there are no accounts at all', () => {
			expect(
				resolveBubbleTapFlow(category, { isEditing: false, entities: [income] })
			).toEqual({
				kind: 'transaction',
				from: null,
				to: category,
			});
		});
	});

	describe('income and account', () => {
		test('income fills the source slot, destination left empty', () => {
			expect(resolveBubbleTapFlow(income, { isEditing: false, entities: [account] })).toEqual(
				{ kind: 'transaction', from: income, to: null }
			);
		});

		test('account fills the source slot, destination left empty', () => {
			expect(
				resolveBubbleTapFlow(account, { isEditing: false, entities: [account] })
			).toEqual({ kind: 'transaction', from: account, to: null });
		});
	});

	describe('saving', () => {
		test('opens a reservation from the resolved funding account', () => {
			expect(resolveBubbleTapFlow(saving, { isEditing: false, entities: [account] })).toEqual(
				{ kind: 'reservation', account, saving }
			);
		});

		test('falls back to the detail modal when no account can fund it', () => {
			const usdSaving = entity('sav-usd', 'saving', { currency: 'USD' });

			expect(
				resolveBubbleTapFlow(usdSaving, { isEditing: false, entities: [account] })
			).toEqual({ kind: 'detail', entity: usdSaving });
		});
	});
});
