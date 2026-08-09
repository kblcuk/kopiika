import { describe, expect, test } from 'bun:test';
import { isSameCivilDay, shiftCivilDate } from '../date-shift';

// Local-component constructors throughout: these functions are defined on the
// device's civil calendar, so building fixtures from UTC strings would make the
// assertions timezone-dependent.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

describe('shiftCivilDate', () => {
	test('shifts days forward and backward', () => {
		expect(shiftCivilDate(at(2026, 8, 9), { days: 1 })).toEqual(at(2026, 8, 10));
		expect(shiftCivilDate(at(2026, 8, 9), { days: -1 })).toEqual(at(2026, 8, 8));
	});

	test('a negative day shift crosses a month boundary', () => {
		expect(shiftCivilDate(at(2026, 8, 1), { days: -1 })).toEqual(at(2026, 7, 31));
	});

	test('preserves time-of-day', () => {
		expect(shiftCivilDate(at(2026, 8, 9, 15, 42), { days: -1 })).toEqual(
			at(2026, 8, 8, 15, 42)
		);
	});

	test('shifts months', () => {
		expect(shiftCivilDate(at(2026, 8, 9), { months: 1 })).toEqual(at(2026, 9, 9));
		expect(shiftCivilDate(at(2026, 8, 9), { months: 6 })).toEqual(at(2027, 2, 9));
	});

	test('clamps the day to the target month, from the base day', () => {
		// Jan 31 + 1 month has no Feb 31 to land on.
		expect(shiftCivilDate(at(2026, 1, 31), { months: 1 })).toEqual(at(2026, 2, 28));
		// The clamp must not leak into a longer target month.
		expect(shiftCivilDate(at(2026, 1, 31), { months: 2 })).toEqual(at(2026, 3, 31));
	});

	test('shifts years', () => {
		expect(shiftCivilDate(at(2026, 8, 9), { years: 1 })).toEqual(at(2027, 8, 9));
	});

	test('clamps Feb 29 onto a non-leap year', () => {
		expect(shiftCivilDate(at(2028, 2, 29), { years: 1 })).toEqual(at(2029, 2, 28));
	});

	test('a shift across a DST boundary keeps the wall-clock time', () => {
		// Northern-hemisphere DST transitions fall in March and October/November.
		// Whatever the runner's zone, a civil-component shift must land on the
		// named day at the named hour — an epoch-offset shift would drift.
		const shifted = shiftCivilDate(at(2026, 3, 8, 12, 0), { days: 1 });
		expect(shifted.getDate()).toBe(9);
		expect(shifted.getHours()).toBe(12);

		const autumn = shiftCivilDate(at(2026, 11, 1, 12, 0), { days: 1 });
		expect(autumn.getDate()).toBe(2);
		expect(autumn.getHours()).toBe(12);
	});

	test('an empty delta returns an equal date', () => {
		expect(shiftCivilDate(at(2026, 8, 9, 15, 42), {})).toEqual(at(2026, 8, 9, 15, 42));
	});
});

describe('isSameCivilDay', () => {
	test('true for the same day at different times', () => {
		expect(isSameCivilDay(at(2026, 8, 9, 0, 1), at(2026, 8, 9, 23, 59))).toBe(true);
	});

	test('false one minute across midnight', () => {
		expect(isSameCivilDay(at(2026, 8, 9, 23, 59), at(2026, 8, 10, 0, 0))).toBe(false);
	});

	test('false for the same day-of-month in a different month or year', () => {
		expect(isSameCivilDay(at(2026, 8, 9), at(2026, 9, 9))).toBe(false);
		expect(isSameCivilDay(at(2026, 8, 9), at(2027, 8, 9))).toBe(false);
	});
});
