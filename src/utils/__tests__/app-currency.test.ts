import { describe, expect, test } from 'bun:test';
import type { Entity } from '@/src/types';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { resolveAppCurrency } from '../app-currency';

function entity(overrides: Partial<Entity> = {}): Entity {
	return {
		id: 'e-1',
		type: 'account',
		name: 'Main Card',
		currency: 'GBP',
		row: 0,
		position: 0,
		...overrides,
	};
}

describe('resolveAppCurrency', () => {
	test('uses the currency of an existing user entity', () => {
		expect(resolveAppCurrency([entity({ currency: 'GBP' })], 'USD')).toBe('GBP');
	});

	test('ignores the balance-adjustment system entity', () => {
		// The system entity is re-created as EUR on any hydration where it is
		// missing, so after a data reset it can predate every user entity. If it
		// won the lookup a GBP user would silently revert to EUR.
		const rows = [
			entity({ id: BALANCE_ADJUSTMENT_ENTITY_ID, currency: 'EUR' }),
			entity({ id: 'e-2', currency: 'GBP' }),
		];
		expect(resolveAppCurrency(rows, null)).toBe('GBP');
	});

	test('falls back to the pref when only the system entity exists', () => {
		const rows = [entity({ id: BALANCE_ADJUSTMENT_ENTITY_ID, currency: 'EUR' })];
		expect(resolveAppCurrency(rows, 'JPY')).toBe('JPY');
	});

	test('ignores deleted entities', () => {
		const rows = [
			entity({ id: 'e-1', currency: 'UAH', is_deleted: true }),
			entity({ id: 'e-2', currency: 'PLN' }),
		];
		expect(resolveAppCurrency(rows, null)).toBe('PLN');
	});

	test('uses the pref when there are no entities at all', () => {
		expect(resolveAppCurrency([], 'CZK')).toBe('CZK');
	});

	test('falls back to the default constant with no entities and no pref', () => {
		expect(resolveAppCurrency([], null)).toBe('EUR');
	});
});
