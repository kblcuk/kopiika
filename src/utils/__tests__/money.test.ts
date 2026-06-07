import { describe, it, expect } from '@jest/globals';
import { toMinor, toMajor } from '../money';

describe('money', () => {
	describe('toMinor', () => {
		it('converts EUR major units to integer cents', () => {
			expect(toMinor(43.21, 'EUR')).toBe(4321);
			expect(toMinor(0.01, 'EUR')).toBe(1);
			expect(toMinor(1000, 'EUR')).toBe(100000);
		});

		it('handles zero and negative amounts', () => {
			expect(toMinor(0, 'EUR')).toBe(0);
			expect(toMinor(-43.21, 'EUR')).toBe(-4321);
		});

		it('absorbs accumulated float drift via Math.round', () => {
			// (0.1 + 0.2) * 100 = 30.000000000000004 — rounds to 30
			expect(toMinor(0.1 + 0.2, 'EUR')).toBe(30);
			// 43.21000000001 * 100 = 4321.000001 — rounds to 4321
			expect(toMinor(43.21000000001, 'EUR')).toBe(4321);
		});

		it('respects zero-decimal currencies (JPY)', () => {
			expect(toMinor(1234, 'JPY')).toBe(1234);
			expect(toMinor(0.4, 'JPY')).toBe(0);
			expect(toMinor(0.5, 'JPY')).toBe(1);
		});

		it('respects three-decimal currencies (BHD)', () => {
			expect(toMinor(1.234, 'BHD')).toBe(1234);
			expect(toMinor(0.001, 'BHD')).toBe(1);
		});

		it('returns NaN for non-finite input', () => {
			expect(toMinor(NaN, 'EUR')).toBeNaN();
			expect(toMinor(Infinity, 'EUR')).toBeNaN();
			expect(toMinor(-Infinity, 'EUR')).toBeNaN();
		});

		it('preserves sign on negative input', () => {
			expect(toMinor(-43.21, 'EUR')).toBe(-4321);
			expect(toMinor(-0.01, 'EUR')).toBe(-1);
		});

		it('rounds half toward +infinity (JS Math.round semantics)', () => {
			// Math.round rounds .5 towards +infinity. Document the asymmetry
			// so a future maintainer hitting it knows it's intentional.
			expect(toMinor(0.005, 'EUR')).toBe(1); // 0.5 cents → 1
			// -0.5 cents → 0; toBe(0) succeeds because -0 === 0 in JS, but use
			// Object.is to assert the absolute value matches expectation.
			expect(Math.abs(toMinor(-0.005, 'EUR'))).toBe(0);
		});

		it('handles large amounts without precision loss', () => {
			// 90 billion EUR in cents — comfortably under Number.MAX_SAFE_INTEGER
			expect(toMinor(90_000_000_000, 'EUR')).toBe(9_000_000_000_000);
		});
	});

	describe('toMajor', () => {
		it('converts integer cents back to EUR major units', () => {
			expect(toMajor(4321, 'EUR')).toBe(43.21);
			expect(toMajor(1, 'EUR')).toBe(0.01);
			expect(toMajor(100000, 'EUR')).toBe(1000);
		});

		it('handles zero and negative amounts', () => {
			expect(toMajor(0, 'EUR')).toBe(0);
			expect(toMajor(-4321, 'EUR')).toBe(-43.21);
		});

		it('respects zero-decimal currencies (JPY)', () => {
			expect(toMajor(1234, 'JPY')).toBe(1234);
		});

		it('respects three-decimal currencies (BHD)', () => {
			expect(toMajor(1234, 'BHD')).toBe(1.234);
		});

		it('rounds non-integer input defensively rather than crashing', () => {
			// 4321.5 minor units shouldn't realistically arrive, but if it does
			// we want a sensible display value, not NaN or a crash.
			expect(toMajor(4321.5, 'EUR')).toBe(43.22);
		});

		it('returns NaN for non-finite input (defensive)', () => {
			expect(toMajor(NaN, 'EUR')).toBeNaN();
			expect(toMajor(Infinity, 'EUR')).toBeNaN();
			expect(toMajor(-Infinity, 'EUR')).toBeNaN();
		});

		it('handles JS -0 by returning 0 (no signed zero leakage)', () => {
			// `-0 === 0` in JS, but `Object.is(-0, 0)` is false. Callers depend
			// on toMajor(0, ...) producing a clean 0 for downstream `|| 0` to
			// normalize -0 from formatAmount.
			expect(Object.is(toMajor(0, 'EUR'), 0)).toBe(true);
		});
	});

	describe('round-trip', () => {
		it('toMajor(toMinor(x)) is exact for representable EUR amounts', () => {
			const cases = [0, 1, 12.34, 43.21, 1000.99, -55.5];
			for (const x of cases) {
				expect(toMajor(toMinor(x, 'EUR'), 'EUR')).toBe(x);
			}
		});

		it('sums of minor units are exact (no float drift)', () => {
			// The bug this migration fixes: 0.1 + 0.2 + 0.3 + 0.45 + 0.4 = 1.4500000000000002
			// in float; with minor units, it's exactly 145.
			const minors = [10, 20, 30, 45, 40].map((m) => m);
			const sum = minors.reduce((a, b) => a + b, 0);
			expect(sum).toBe(145);
			expect(toMajor(sum, 'EUR')).toBe(1.45);
		});
	});
});
