import type { Entity } from '@/src/types';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { getValidFromEntities, getValidToEntities, isAllowedPair } from '../transaction-validation';

describe('transaction-validation', () => {
	// Test entities with different types and currencies
	const income1: Entity = {
		id: 'income-1',
		type: 'income',
		name: 'Salary',
		currency: 'USD',
		order: 0,
		row: 0,
		position: 0,
	};

	const income2: Entity = {
		id: 'income-2',
		type: 'income',
		name: 'Freelance',
		currency: 'USD',
		order: 1,
		row: 0,
		position: 1,
	};

	const account1: Entity = {
		id: 'account-1',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		order: 0,
		row: 1,
		position: 0,
	};

	const account2: Entity = {
		id: 'account-2',
		type: 'account',
		name: 'Savings Account',
		currency: 'USD',
		order: 1,
		row: 1,
		position: 1,
	};

	const accountEUR: Entity = {
		id: 'account-eur',
		type: 'account',
		name: 'Euro Account',
		currency: 'EUR',
		order: 2,
		row: 1,
		position: 2,
	};

	const category1: Entity = {
		id: 'category-1',
		type: 'category',
		name: 'Groceries',
		currency: 'USD',
		order: 0,
		row: 2,
		position: 0,
	};

	const category2: Entity = {
		id: 'category-2',
		type: 'category',
		name: 'Transport',
		currency: 'USD',
		order: 1,
		row: 2,
		position: 1,
	};

	const saving1: Entity = {
		id: 'saving-1',
		type: 'saving',
		name: 'Vacation',
		currency: 'USD',
		order: 0,
		row: 3,
		position: 0,
	};

	const balanceAdjustment: Entity = {
		id: BALANCE_ADJUSTMENT_ENTITY_ID,
		type: 'account',
		name: 'Balance Adjustment',
		currency: 'USD',
		order: 0,
		row: 0,
		position: -1,
	};

	const allEntities = [
		income1,
		income2,
		account1,
		account2,
		accountEUR,
		category1,
		category2,
		saving1,
		balanceAdjustment,
	];

	describe('getValidFromEntities', () => {
		it('returns empty array when toEntity is null', () => {
			const result = getValidFromEntities(allEntities, null, 'USD');
			expect(result).toEqual([]);
		});

		describe('type combination rules', () => {
			it('returns income entities when to is account (income -> account)', () => {
				const result = getValidFromEntities(allEntities, account1, 'USD');

				// Should include income entities (valid flow)
				expect(result.some((e) => e.id === 'income-1')).toBe(true);
				expect(result.some((e) => e.id === 'income-2')).toBe(true);
			});

			it('returns account entities when to is account (account -> account transfer)', () => {
				const result = getValidFromEntities(allEntities, account1, 'USD');

				// Should include other accounts (account-to-account transfer)
				expect(result.some((e) => e.id === 'account-2')).toBe(true);
			});

			it('returns account entities when to is category (account -> category)', () => {
				const result = getValidFromEntities(allEntities, category1, 'USD');

				// Should include accounts
				expect(result.some((e) => e.id === 'account-1')).toBe(true);
				expect(result.some((e) => e.id === 'account-2')).toBe(true);

				// Should NOT include income (invalid: income -> category)
				expect(result.some((e) => e.id === 'income-1')).toBe(false);
			});

			it('returns category and saving entities when to is account (refund/release)', () => {
				const result = getValidFromEntities(allEntities, account1, 'USD');

				// Should include categories (valid refund flow)
				expect(result.some((e) => e.id === 'category-1')).toBe(true);
				expect(result.some((e) => e.id === 'category-2')).toBe(true);

				// Should include savings (saving -> account release)
				expect(result.some((e) => e.id === 'saving-1')).toBe(true);
			});

			it('returns account entities when to is saving (account -> saving)', () => {
				const result = getValidFromEntities(allEntities, saving1, 'USD');

				// Should include accounts
				expect(result.some((e) => e.id === 'account-1')).toBe(true);
				expect(result.some((e) => e.id === 'account-2')).toBe(true);
				// Should NOT include income, categories, or savings
				expect(result.some((e) => e.type === 'income')).toBe(false);
				expect(result.some((e) => e.type === 'category')).toBe(false);
				expect(result.some((e) => e.type === 'saving')).toBe(false);
			});

			it('returns empty for invalid destination types (nothing can go to income)', () => {
				const result = getValidFromEntities(allEntities, income1, 'USD');
				expect(result).toEqual([]);
			});
		});

		describe('currency filtering', () => {
			it('excludes entities with different currency', () => {
				const result = getValidFromEntities(allEntities, account1, 'USD');

				// EUR account should be excluded
				expect(result.some((e) => e.id === 'account-eur')).toBe(false);
			});

			it('includes only matching currency entities', () => {
				const result = getValidFromEntities(allEntities, accountEUR, 'EUR');

				// USD entities should be excluded
				expect(result.some((e) => e.id === 'income-1')).toBe(false);
				expect(result.some((e) => e.id === 'account-1')).toBe(false);
			});
		});

		describe('same entity exclusion', () => {
			it('excludes the same entity from results', () => {
				const result = getValidFromEntities(allEntities, account1, 'USD');

				// Should NOT include the same entity
				expect(result.some((e) => e.id === 'account-1')).toBe(false);
			});
		});

		describe('balance adjustment handling', () => {
			it('always excludes balance adjustment entity', () => {
				const result = getValidFromEntities(allEntities, account1, 'USD');
				expect(result.some((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID)).toBe(false);
			});
		});
	});

	describe('getValidToEntities', () => {
		it('returns empty array when fromEntity is null', () => {
			const result = getValidToEntities(allEntities, null, 'USD');
			expect(result).toEqual([]);
		});

		describe('type combination rules', () => {
			it('returns only account entities when from is income (income -> account)', () => {
				const result = getValidToEntities(allEntities, income1, 'USD');

				// Should include accounts
				expect(result.some((e) => e.id === 'account-1')).toBe(true);
				expect(result.some((e) => e.id === 'account-2')).toBe(true);

				// Should NOT include categories or savings
				expect(result.some((e) => e.id === 'category-1')).toBe(false);
				expect(result.some((e) => e.id === 'saving-1')).toBe(false);
			});

			it('returns category, account, and saving when from is account', () => {
				const result = getValidToEntities(allEntities, account1, 'USD');

				// Should include categories
				expect(result.some((e) => e.id === 'category-1')).toBe(true);
				expect(result.some((e) => e.id === 'category-2')).toBe(true);

				// Should include savings
				expect(result.some((e) => e.id === 'saving-1')).toBe(true);

				// Should include other accounts (account-to-account)
				expect(result.some((e) => e.id === 'account-2')).toBe(true);
			});

			it('returns account entities when from is category (category -> account refund)', () => {
				const result = getValidToEntities(allEntities, category1, 'USD');

				// Should include accounts
				expect(result.some((e) => e.id === 'account-1')).toBe(true);
				expect(result.some((e) => e.id === 'account-2')).toBe(true);

				// Should NOT include other categories, income, or savings
				expect(result.some((e) => e.id === 'category-2')).toBe(false);
				expect(result.some((e) => e.id === 'income-1')).toBe(false);
				expect(result.some((e) => e.id === 'saving-1')).toBe(false);

				// Should NOT include balance adjustment
				expect(result.some((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID)).toBe(false);
			});

			it('returns account entities when from is saving (saving -> account release)', () => {
				const result = getValidToEntities(allEntities, saving1, 'USD');

				// Should include accounts
				expect(result.some((e) => e.id === 'account-1')).toBe(true);
				expect(result.some((e) => e.id === 'account-2')).toBe(true);

				// Should NOT include categories, income, or other savings
				expect(result.some((e) => e.type === 'category')).toBe(false);
				expect(result.some((e) => e.type === 'income')).toBe(false);

				// Should NOT include balance adjustment
				expect(result.some((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID)).toBe(false);
			});
		});

		describe('currency filtering', () => {
			it('excludes entities with different currency', () => {
				const result = getValidToEntities(allEntities, account1, 'USD');

				// EUR account should be excluded
				expect(result.some((e) => e.id === 'account-eur')).toBe(false);
			});
		});

		describe('same entity exclusion', () => {
			it('excludes the same entity from results', () => {
				const result = getValidToEntities(allEntities, account1, 'USD');

				// Should NOT include the same entity
				expect(result.some((e) => e.id === 'account-1')).toBe(false);
			});
		});

		describe('excludeId parameter', () => {
			it('excludes specified entity ID', () => {
				const result = getValidToEntities(allEntities, account1, 'USD', 'category-1');

				// category-1 should be excluded
				expect(result.some((e) => e.id === 'category-1')).toBe(false);

				// Other categories should still be included
				expect(result.some((e) => e.id === 'category-2')).toBe(true);
			});
		});

		describe('balance adjustment handling', () => {
			it('excludes balance adjustment from destination options', () => {
				const result = getValidToEntities(allEntities, account1, 'USD');

				expect(result.some((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID)).toBe(false);
			});

			it('returns only accounts when from is balance adjustment', () => {
				const result = getValidToEntities(allEntities, balanceAdjustment, 'USD');

				// Should only include accounts (not categories/savings)
				expect(result.every((e) => e.type === 'account')).toBe(true);

				// Should include regular accounts
				expect(result.some((e) => e.id === 'account-1')).toBe(true);
				expect(result.some((e) => e.id === 'account-2')).toBe(true);

				// Should NOT include balance adjustment itself
				expect(result.some((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID)).toBe(false);
			});

			it('respects currency when from is balance adjustment', () => {
				const result = getValidToEntities(allEntities, balanceAdjustment, 'EUR');

				// Should only include EUR account
				expect(result.some((e) => e.id === 'account-eur')).toBe(true);
				expect(result.some((e) => e.id === 'account-1')).toBe(false);
			});
		});
	});

	describe('isAllowedPair', () => {
		it.each([
			['income', 'account'],
			['account', 'category'],
			['account', 'account'],
			['account', 'saving'],
			['category', 'account'],
			['saving', 'account'],
		] as const)('%s → %s is allowed', (from, to) => {
			expect(isAllowedPair(from, to)).toBe(true);
		});

		it.each([
			['income', 'income'],
			['income', 'category'],
			['income', 'saving'],
			['account', 'income'],
			['category', 'category'],
			['category', 'income'],
			['category', 'saving'],
			['saving', 'saving'],
			['saving', 'income'],
			['saving', 'category'],
		] as const)('%s → %s is blocked', (from, to) => {
			expect(isAllowedPair(from, to)).toBe(false);
		});
	});
});
