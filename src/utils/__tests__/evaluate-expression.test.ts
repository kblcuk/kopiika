import { evaluateExpression } from '../evaluate-expression';

describe('evaluateExpression', () => {
	test('basic addition', () => {
		expect(evaluateExpression('2+3')).toBe(5);
		expect(evaluateExpression('10+60')).toBe(70);
	});

	test('basic subtraction (Unicode −)', () => {
		expect(evaluateExpression('10\u22123')).toBe(7);
	});

	test('basic subtraction (ASCII -)', () => {
		expect(evaluateExpression('10-3')).toBe(7);
	});

	test('basic multiplication (Unicode ×)', () => {
		expect(evaluateExpression('4\u00D75')).toBe(20);
	});

	test('basic multiplication (ASCII *)', () => {
		expect(evaluateExpression('4*5')).toBe(20);
	});

	test('basic division (Unicode ÷)', () => {
		expect(evaluateExpression('10\u00F72')).toBe(5);
	});

	test('basic division (ASCII /)', () => {
		expect(evaluateExpression('10/2')).toBe(5);
	});

	test('operator precedence: × before +', () => {
		expect(evaluateExpression('2+3\u00D74')).toBe(14);
	});

	test('operator precedence: ÷ before −', () => {
		expect(evaluateExpression('10\u22126\u00F72')).toBe(7);
	});

	test('chained addition', () => {
		expect(evaluateExpression('1+2+3+4')).toBe(10);
	});

	test('chained mixed precedence', () => {
		expect(evaluateExpression('2\u00D73+4\u00D75')).toBe(26);
	});

	test('decimals', () => {
		expect(evaluateExpression('1.5+2.5')).toBe(4);
		expect(evaluateExpression('0.1+0.2')).toBe(0.3);
	});

	test('single number passthrough', () => {
		expect(evaluateExpression('42')).toBe(42);
		expect(evaluateExpression('3.14')).toBe(3.14);
	});

	test('returns null for empty input', () => {
		expect(evaluateExpression('')).toBeNull();
		expect(evaluateExpression('   ')).toBeNull();
	});

	test('returns null for trailing operator', () => {
		expect(evaluateExpression('10+')).toBeNull();
		expect(evaluateExpression('5\u00D7')).toBeNull();
	});

	test('returns null for leading operator', () => {
		expect(evaluateExpression('+5')).toBeNull();
		expect(evaluateExpression('\u00D73')).toBeNull();
	});

	test('returns null for non-numeric input', () => {
		expect(evaluateExpression('abc')).toBeNull();
	});

	test('returns null for division by zero', () => {
		expect(evaluateExpression('10\u00F70')).toBeNull();
		expect(evaluateExpression('5/0')).toBeNull();
	});

	test('returns null for multiple dots in one number', () => {
		expect(evaluateExpression('1.2.3')).toBeNull();
	});

	test('handles whitespace', () => {
		expect(evaluateExpression(' 10 + 5 ')).toBe(15);
	});

	test('floating-point precision via roundMoney', () => {
		expect(evaluateExpression('0.01+0.02')).toBe(0.03);
	});

	test('parentheses override precedence', () => {
		expect(evaluateExpression('(2+3)\u00D74')).toBe(20);
		expect(evaluateExpression('(9+12)\u00D73')).toBe(63);
	});

	test('nested parentheses', () => {
		expect(evaluateExpression('((2+3))\u00D74')).toBe(20);
	});

	test('returns null for unmatched parentheses', () => {
		expect(evaluateExpression('(2+3')).toBeNull();
		expect(evaluateExpression('2+3)')).toBeNull();
	});
});
