import {
	formatAmount,
	formatAmountForInput,
	getProgressPercent,
	isOverspent,
	reverseFormatCurrency,
	parseAmountToMinor,
	getCurrencySymbol,
	DEFAULT_CURRENCY,
} from '../format';

// KII-120: formatAmount / formatAmountForInput take integer minor units
// (cents for EUR, etc.). Tests below use minor-unit inputs and assert the
// formatted major-unit string the user sees.

describe('formatAmount', () => {
	test('formats positive minor-unit amounts as major decimals', () => {
		expect(formatAmount(123450)).toBe('1,234.50'); // €1,234.50
		expect(formatAmount(0)).toBe('0.00');
	});

	test('formats negative amounts with minus sign', () => {
		expect(formatAmount(-123450)).toBe('-1,234.50');
	});

	test('does not display negative zero', () => {
		// Minor-unit inputs are exact integers — there's no float "tiny negative"
		// path in production any more; JS `-0` still normalizes to "0.00".
		expect(formatAmount(-0)).toBe('0.00');
	});

	test('coerces non-finite input to 0.00 (defensive — no "NaN" leaking to UI)', () => {
		// Should never happen in practice (every callsite passes a DB-sourced
		// integer or `toMinor` result), but a stray NaN must not leak into the
		// rendered amount.
		expect(formatAmount(NaN)).toBe('0.00');
		expect(formatAmount(Infinity)).toBe('0.00');
		expect(formatAmount(-Infinity)).toBe('0.00');
	});

	test('handles per-currency zero with the right decimal precision', () => {
		expect(formatAmount(0, 'EUR')).toBe('0.00');
		expect(formatAmount(0, 'JPY')).toBe('0');
		expect(formatAmount(0, 'BHD')).toBe('0.000');
	});
});

describe('formatAmountForInput', () => {
	// Locale-aware separator, no thousands grouping, no forced trailing zeros —
	// suitable for putting back into an editable amount input.

	test('preserves whole-major amounts without forced .00', () => {
		expect(formatAmountForInput(10000)).toBe('100'); // 100 EUR
		expect(formatAmountForInput(5000)).toBe('50');
		expect(formatAmountForInput(250000)).toBe('2500');
	});

	test('keeps fractional cents as decimals', () => {
		expect(formatAmountForInput(115)).toBe('1.15');
		expect(formatAmountForInput(8170)).toBe('81.7');
	});

	test('drops thousands grouping so the input stays clean', () => {
		// formatAmount produces "1,234.50"; the input variant must not group.
		expect(formatAmountForInput(123450)).toBe('1234.5');
		expect(formatAmountForInput(1000000)).toBe('10000');
	});

	test('handles zero', () => {
		expect(formatAmountForInput(0)).toBe('0');
	});

	test('handles negative amounts', () => {
		expect(formatAmountForInput(-10000)).toBe('-100');
		expect(formatAmountForInput(-115)).toBe('-1.15');
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

describe('formatAmount with currency precision', () => {
	test('USD → 2 decimals', () => {
		// 123450 minor units = $1,234.50
		const out = formatAmount(123450, 'USD');
		expect(out).toMatch(/\.50$/);
	});

	test('JPY → 0 decimals', () => {
		// 1235 minor units = ¥1,235 (JPY has no fractional units)
		const out = formatAmount(1235, 'JPY');
		expect(out).not.toMatch(/\./);
		expect(out).toMatch(/1[.,  ]?235/);
	});

	test('BHD → 3 decimals', () => {
		// 1234500 minor units = 1234.500 BHD
		const out = formatAmount(1234500, 'BHD');
		expect(out).toMatch(/\.500$/);
	});
});

describe('formatAmountForInput with currency precision', () => {
	test('USD keeps 2-dp ceiling', () => {
		// 1235 minor = $12.35
		expect(formatAmountForInput(1235, 'USD')).toMatch(/^12[.,]35$/);
	});

	test('JPY drops fractional digits', () => {
		expect(formatAmountForInput(13, 'JPY')).toMatch(/^13$/);
	});

	test('BHD keeps 3 dp', () => {
		// 12346 minor = 12.346 BHD
		expect(formatAmountForInput(12346, 'BHD')).toMatch(/^12[.,]346$/);
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
		// User types "1,15" expecting 1.15 (European locales).
		expect(reverseFormatCurrency('1,15')).toBe(1.15);
		expect(reverseFormatCurrency('100,50')).toBe(100.5);
	});

	test('should handle amounts with thousands separators', () => {
		// US style: 1,234.56
		expect(reverseFormatCurrency('1,234.56')).toBe(1234.56);
		// European style: 1.234,56
		expect(reverseFormatCurrency('1.234,56')).toBe(1234.56);
	});
});

describe('parseAmountToMinor', () => {
	test('parses major-unit user input into integer minor units', () => {
		expect(parseAmountToMinor('1.15', 'EUR')).toBe(115);
		expect(parseAmountToMinor('100', 'EUR')).toBe(10000);
		expect(parseAmountToMinor('1234.56', 'USD')).toBe(123456);
	});

	test('handles zero-decimal currencies (JPY)', () => {
		expect(parseAmountToMinor('1234', 'JPY')).toBe(1234);
	});

	test('returns NaN for unparseable input', () => {
		expect(parseAmountToMinor('abc', 'EUR')).toBeNaN();
		expect(parseAmountToMinor('', 'EUR')).toBeNaN();
	});

	// Caveat: `reverseFormatCurrency` treats more than 2 digits after the
	// last separator as a thousands separator (so `'1.234'` parses to 1234,
	// not 1.234). This is invisible on the live path because
	// `sanitizeAmountInput` caps decimals to the per-currency max before
	// `parseAmountToMinor` ever sees the string. A BHD-aware parser would
	// be a separate refactor — out of scope for KII-120.
});
