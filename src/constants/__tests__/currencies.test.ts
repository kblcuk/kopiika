import { describe, expect, test } from 'bun:test';
import { CURRENCY_OPTIONS, CURRENCY_SYMBOLS, normalizeCurrencyCode } from '../currencies';

describe('currency options', () => {
	test('exposes known currencies with symbol and name', () => {
		expect(CURRENCY_OPTIONS.length).toBeGreaterThan(12);
		const eur = CURRENCY_OPTIONS.find((c) => c.code === 'EUR');
		expect(eur).toEqual({ code: 'EUR', symbol: '€', name: 'Euro' });
	});

	test('every option has a unique three-letter uppercase code', () => {
		const codes = CURRENCY_OPTIONS.map((c) => c.code);
		expect(new Set(codes).size).toBe(codes.length);
		for (const code of codes) expect(code).toMatch(/^[A-Z]{3}$/);
	});

	test('CURRENCY_SYMBOLS is derived from the options', () => {
		expect(CURRENCY_SYMBOLS.EUR).toBe('€');
		expect(CURRENCY_SYMBOLS.JPY).toBe('¥');
		expect(Object.keys(CURRENCY_SYMBOLS)).toHaveLength(CURRENCY_OPTIONS.length);
	});
});

describe('normalizeCurrencyCode', () => {
	test('uppercases and trims a well-formed code', () => {
		expect(normalizeCurrencyCode(' gbp ')).toBe('GBP');
		expect(normalizeCurrencyCode('sgd')).toBe('SGD');
	});

	test('rejects anything that is not exactly three letters', () => {
		expect(normalizeCurrencyCode('EU')).toBeNull();
		expect(normalizeCurrencyCode('EURO')).toBeNull();
		expect(normalizeCurrencyCode('E1R')).toBeNull();
		expect(normalizeCurrencyCode('')).toBeNull();
		expect(normalizeCurrencyCode('   ')).toBeNull();
	});
});
