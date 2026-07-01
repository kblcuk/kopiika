import { describe, expect, test } from 'bun:test';
import type { Transaction } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import { deriveVirtualOccurrences } from '../recurrence-derivation';
import { toCivilDate } from '../recurrence';

function localTs(y: number, m: number, d: number, h = 9): number {
	return new Date(y, m - 1, d, h).getTime();
}

function dailyTemplate(over: Partial<RecurrenceTemplate> = {}): RecurrenceTemplate {
	return {
		id: 'tmpl-1',
		from_entity_id: 'acc',
		to_entity_id: 'cat',
		amount_minor: 1000,
		currency: 'USD',
		note: 'rent',
		rule: JSON.stringify({ type: 'daily' }),
		start_date: localTs(2026, 4, 1),
		end_date: null,
		end_count: null,
		created_at: localTs(2026, 4, 1),
		...over,
	};
}

describe('deriveVirtualOccurrences', () => {
	test('returns virtual occurrences strictly after now, up to rangeEnd', () => {
		const now = localTs(2026, 4, 3, 12);
		const result = deriveVirtualOccurrences(
			[dailyTemplate()],
			new Map(),
			[],
			localTs(2026, 4, 1),
			localTs(2026, 4, 6),
			now
		);
		const days = result.map((t) => toCivilDate(t.timestamp));
		// now is Apr 3 12:00 → Apr 3 09:00 is in the past; Apr 4,5,6 are future ≤ rangeEnd.
		expect(days).toEqual(['2026-04-04', '2026-04-05', '2026-04-06']);
		expect(result.every((t) => t.isVirtual === true)).toBe(true);
		expect(result[0]!.id).toBe('tmpl-1:2026-04-04');
		expect(result[0]!.series_id).toBe('tmpl-1');
		expect(result[0]!.amount_minor).toBe(1000);
		expect(result[0]!.is_confirmed).toBe(false);
		expect(result[0]!.note).toBe('rent');
	});

	test('skips dates already present as real rows (dedup by series_id + civil date)', () => {
		const now = localTs(2026, 4, 3, 12);
		// A real row for Apr 5 with a RANDOM id (legacy-style) must still suppress
		// the virtual Apr 5 — dedup keys on (series_id, civil date), not the id.
		const realApr5: Transaction = {
			id: 'random-legacy-id',
			from_entity_id: 'acc',
			to_entity_id: 'cat',
			amount_minor: 1000,
			currency: 'USD',
			timestamp: localTs(2026, 4, 5),
			series_id: 'tmpl-1',
			is_confirmed: false,
		};
		const result = deriveVirtualOccurrences(
			[dailyTemplate()],
			new Map(),
			[realApr5],
			localTs(2026, 4, 1),
			localTs(2026, 4, 6),
			now
		);
		expect(result.map((t) => toCivilDate(t.timestamp))).toEqual(['2026-04-04', '2026-04-06']);
	});

	test('skips excluded civil dates', () => {
		const now = localTs(2026, 4, 3, 12);
		const exclusions = new Map([['tmpl-1', new Set(['2026-04-05'])]]);
		const result = deriveVirtualOccurrences(
			[dailyTemplate()],
			exclusions,
			[],
			localTs(2026, 4, 1),
			localTs(2026, 4, 6),
			now
		);
		expect(result.map((t) => toCivilDate(t.timestamp))).toEqual(['2026-04-04', '2026-04-06']);
	});

	test('ignores deleted templates', () => {
		const now = localTs(2026, 4, 3, 12);
		const result = deriveVirtualOccurrences(
			[dailyTemplate({ is_deleted: true })],
			new Map(),
			[],
			localTs(2026, 4, 1),
			localTs(2026, 4, 6),
			now
		);
		expect(result).toEqual([]);
	});

	test('respects rangeStart: excludes occurrences before rangeStart even when after now', () => {
		const now = localTs(2026, 4, 3, 12);
		// rangeStart is in the future — only Apr 6,7,8 are inside [rangeStart, rangeEnd]
		const result = deriveVirtualOccurrences(
			[dailyTemplate()],
			new Map(),
			[],
			localTs(2026, 4, 6), // rangeStart
			localTs(2026, 4, 8), // rangeEnd
			now
		);
		expect(result.map((t) => toCivilDate(t.timestamp))).toEqual([
			'2026-04-06',
			'2026-04-07',
			'2026-04-08',
		]);
	});
});
