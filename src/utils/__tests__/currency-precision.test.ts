import { describe, expect, test } from 'bun:test';
import { getCurrencyDecimalPlaces } from '../currency-precision';

describe('getCurrencyDecimalPlaces', () => {
	test('USD → 2', () => {
		expect(getCurrencyDecimalPlaces('USD')).toBe(2);
	});

	test('EUR → 2', () => {
		expect(getCurrencyDecimalPlaces('EUR')).toBe(2);
	});

	test('JPY → 0 (no fractional unit)', () => {
		expect(getCurrencyDecimalPlaces('JPY')).toBe(0);
	});

	test('BHD → 3 (Bahraini dinar)', () => {
		expect(getCurrencyDecimalPlaces('BHD')).toBe(3);
	});

	test('unknown code falls back to 2', () => {
		expect(getCurrencyDecimalPlaces('ZZZ')).toBe(2);
	});

	test('memoizes results (second call does not re-invoke Intl)', () => {
		const original = Intl.NumberFormat;
		let calls = 0;
		const patched = function (
			this: unknown,
			...args: ConstructorParameters<typeof Intl.NumberFormat>
		) {
			calls++;
			return new original(...args);
		} as unknown as typeof Intl.NumberFormat;
		(Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = patched;
		try {
			expect(getCurrencyDecimalPlaces('AED')).toBe(2); // 1st: invokes Intl
			const after1 = calls;
			expect(getCurrencyDecimalPlaces('AED')).toBe(2); // 2nd: must hit cache
			expect(calls).toBe(after1); // no additional Intl call
		} finally {
			(Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = original;
		}
	});
});
