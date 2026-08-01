import { describe, expect, test } from 'bun:test';
import { endOfLocalDay, isDue } from '../due';

// Local-component constructors throughout: the predicate is defined on the
// device's civil calendar, so building fixtures from UTC strings would make
// these assertions timezone-dependent.
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
	new Date(y, m - 1, d, h, min, 0, 0).getTime();

describe('isDue', () => {
	test('an occurrence later today is due from midnight', () => {
		const now = at(2026, 8, 3, 0, 30);
		expect(isDue(at(2026, 8, 3, 15, 42), now)).toBe(true);
	});

	test('an occurrence earlier today is due', () => {
		expect(isDue(at(2026, 8, 3, 9, 0), at(2026, 8, 3, 15, 42))).toBe(true);
	});

	test('yesterday is due', () => {
		expect(isDue(at(2026, 8, 2, 23, 59), at(2026, 8, 3, 0, 1))).toBe(true);
	});

	test('tomorrow is not due, even one minute out', () => {
		expect(isDue(at(2026, 8, 4, 0, 0), at(2026, 8, 3, 23, 59))).toBe(false);
	});

	test('a later year is not due', () => {
		expect(isDue(at(2027, 1, 1), at(2026, 12, 31, 23, 0))).toBe(false);
	});
});

describe('endOfLocalDay', () => {
	test('returns the last millisecond of the local day', () => {
		const end = endOfLocalDay(at(2026, 8, 3, 9, 15));
		expect(end).toBe(at(2026, 8, 3, 23, 59) + 59_999);
	});

	test('is idempotent when already at end of day', () => {
		const end = endOfLocalDay(at(2026, 8, 3, 9, 15));
		expect(endOfLocalDay(end)).toBe(end);
	});

	test('everything on that day is due at the boundary, the next day is not', () => {
		const end = endOfLocalDay(at(2026, 8, 3, 9, 15));
		expect(isDue(at(2026, 8, 3, 23, 0), end)).toBe(true);
		expect(isDue(at(2026, 8, 4, 0, 0), end)).toBe(false);
	});
});
