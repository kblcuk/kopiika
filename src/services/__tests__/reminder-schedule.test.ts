import { describe, expect, test } from 'bun:test';
import type { Transaction } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import { REMINDER_HOUR, buildReminderSchedule, reminderInstant } from '../reminder-schedule';

const at = (y: number, m: number, d: number, h = 0, min = 0) =>
	new Date(y, m - 1, d, h, min, 0, 0).getTime();

const template = (overrides: Partial<RecurrenceTemplate> = {}): RecurrenceTemplate => ({
	id: 'tpl-1',
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount_minor: 10000,
	currency: 'USD',
	start_date: at(2026, 8, 1, 15, 42),
	rule: JSON.stringify({ type: 'daily' }),
	end_date: null,
	end_count: null,
	exclusions: [],
	created_at: at(2026, 8, 1), // required by RecurrenceTemplate (notNull column)
	...overrides,
});

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
	id: 'tx-1',
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount_minor: 10000,
	currency: 'USD',
	timestamp: at(2026, 8, 10, 12, 0),
	is_confirmed: false,
	...overrides,
});

describe('reminderInstant', () => {
	test('anchors to 09:00 on the occurrence civil date, ignoring its time-of-day', () => {
		expect(reminderInstant(at(2026, 8, 5, 15, 42))).toBe(at(2026, 8, 5, REMINDER_HOUR));
		expect(reminderInstant(at(2026, 8, 5, 3, 17))).toBe(at(2026, 8, 5, REMINDER_HOUR));
	});
});

describe('buildReminderSchedule', () => {
	const now = at(2026, 8, 3, 10, 0);

	test('schedules future occurrences at 09:00 on their own day', () => {
		const entries = buildReminderSchedule([template()], [], now);
		expect(entries[0]!.fireAt).toBe(at(2026, 8, 4, REMINDER_HOUR));
		expect(entries[1]!.fireAt).toBe(at(2026, 8, 5, REMINDER_HOUR));
	});

	test('never schedules a reminder in the past — both feeders exclude due occurrences', () => {
		const entries = buildReminderSchedule([template()], [], now);
		expect(entries.every((e) => e.fireAt > now)).toBe(true);
	});

	test('includes real unconfirmed rows dated in the future', () => {
		const entries = buildReminderSchedule([], [tx({ id: 'manual-1' })], now);
		expect(entries).toHaveLength(1);
		expect(entries[0]!.transaction.id).toBe('manual-1');
		expect(entries[0]!.fireAt).toBe(at(2026, 8, 10, REMINDER_HOUR));
	});

	test('excludes confirmed rows and rows already due', () => {
		const entries = buildReminderSchedule(
			[],
			[
				tx({ id: 'confirmed', is_confirmed: true }),
				tx({ id: 'due-today', timestamp: at(2026, 8, 3, 23, 0) }),
			],
			now
		);
		expect(entries).toHaveLength(0);
	});

	test('respects template exclusions', () => {
		const entries = buildReminderSchedule(
			[template({ exclusions: [at(2026, 8, 4, 15, 42)] })],
			[],
			now
		);
		expect(entries[0]!.fireAt).toBe(at(2026, 8, 5, REMINDER_HOUR));
	});

	test('respects end_count', () => {
		// Occurrences on the 1st, 2nd, 3rd — all due or past by `now`.
		const entries = buildReminderSchedule([template({ end_count: 3 })], [], now);
		expect(entries).toHaveLength(0);
	});

	test('caps at 50 entries', () => {
		const entries = buildReminderSchedule([template()], [], now);
		expect(entries).toHaveLength(50);
	});

	test('is ordered soonest first', () => {
		const entries = buildReminderSchedule([template()], [tx({ id: 'manual-1' })], now);
		const fireAts = entries.map((e) => e.fireAt);
		expect([...fireAts].sort((a, b) => a - b)).toEqual(fireAts);
	});
});
