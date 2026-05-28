import {
	roundMoney,
	formatAmount,
	formatAmountForInput,
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

	test('should not display negative zero', () => {
		// Tiny negative from floating-point accumulation rounds to "0.00", not "-0.00"
		expect(formatAmount(-0.001)).toBe('0.00');
		expect(formatAmount(-0.004)).toBe('0.00');
		expect(formatAmount(-0.005)).toBe('0.00');
		expect(formatAmount(-0.0000001)).toBe('0.00');
		// JS negative zero
		expect(formatAmount(-0)).toBe('0.00');
	});
});

describe('formatAmountForInput', () => {
	// Locale-aware separator, no thousands grouping, no forced trailing zeros —
	// suitable for putting back into an editable amount input so the value the
	// user sees from a chip tap or edit-mode initial load matches what they
	// would have typed themselves.

	test('preserves integer shape (no forced .00)', () => {
		// en-US test locale
		expect(formatAmountForInput(100)).toBe('100');
		expect(formatAmountForInput(50)).toBe('50');
		expect(formatAmountForInput(2500)).toBe('2500');
	});

	test('keeps decimals up to two places', () => {
		expect(formatAmountForInput(1.15)).toBe('1.15');
		expect(formatAmountForInput(81.7)).toBe('81.7');
	});

	test('rounds beyond two decimals', () => {
		expect(formatAmountForInput(1.155)).toBe('1.16');
		expect(formatAmountForInput(1.1500000000091)).toBe('1.15');
	});

	test('drops thousands grouping so the input stays clean', () => {
		// formatAmount produces "1,234.50"; the input variant must not group.
		expect(formatAmountForInput(1234.5)).toBe('1234.5');
		expect(formatAmountForInput(10000)).toBe('10000');
	});

	test('handles zero and tiny negatives', () => {
		expect(formatAmountForInput(0)).toBe('0');
		// Tiny floating-point negatives normalize to 0 like formatAmount.
		expect(formatAmountForInput(-0.001)).toBe('0');
	});

	test('handles negative amounts', () => {
		expect(formatAmountForInput(-100)).toBe('-100');
		expect(formatAmountForInput(-1.15)).toBe('-1.15');
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

describe('roundMoney with decimal places', () => {
	test('default 2 dp preserved (back-compat)', () => {
		expect(roundMoney(1.235)).toBe(1.24);
	});

	test('explicit 2 dp', () => {
		expect(roundMoney(1.235, 2)).toBe(1.24);
	});

	test('0 dp (JPY)', () => {
		expect(roundMoney(1.235, 0)).toBe(1);
		expect(roundMoney(1.5, 0)).toBe(2);
	});

	test('3 dp (BHD)', () => {
		expect(roundMoney(1.2355, 3)).toBe(1.236);
		expect(roundMoney(1.2354, 3)).toBe(1.235);
	});
});

describe('formatAmount with currency precision', () => {
	test('USD → 2 decimals', () => {
		// Use a fixed locale to avoid CI flakiness; assert digit count not exact string.
		const out = formatAmount(1234.5, 'USD');
		expect(out).toMatch(/\.50$/);
	});

	test('JPY → 0 decimals', () => {
		const out = formatAmount(1234.5, 'JPY');
		expect(out).not.toMatch(/\./);
		expect(out).toMatch(/1[.,  ]?23[45]/); // rounded to whole
	});

	test('BHD → 3 decimals', () => {
		const out = formatAmount(1234.5, 'BHD');
		expect(out).toMatch(/\.500$/);
	});
});

describe('formatAmountForInput with currency precision', () => {
	test('USD keeps 2-dp ceiling', () => {
		expect(formatAmountForInput(12.345, 'USD')).toMatch(/^12[.,]35$/);
	});

	test('JPY drops fractional digits', () => {
		expect(formatAmountForInput(12.5, 'JPY')).toMatch(/^13$/);
	});

	test('BHD keeps 3 dp', () => {
		expect(formatAmountForInput(12.3456, 'BHD')).toMatch(/^12[.,]346$/);
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
