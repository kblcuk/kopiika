import { tryInsertOperator, normalizeDecimalSeparator } from '../expression-input';

// Helper: insert at end of string
function insertAtEnd(value: string, op: string) {
	return tryInsertOperator(value, op, value.length, value.length);
}

describe('tryInsertOperator', () => {
	describe('arithmetic operators (+−×÷)', () => {
		test('allowed after digit', () => {
			expect(insertAtEnd('5', '+')).toEqual({ value: '5+', cursor: 2 });
			expect(insertAtEnd('42', '\u2212')).toEqual({ value: '42\u2212', cursor: 3 });
			expect(insertAtEnd('3.5', '\u00D7')).toEqual({ value: '3.5\u00D7', cursor: 4 });
		});

		test('allowed after )', () => {
			expect(insertAtEnd('(5)', '+')).toEqual({ value: '(5)+', cursor: 4 });
		});

		test('rejected at start', () => {
			expect(insertAtEnd('', '+')).toBeNull();
			expect(insertAtEnd('', '\u00F7')).toBeNull();
		});

		test('rejected after (', () => {
			expect(insertAtEnd('(', '+')).toBeNull();
			expect(insertAtEnd('(', '\u00D7')).toBeNull();
		});

		test('replaces trailing arithmetic op', () => {
			expect(insertAtEnd('5+', '\u2212')).toEqual({ value: '5\u2212', cursor: 2 });
			expect(insertAtEnd('5\u00D7', '+')).toEqual({ value: '5+', cursor: 2 });
		});
	});

	describe('open paren (', () => {
		test('allowed at start', () => {
			expect(insertAtEnd('', '(')).toEqual({ value: '(', cursor: 1 });
		});

		test('allowed after arithmetic op', () => {
			expect(insertAtEnd('5+', '(')).toEqual({ value: '5+(', cursor: 3 });
		});

		test('allowed after another (', () => {
			expect(insertAtEnd('(', '(')).toEqual({ value: '((', cursor: 2 });
		});

		test('rejected after digit (implicit multiply)', () => {
			expect(insertAtEnd('5', '(')).toBeNull();
			expect(insertAtEnd('42', '(')).toBeNull();
		});

		test('rejected after )', () => {
			expect(insertAtEnd('(5)', '(')).toBeNull();
		});
	});

	describe('close paren )', () => {
		test('allowed after digit when ( is unmatched', () => {
			expect(insertAtEnd('(5', ')')).toEqual({ value: '(5)', cursor: 3 });
		});

		test('allowed after ) when outer ( is unmatched', () => {
			expect(insertAtEnd('((5)', ')')).toEqual({ value: '((5))', cursor: 5 });
		});

		test('rejected when no unmatched (', () => {
			expect(insertAtEnd('5', ')')).toBeNull();
			expect(insertAtEnd('(5)', ')')).toBeNull();
		});

		test('rejected at start', () => {
			expect(insertAtEnd('', ')')).toBeNull();
		});

		test('rejected after arithmetic op', () => {
			expect(insertAtEnd('(5+', ')')).toBeNull();
		});

		test('rejected after (', () => {
			expect(insertAtEnd('(', ')')).toBeNull();
		});
	});

	describe('cursor position (mid-string insertion)', () => {
		test('inserts at cursor position, not end', () => {
			// "10|20" → insert + at position 2 → "10+20"
			expect(tryInsertOperator('1020', '+', 2, 2)).toEqual({
				value: '10+20',
				cursor: 3,
			});
		});

		test('replaces selection range', () => {
			// "10[+]20" (selection 2..3) → replace with × → "10×20"
			expect(tryInsertOperator('10+20', '\u00D7', 2, 3)).toEqual({
				value: '10\u00D720',
				cursor: 3,
			});
		});
	});

	describe('complex expressions', () => {
		test('building (9+12)×3 step by step', () => {
			let expr = '';
			let r;

			r = insertAtEnd(expr, '(');
			expect(r).not.toBeNull();
			expr = r!.value; // (

			// Type 9 via keyboard (not operator)
			expr += '9'; // (9

			r = insertAtEnd(expr, '+');
			expect(r).not.toBeNull();
			expr = r!.value; // (9+

			// Type 12
			expr += '12'; // (9+12

			r = insertAtEnd(expr, ')');
			expect(r).not.toBeNull();
			expr = r!.value; // (9+12)

			r = insertAtEnd(expr, '\u00D7');
			expect(r).not.toBeNull();
			expr = r!.value; // (9+12)×

			// Type 3
			expr += '3'; // (9+12)×3

			expect(expr).toBe('(9+12)\u00D73');
		});

		test('rejects 34(34) — no implicit multiply', () => {
			expect(insertAtEnd('34', '(')).toBeNull();
		});

		test('rejects (*34 — op after open paren', () => {
			expect(insertAtEnd('(', '\u00D7')).toBeNull();
		});

		test('rejects unbalanced close', () => {
			expect(insertAtEnd('(5)+3', ')')).toBeNull();
		});
	});
});

describe('normalizeDecimalSeparator', () => {
	test('replaces comma with dot', () => {
		expect(normalizeDecimalSeparator('1,5')).toBe('1.5');
	});

	test('replaces multiple commas', () => {
		expect(normalizeDecimalSeparator('1,5+2,5')).toBe('1.5+2.5');
	});

	test('leaves dots unchanged', () => {
		expect(normalizeDecimalSeparator('1.5')).toBe('1.5');
	});

	test('no-op on plain numbers', () => {
		expect(normalizeDecimalSeparator('42')).toBe('42');
	});
});
