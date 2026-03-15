import { normalizeNumericInput } from '../numeric-input';

describe('normalizeNumericInput', () => {
	test('removes a leading zero before whole numbers', () => {
		expect(normalizeNumericInput('05')).toBe('5');
		expect(normalizeNumericInput('0005')).toBe('5');
	});

	test('preserves zero for decimal values', () => {
		expect(normalizeNumericInput('0.5')).toBe('0.5');
		expect(normalizeNumericInput('0,5')).toBe('0,5');
	});

	test('keeps negative values valid while removing redundant zeroes', () => {
		expect(normalizeNumericInput('-05')).toBe('-5');
		expect(normalizeNumericInput('-0.5')).toBe('-0.5');
	});

	test('collapses multiple zeroes to a single zero', () => {
		expect(normalizeNumericInput('0')).toBe('0');
		expect(normalizeNumericInput('000')).toBe('0');
	});
});
