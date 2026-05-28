import { describe, expect, test } from 'bun:test';
import { sanitizeAmountInput, sanitizeExpressionInput } from '../sanitize-amount';

describe('sanitizeAmountInput', () => {
	const dp2 = { maxDecimalPlaces: 2 };
	const dp0 = { maxDecimalPlaces: 0 };
	const dp3 = { maxDecimalPlaces: 3 };

	test.each([
		['', dp2, ''],
		['24', dp2, '24'],
		['24.5', dp2, '24.5'],
		['24.50', dp2, '24.50'],
		['24.24.24.24.24', dp2, '24.24'],
		['24,24.24', dp2, '24.24'],
		['24.4204300034', dp2, '24.42'],
		['abc24.5xyz', dp2, '24.5'],
		['.', dp2, '.'],
		['.5', dp2, '.5'],
		['24.', dp2, '24.'],
		['24.5', dp0, '24'],
		['24,5', dp3, '24.5'],
		['24.456', dp3, '24.456'],
		['24.4567', dp3, '24.456'],
	])('sanitize(%j, dp=%o) → %j', (input, opts, expected) => {
		expect(sanitizeAmountInput(input, opts)).toBe(expected);
	});

	test('idempotent across all cases', () => {
		const cases: [string, { maxDecimalPlaces: number }][] = [
			['24.24.24.24.24', dp2],
			['24,24.24', dp2],
			['24.4567', dp3],
			['abc24.5xyz', dp2],
		];
		for (const [input, opts] of cases) {
			const once = sanitizeAmountInput(input, opts);
			expect(sanitizeAmountInput(once, opts)).toBe(once);
		}
	});
});

describe('sanitizeExpressionInput', () => {
	const dp2 = { maxDecimalPlaces: 2 };

	test.each([
		['12.5+3.2', dp2, '12.5+3.2'],
		['12.5.5+3', dp2, '12.55+3'],
		['12.505+3.2', dp2, '12.50+3.2'],
		['12abc+3', dp2, '12+3'],
		['  12 + 3  ', dp2, '  12 + 3  '],
		['(12+3)*2', dp2, '(12+3)*2'],
		['12,5+3,2', dp2, '12.5+3.2'],
		['1/3', dp2, '1/3'],
		['-12+3', dp2, '-12+3'],
		// Unicode operators from the toolbar must survive.
		['12−×3', dp2, '12−×3'],
		['(5÷2)+1.5', dp2, '(5÷2)+1.5'],
	])('expression(%j, dp=%o) → %j', (input, opts, expected) => {
		expect(sanitizeExpressionInput(input, opts)).toBe(expected);
	});

	test('idempotent', () => {
		const cases = ['12.5.5+3', '12abc+3', '12,5+3,2'];
		for (const input of cases) {
			const once = sanitizeExpressionInput(input, dp2);
			expect(sanitizeExpressionInput(once, dp2)).toBe(once);
		}
	});
});
