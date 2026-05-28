import { describe, expect, test } from 'bun:test';
import { sanitizeAmountInput } from '../sanitize-amount';

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
