import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
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

	test('a date-edited occurrence suppresses its SLOT, not its new civil date (KII-157)', () => {
		const now = localTs(2026, 4, 3, 12);
		// Monthly series whose next occurrence is Apr 5. The user edited that one
		// occurrence and moved it earlier, to Apr 4. The materialized row keeps the
		// deterministic id minted for its slot (Apr 5) while its timestamp is Apr 4.
		const monthly = dailyTemplate({
			rule: JSON.stringify({ type: 'monthly' }),
			start_date: localTs(2026, 4, 5),
		});
		const moved: Transaction = {
			id: 'tmpl-1:2026-04-05',
			from_entity_id: 'acc',
			to_entity_id: 'cat',
			amount_minor: 1000,
			currency: 'USD',
			timestamp: localTs(2026, 4, 4),
			series_id: 'tmpl-1',
			is_confirmed: false,
		};
		const result = deriveVirtualOccurrences(
			[monthly],
			new Map(),
			[moved],
			localTs(2026, 4, 1),
			localTs(2026, 4, 6),
			now
		);
		// Apr 5 is taken by the moved row; deriving it again would duplicate the
		// occurrence the user just rescheduled.
		expect(result.map((t) => toCivilDate(t.timestamp))).toEqual([]);
	});

	test('a date-edited occurrence does not shadow the slot it was moved onto (KII-157)', () => {
		const now = localTs(2026, 4, 3, 12);
		// Daily series: Apr 4 has an occurrence of its own. A row whose SLOT is Apr 5
		// but which was moved to Apr 4 must not swallow Apr 4's occurrence. Uses a
		// distinct hour (14:00) from the template's generated 09:00 occurrences so
		// this only collides on civil day, not on the exact instant — that
		// exact-instant coincidence is its own scenario, covered separately below.
		const moved: Transaction = {
			id: 'tmpl-1:2026-04-05',
			from_entity_id: 'acc',
			to_entity_id: 'cat',
			amount_minor: 1000,
			currency: 'USD',
			timestamp: localTs(2026, 4, 4, 14),
			series_id: 'tmpl-1',
			is_confirmed: false,
		};
		const result = deriveVirtualOccurrences(
			[dailyTemplate()],
			new Map(),
			[moved],
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

	test('does not derive an occurrence dated later today — it is due, not upcoming (KII-159)', () => {
		// A daily series whose occurrences land at 15:42 local.
		const start = new Date(2026, 7, 1, 15, 42, 0, 0).getTime();
		const now = new Date(2026, 7, 3, 0, 30, 0, 0).getTime(); // 00:30 on the 3rd
		const rangeEnd = new Date(2026, 7, 10, 0, 0, 0, 0).getTime();

		const tpl = dailyTemplate({ start_date: start, created_at: start });

		const result = deriveVirtualOccurrences([tpl], new Map(), [], now, rangeEnd, now);
		const civilDates = result.map((o) => toCivilDate(o.timestamp));

		expect(civilDates).not.toContain('2026-08-03'); // today — materialized instead
		expect(civilDates).toContain('2026-08-04');
	});
});

describe('deriveVirtualOccurrences — instant dedup across a stale civil-date label', () => {
	// Confirmed field bug: one raw instant, two different occurrence ids —
	// `<series>:2026-07-01` (is_confirmed: false) and `<series>:2026-07-02`
	// (is_confirmed: true) — both carrying timestamp 1782940925537. That ms
	// value is 2026-07-01 21:22:05 UTC, which is 2026-07-02 00:22:05 in
	// Helsinki (UTC+3): the exact instant straddles the UTC/local civil-day
	// boundary. A materialized row's slot label is baked into its id at
	// creation time and never recomputed; if it was minted under a different
	// civil-day derivation than the one running now, it can permanently
	// disagree with a fresh `toCivilDate` of the very same instant, and
	// `deriveVirtualOccurrences` would keep resurrecting a "new" virtual
	// occurrence for that instant under the label of the day. Pin TZ to
	// Helsinki so the test reproduces the exact reported labels regardless of
	// the host running this suite, and restore it after — bun runs every test
	// file in one process, so a leaked TZ would leak into unrelated files.
	const REAL_TS = 1782940925537;
	let originalTz: string | undefined;

	beforeAll(() => {
		originalTz = process.env.TZ;
		process.env.TZ = 'Europe/Helsinki';
	});

	afterAll(() => {
		if (originalTz === undefined) delete process.env.TZ;
		else process.env.TZ = originalTz;
	});

	test('a real row whose baked-in slot disagrees with a fresh toCivilDate of its own timestamp is not re-derived', () => {
		expect(toCivilDate(REAL_TS)).toBe('2026-07-02'); // sanity: confirms the TZ pin reproduces the field values

		const template = dailyTemplate({
			id: 'series-1',
			start_date: REAL_TS,
			created_at: REAL_TS,
		});

		// The real, materialized row: same series, same exact instant, but its id
		// was minted with the OTHER side of the boundary as its slot label.
		const materialized: Transaction = {
			id: 'series-1:2026-07-01',
			from_entity_id: 'acc',
			to_entity_id: 'cat',
			amount_minor: 1000,
			currency: 'USD',
			timestamp: REAL_TS,
			series_id: 'series-1',
			is_confirmed: true,
		};

		const now = new Date(2026, 6, 1, 9, 0).getTime(); // 2026-07-01 09:00 Helsinki — before REAL_TS
		const rangeStart = new Date(2026, 6, 1, 0, 0).getTime();
		const rangeEnd = new Date(2026, 6, 5, 0, 0).getTime();

		const result = deriveVirtualOccurrences(
			[template],
			new Map(),
			[materialized],
			rangeStart,
			rangeEnd,
			now
		);

		// Without the exact-instant guard this would wrongly include a second,
		// virtual occurrence at REAL_TS labeled `series-1:2026-07-02`.
		expect(result.filter((t) => t.timestamp === REAL_TS)).toEqual([]);
	});
});
