import {
	roundMoney,
	formatAmount,
	getProgressPercent,
	isOverspent,
	reverseFormatCurrency,
	getCurrencySymbol,
	DEFAULT_CURRENCY,
} from '../format';

describe('roundMoney', () => {
	test('should round to 2 decimal places', () => {
		expect(roundMoney(1.155)).toBe(1.16);
		expect(roundMoney(1.154)).toBe(1.15);
		expect(roundMoney(1.15)).toBe(1.15);
	});

	test('should handle floating point precision issues', () => {
		// Classic floating point issue: 0.1 + 0.2 = 0.30000000000000004
		expect(roundMoney(0.1 + 0.2)).toBe(0.3);

		// Simulated precision issue like 1.1500000000091
		expect(roundMoney(1.1500000000091)).toBe(1.15);
		expect(roundMoney(1.1499999999909)).toBe(1.15);
	});

	test('should handle whole numbers', () => {
		expect(roundMoney(5)).toBe(5);
		expect(roundMoney(100)).toBe(100);
	});

	test('should handle negative amounts', () => {
		// Math.round rounds towards zero for negative numbers at .5
		expect(roundMoney(-1.156)).toBe(-1.16);
		expect(roundMoney(-1.154)).toBe(-1.15);
	});

	test('should handle zero', () => {
		expect(roundMoney(0)).toBe(0);
	});
});

describe('formatAmount', () => {
	test('should format positive amounts with 2 decimal places', () => {
		expect(formatAmount(1234.5)).toBe('1,234.50');
		expect(formatAmount(0)).toBe('0.00');
	});

	test('should format negative amounts with minus sign', () => {
		expect(formatAmount(-1234.5)).toBe('-1,234.50');
	});
});

describe('getProgressPercent', () => {
	test('should calculate percentage correctly', () => {
		expect(getProgressPercent(50, 100)).toBe(50);
		expect(getProgressPercent(100, 100)).toBe(100);
		expect(getProgressPercent(150, 100)).toBe(150);
	});

	test('should handle zero planned', () => {
		expect(getProgressPercent(50, 0)).toBe(100);
		expect(getProgressPercent(0, 0)).toBe(0);
	});
});

describe('isOverspent', () => {
	test('should return true when actual exceeds planned', () => {
		expect(isOverspent(150, 100)).toBe(true);
	});

	test('should return false when actual is within planned', () => {
		expect(isOverspent(50, 100)).toBe(false);
		expect(isOverspent(100, 100)).toBe(false);
	});

	test('should return false when planned is zero', () => {
		expect(isOverspent(50, 0)).toBe(false);
	});
});

describe('DEFAULT_CURRENCY', () => {
	test('should be EUR', () => {
		expect(DEFAULT_CURRENCY).toBe('EUR');
	});
});

describe('getCurrencySymbol', () => {
	test('should return symbol for known currencies', () => {
		expect(getCurrencySymbol('EUR')).toBe('€');
		expect(getCurrencySymbol('USD')).toBe('$');
		expect(getCurrencySymbol('GBP')).toBe('£');
		expect(getCurrencySymbol('UAH')).toBe('₴');
	});

	test('should be case-insensitive', () => {
		expect(getCurrencySymbol('eur')).toBe('€');
		expect(getCurrencySymbol('usd')).toBe('$');
	});

	test('should fall back to the code for unknown currencies', () => {
		expect(getCurrencySymbol('XYZ')).toBe('XYZ');
	});
});

describe('reverseFormatCurrency', () => {
	test('should parse amounts with dot as decimal separator', () => {
		expect(reverseFormatCurrency('1.15')).toBe(1.15);
		expect(reverseFormatCurrency('100.50')).toBe(100.5);
		expect(reverseFormatCurrency('1234.56')).toBe(1234.56);
	});

	test('should parse whole numbers', () => {
		expect(reverseFormatCurrency('100')).toBe(100);
		expect(reverseFormatCurrency('1')).toBe(1);
	});

	test('should parse amounts with comma as decimal separator', () => {
		// This is the bug case: user types "1,15" expecting 1.15
		// On European locales, comma is the decimal separator
		expect(reverseFormatCurrency('1,15')).toBe(1.15);
		expect(reverseFormatCurrency('100,50')).toBe(100.5);
	});

	test('should handle amounts with thousands separators', () => {
		// US style: 1,234.56
		expect(reverseFormatCurrency('1,234.56')).toBeCloseTo(1234.56, 2);
		// European style: 1.234,56
		expect(reverseFormatCurrency('1.234,56')).toBeCloseTo(1234.56, 2);
	});
});
