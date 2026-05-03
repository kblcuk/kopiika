import type { Entity, Transaction } from '@/src/types';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import {
	TransactionValidationError,
	ensureValid,
	getValidFromEntities,
	getValidToEntities,
	isAllowedPair,
	validateTransaction,
	validateUpdate,
} from '../transaction-validation';

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

	describe('validateTransaction', () => {
		it('accepts a well-formed income → account transaction', () => {
			const result = validateTransaction(
				{
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 100,
					currency: 'USD',
				},
				allEntities
			);
			expect(result.ok).toBe(true);
		});

		it('rejects zero or negative amounts', () => {
			for (const amount of [0, -1, NaN, Infinity]) {
				const result = validateTransaction(
					{
						from_entity_id: 'income-1',
						to_entity_id: 'account-1',
						amount,
						currency: 'USD',
					},
					allEntities
				);
				expect(result.ok).toBe(false);
				if (!result.ok) expect(result.code).toBe('INVALID_AMOUNT');
			}
		});

		it('rejects same-entity transfers', () => {
			const result = validateTransaction(
				{
					from_entity_id: 'account-1',
					to_entity_id: 'account-1',
					amount: 1,
					currency: 'USD',
				},
				allEntities
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('SAME_ENTITY');
		});

		it('rejects unknown source entity', () => {
			const result = validateTransaction(
				{ from_entity_id: 'ghost', to_entity_id: 'account-1', amount: 1, currency: 'USD' },
				allEntities
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('MISSING_FROM');
		});

		it('rejects unknown destination entity', () => {
			const result = validateTransaction(
				{ from_entity_id: 'income-1', to_entity_id: 'ghost', amount: 1, currency: 'USD' },
				allEntities
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('MISSING_TO');
		});

		it('rejects deleted source entity', () => {
			const deletedIncome: Entity = { ...income1, is_deleted: true };
			const result = validateTransaction(
				{
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 1,
					currency: 'USD',
				},
				[deletedIncome, account1]
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('DELETED_FROM');
		});

		it('rejects deleted destination entity', () => {
			const deletedAccount: Entity = { ...account1, is_deleted: true };
			const result = validateTransaction(
				{
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 1,
					currency: 'USD',
				},
				[income1, deletedAccount]
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('DELETED_TO');
		});

		it.each([
			['income-1', 'income-2'],
			['income-1', 'category-1'],
			['category-1', 'income-1'],
			['saving-1', 'category-1'],
		])('rejects invalid type pair %s → %s', (from, to) => {
			const result = validateTransaction(
				{ from_entity_id: from, to_entity_id: to, amount: 1, currency: 'USD' },
				allEntities
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('INVALID_PAIR');
		});

		it('rejects entity currency mismatch (USD account → EUR account)', () => {
			const result = validateTransaction(
				{
					from_entity_id: 'account-1',
					to_entity_id: 'account-eur',
					amount: 1,
					currency: 'USD',
				},
				allEntities
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('CURRENCY_MISMATCH');
		});

		it('rejects transaction currency that does not match entities', () => {
			const result = validateTransaction(
				{
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount: 1,
					currency: 'EUR',
				},
				allEntities
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('CURRENCY_MISMATCH');
		});

		it('allows balance-adjustment → account regardless of type rules', () => {
			const result = validateTransaction(
				{
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'account-1',
					amount: 5,
					currency: 'USD',
				},
				allEntities
			);
			expect(result.ok).toBe(true);
		});

		it('rejects balance-adjustment → non-account', () => {
			const result = validateTransaction(
				{
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'category-1',
					amount: 5,
					currency: 'USD',
				},
				allEntities
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('INVALID_PAIR');
		});

		it('allows account → balance-adjustment (downward correction)', () => {
			const result = validateTransaction(
				{
					from_entity_id: 'account-1',
					to_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					amount: 5,
					currency: 'USD',
				},
				allEntities
			);
			expect(result.ok).toBe(true);
		});

		it('rejects balance-adjustment paired with wrong-currency account', () => {
			const result = validateTransaction(
				{
					from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
					to_entity_id: 'account-eur',
					amount: 5,
					currency: 'USD',
				},
				allEntities
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('CURRENCY_MISMATCH');
		});
	});

	describe('validateUpdate', () => {
		const baseTx: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount: 100,
			currency: 'USD',
			timestamp: 1_700_000_000_000,
		};

		it('accepts a no-op update', () => {
			expect(validateUpdate(baseTx, {}, allEntities).ok).toBe(true);
		});

		it('accepts an amount-only patch', () => {
			expect(validateUpdate(baseTx, { amount: 250 }, allEntities).ok).toBe(true);
		});

		it('rejects amount patch that goes to zero', () => {
			const result = validateUpdate(baseTx, { amount: 0 }, allEntities);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('INVALID_AMOUNT');
		});

		it('rejects swap that makes from == to', () => {
			const result = validateUpdate(baseTx, { to_entity_id: 'income-1' }, allEntities);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('SAME_ENTITY');
		});

		it('rejects patch that introduces an invalid type pair', () => {
			const result = validateUpdate(baseTx, { to_entity_id: 'income-2' }, allEntities);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('INVALID_PAIR');
		});

		it('allows editing a transaction whose from-entity has since been deleted', () => {
			// User can still edit amount/note even after the entity was soft-deleted, as
			// long as the patch does not change which entity is referenced on that side.
			const deletedIncome: Entity = { ...income1, is_deleted: true };
			const result = validateUpdate(baseTx, { amount: 5 }, [deletedIncome, account1]);
			expect(result.ok).toBe(true);
		});

		it('rejects a currency-only patch that mismatches the entities', () => {
			// Patch changes only the transaction currency without touching either
			// entity. The cross-check against the entities (USD) must reject EUR.
			const result = validateUpdate(baseTx, { currency: 'EUR' }, allEntities);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('CURRENCY_MISMATCH');
		});

		it('rejects re-pointing TO a deleted entity', () => {
			const deletedCategory: Entity = { ...category1, is_deleted: true };
			const result = validateUpdate(
				{ ...baseTx, from_entity_id: 'account-1', to_entity_id: 'category-2' },
				{ to_entity_id: 'category-1' },
				[account1, deletedCategory, category2]
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('DELETED_TO');
		});
	});

	describe('ensureValid / TransactionValidationError', () => {
		it('does nothing on ok results', () => {
			expect(() => ensureValid({ ok: true })).not.toThrow();
		});

		it('throws TransactionValidationError with code on invalid results', () => {
			try {
				ensureValid({ ok: false, code: 'SAME_ENTITY', message: 'nope' });
				throw new Error('expected throw');
			} catch (e) {
				expect(e).toBeInstanceOf(TransactionValidationError);
				expect((e as TransactionValidationError).code).toBe('SAME_ENTITY');
				expect((e as Error).message).toBe('nope');
			}
		});
	});
});
