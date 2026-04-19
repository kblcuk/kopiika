import { describe, expect, test } from 'bun:test';
import { generateOccurrences, nextOccurrence } from '../recurrence';

// Helper: create a local-time timestamp for a specific date
function localTs(year: number, month: number, day: number, hour = 9): number {
	return new Date(year, month - 1, day, hour).getTime();
}

describe('nextOccurrence', () => {
	test('daily: advances by 1 day', () => {
		const from = localTs(2026, 4, 1);
		const next = nextOccurrence(from, { type: 'daily' });
		expect(next).toBe(localTs(2026, 4, 2));
	});

	test('weekly: advances by 7 days', () => {
		const from = localTs(2026, 4, 1);
		const next = nextOccurrence(from, { type: 'weekly' });
		expect(next).toBe(localTs(2026, 4, 8));
	});

	test('monthly: same day next month', () => {
		const from = localTs(2026, 1, 15);
		const next = nextOccurrence(from, { type: 'monthly' });
		expect(new Date(next).getDate()).toBe(15);
		expect(new Date(next).getMonth()).toBe(1); // February
	});

	test('monthly: clamps day 31 to Feb 28', () => {
		const from = localTs(2026, 1, 31);
		const next = nextOccurrence(from, { type: 'monthly' });
		expect(new Date(next).getDate()).toBe(28);
		expect(new Date(next).getMonth()).toBe(1); // February
	});

	test('monthly: clamps day 31 to Feb 29 on leap year', () => {
		const from = localTs(2028, 1, 31); // 2028 is a leap year
		const next = nextOccurrence(from, { type: 'monthly' });
		expect(new Date(next).getDate()).toBe(29);
		expect(new Date(next).getMonth()).toBe(1);
	});

	test('yearly: same month and day', () => {
		const from = localTs(2026, 3, 15);
		const next = nextOccurrence(from, { type: 'yearly' });
		expect(new Date(next).getFullYear()).toBe(2027);
		expect(new Date(next).getMonth()).toBe(2); // March
		expect(new Date(next).getDate()).toBe(15);
	});

	test('yearly: Feb 29 clamps to Feb 28 on non-leap year', () => {
		const from = localTs(2028, 2, 29); // leap year
		const next = nextOccurrence(from, { type: 'yearly' });
		expect(new Date(next).getDate()).toBe(28);
		expect(new Date(next).getMonth()).toBe(1); // February
		expect(new Date(next).getFullYear()).toBe(2029);
	});
});

describe('generateOccurrences', () => {
	test('daily: generates correct number within horizon', () => {
		const start = localTs(2026, 4, 1);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 7,
			now: start,
		});
		// Day 1 through day 8 (start + 7 days of horizon)
		expect(result.length).toBe(8);
		expect(result[0]).toBe(start);
		expect(result[7]).toBe(localTs(2026, 4, 8));
	});

	test('weekly: generates 5 occurrences over 30 days', () => {
		const start = localTs(2026, 4, 1);
		const result = generateOccurrences({
			rule: { type: 'weekly' },
			startDate: start,
			horizonDays: 30,
			now: start,
		});
		expect(result.length).toBe(5); // Apr 1, 8, 15, 22, 29
	});

	test('monthly: generates 4 occurrences over 90 days', () => {
		const start = localTs(2026, 1, 15);
		const result = generateOccurrences({
			rule: { type: 'monthly' },
			startDate: start,
			horizonDays: 90,
			now: start,
		});
		// Jan 15, Feb 15, Mar 15, Apr 15
		expect(result.length).toBe(4);
	});

	test('respects end_date', () => {
		const start = localTs(2026, 4, 1);
		const endDate = localTs(2026, 4, 15);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 90,
			now: start,
			endDate,
		});
		expect(result.length).toBe(15); // Apr 1 through Apr 15
		expect(result[result.length - 1]).toBe(endDate);
	});

	test('respects end_count', () => {
		const start = localTs(2026, 4, 1);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 365,
			now: start,
			endCount: 5,
		});
		expect(result.length).toBe(5);
	});

	test('end_date and end_count: whichever hits first wins', () => {
		const start = localTs(2026, 4, 1);
		const endDate = localTs(2026, 4, 10);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 365,
			now: start,
			endDate,
			endCount: 3,
		});
		expect(result.length).toBe(3); // count (3) < date range (10)
	});

	test('skips exclusions but still counts them toward total slots', () => {
		const start = localTs(2026, 4, 1);
		const excluded = localTs(2026, 4, 3);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 5,
			now: start,
			exclusions: [excluded],
		});
		expect(result).not.toContain(excluded);
		expect(result.length).toBe(5); // 6 days minus 1 exclusion
	});

	test('exclusions count toward endCount', () => {
		const start = localTs(2026, 4, 1);
		const excluded = localTs(2026, 4, 2);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 365,
			now: start,
			endCount: 4,
			exclusions: [excluded],
		});
		// 4 slots total, 1 excluded = 3 actual timestamps
		expect(result.length).toBe(3);
		expect(result).not.toContain(excluded);
	});

	test('returns empty array when start_date is beyond horizon', () => {
		const now = localTs(2026, 1, 1);
		const start = localTs(2026, 12, 1);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 30,
			now,
		});
		expect(result.length).toBe(0);
	});

	test('generates past occurrences when start_date is before now', () => {
		const start = localTs(2026, 3, 1);
		const now = localTs(2026, 4, 1);
		const result = generateOccurrences({
			rule: { type: 'monthly' },
			startDate: start,
			horizonDays: 90,
			now,
		});
		// Mar 1 (past), Apr 1 (now), May 1, Jun 1 (within 90d of now)
		expect(result[0]).toBe(start);
		expect(result.length).toBe(4);
	});
});
