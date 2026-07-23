import { describe, it, expect } from 'bun:test';
import { parseFlexibleDate, parseDecimalToMinor } from '../formats';

describe('parseFlexibleDate', () => {
	it('parses ISO YYYY-MM-DD to local-midnight ms', () => {
		const ms = parseFlexibleDate('2026-07-12', 'YYYY-MM-DD');
		expect(ms).toBe(new Date(2026, 6, 12).getTime());
	});
	it('parses DD.MM.YYYY', () => {
		const ms = parseFlexibleDate('12.07.2026', 'DD.MM.YYYY');
		expect(ms).toBe(new Date(2026, 6, 12).getTime());
	});
	it('parses MM/DD/YYYY distinctly from DD/MM/YYYY', () => {
		expect(parseFlexibleDate('07/12/2026', 'MM/DD/YYYY')).toBe(new Date(2026, 6, 12).getTime());
		expect(parseFlexibleDate('07/12/2026', 'DD/MM/YYYY')).toBe(new Date(2026, 11, 7).getTime());
	});
	it('parses a datetime by keying on the civil date only (Revolut space-separated)', () => {
		expect(parseFlexibleDate('2026-06-01 12:30:34', 'YYYY-MM-DD')).toBe(
			new Date(2026, 5, 1).getTime()
		);
	});
	it('parses an ISO datetime with T separator and trailing zone', () => {
		expect(parseFlexibleDate('2026-06-01T12:30:34Z', 'YYYY-MM-DD')).toBe(
			new Date(2026, 5, 1).getTime()
		);
	});
	it('parses a datetime for non-ISO formats too', () => {
		expect(parseFlexibleDate('01.06.2026 12:30', 'DD.MM.YYYY')).toBe(
			new Date(2026, 5, 1).getTime()
		);
	});
	it('returns null on garbage', () => {
		expect(parseFlexibleDate('not-a-date', 'YYYY-MM-DD')).toBeNull();
		expect(parseFlexibleDate('2026-13-40', 'YYYY-MM-DD')).toBeNull();
		expect(parseFlexibleDate('12:30:34', 'YYYY-MM-DD')).toBeNull();
	});
});

describe('parseDecimalToMinor', () => {
	it('parses dot-decimal with thousands commas', () => {
		expect(parseDecimalToMinor('1,234.56', '.')).toBe(123456);
	});
	it('parses comma-decimal with thousands dots', () => {
		expect(parseDecimalToMinor('1.234,56', ',')).toBe(123456);
	});
	it('keeps sign and handles negative', () => {
		expect(parseDecimalToMinor('-250.00', '.')).toBe(-25000);
		expect(parseDecimalToMinor('−250,00', ',')).toBe(-25000); // unicode minus
	});
	it('strips currency symbols and spaces', () => {
		expect(parseDecimalToMinor('€ 1 200,50', ',')).toBe(120050);
	});
	it('returns null when no digits', () => {
		expect(parseDecimalToMinor('', '.')).toBeNull();
		expect(parseDecimalToMinor('abc', '.')).toBeNull();
	});
});
