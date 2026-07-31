import type { RecurrenceRule } from '@/src/types/recurrence';

/**
 * Local calendar day of a timestamp as `YYYY-MM-DD`. This is the canonical
 * IDENTITY of a recurrence occurrence: dedup and exclusion matching key on this
 * (not the raw ms value), so a DST hour-shift can never split one calendar day
 * into two distinct occurrences. Uses local getters (not `toISOString`, which
 * is UTC) so the civil day matches what the user sees.
 */
export function toCivilDate(timestamp: number): string {
	const d = new Date(timestamp);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** `YYYY-MM-DD`, the civil-date suffix of a deterministic occurrence id. */
const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deterministic occurrence id: `${seriesId}:${YYYY-MM-DD}`. Assigned to rows a
 * recurring occurrence materializes into (Plan B) and is the future sync key.
 * NOTE: it is not available on pre-existing rows (those carry random ids), so
 * dedup reads a row's slot via `occurrenceSlotCivilDate` and falls back to
 * `toCivilDate(timestamp)` for those.
 */
export function occurrenceId(seriesId: string, civilDate: string): string {
	return `${seriesId}:${civilDate}`;
}

/**
 * Reverse of `occurrenceId`: the civil SLOT date a materialized occurrence
 * belongs to, read back from its deterministic id. Returns null for legacy
 * random-id rows (pre-KII-136) or any id that isn't a deterministic occurrence
 * id for `seriesId`.
 *
 * The slot is the occurrence's STABLE identity — it does not move when the user
 * edits the row's date, detaches it from the series, or the device timezone
 * shifts. Dedup and exclusion must therefore key on the slot, not on
 * `toCivilDate(timestamp)`, which drifts away from the id in all three cases and
 * would otherwise resurrect or duplicate the occurrence.
 */
export function occurrenceSlotCivilDate(id: string, seriesId: string): string | null {
	const prefix = `${seriesId}:`;
	if (!id.startsWith(prefix)) return null;
	const civil = id.slice(prefix.length);
	return CIVIL_DATE_RE.test(civil) ? civil : null;
}

/**
 * A canonical timestamp on a civil date, used when recording a recurrence
 * exclusion for a SLOT (exclusions are stored as timestamps but matched by civil
 * date — see `generateOccurrences`). Local noon keeps `toCivilDate` on the
 * intended day regardless of DST, unlike midnight which can straddle a boundary.
 */
export function civilDateToTimestamp(civilDate: string): number {
	const [y, m, d] = civilDate.split('-').map(Number);
	return new Date(y!, m! - 1, d!, 12, 0, 0, 0).getTime();
}

/**
 * Add `n` recurrence intervals to a base timestamp, preserving the base's local
 * time-of-day. Uses the local component constructor `new Date(y, m, d, h, …)`
 * so the result is the target CIVIL date at the same wall-clock time — DST-safe
 * by construction (no epoch-offset mutation that could drift an hour across a
 * DST boundary). Monthly/yearly clamp the day to the target month's last day
 * (Jan 31 → Feb 28), always derived from the base day to avoid cumulative drift.
 */
function addIntervals(baseTimestamp: number, n: number, rule: RecurrenceRule): number {
	const base = new Date(baseTimestamp);
	const y = base.getFullYear();
	const mon = base.getMonth();
	const day = base.getDate();
	const h = base.getHours();
	const min = base.getMinutes();
	const s = base.getSeconds();
	const ms = base.getMilliseconds();

	switch (rule.type) {
		case 'daily':
			return new Date(y, mon, day + n, h, min, s, ms).getTime();
		case 'weekly':
			return new Date(y, mon, day + n * 7, h, min, s, ms).getTime();
		case 'monthly': {
			const target = new Date(y, mon + n, 1, h, min, s, ms);
			const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
			return new Date(
				target.getFullYear(),
				target.getMonth(),
				Math.min(day, maxDay),
				h,
				min,
				s,
				ms
			).getTime();
		}
		case 'yearly': {
			const maxDay = new Date(y + n, mon + 1, 0).getDate();
			return new Date(y + n, mon, Math.min(day, maxDay), h, min, s, ms).getTime();
		}
		default: {
			const _exhaustive: never = rule.type as never;
			throw new Error(`Unsupported recurrence type: ${_exhaustive as string}`);
		}
	}
}

/**
 * Compute the next occurrence one interval after `fromTimestamp`, preserving
 * local time-of-day. DST-safe (see addIntervals).
 *
 * For generating a whole series, prefer `generateOccurrences` (which derives
 * each step from the original start). Chaining `nextOccurrence` on its own
 * result accumulates monthly day-of-month clamp drift (e.g. Jan 31 → Feb 28 →
 * Mar 28 instead of Mar 31).
 */
export function nextOccurrence(fromTimestamp: number, rule: RecurrenceRule): number {
	return addIntervals(fromTimestamp, 1, rule);
}

/**
 * Compute the Nth occurrence from a start date, always derived from the original
 * start (not chained) to avoid cumulative day-of-month clamping drift.
 */
function nthOccurrence(startDate: number, n: number, rule: RecurrenceRule): number {
	return addIntervals(startDate, n, rule);
}

interface GenerateOptions {
	rule: RecurrenceRule;
	startDate: number;
	horizonDays: number;
	now: number;
	endDate?: number | null;
	endCount?: number | null;
	exclusions?: number[];
}

/**
 * Generate all occurrence timestamps for a recurrence template.
 * Returns timestamps from startDate up to min(endDate, now + horizonDays).
 * Exclusions are skipped but still count toward endCount slots.
 *
 * Uses nthOccurrence (computed from start date) instead of chaining
 * nextOccurrence to avoid cumulative day-of-month clamping drift.
 */
export function generateOccurrences(opts: GenerateOptions): number[] {
	const { rule, startDate, horizonDays, now, endDate, endCount, exclusions } = opts;

	const horizonEnd = now + horizonDays * 24 * 60 * 60 * 1000;
	const effectiveEnd = endDate != null ? Math.min(endDate, horizonEnd) : horizonEnd;
	// Match exclusions by civil date, not raw timestamp: an exclusion stored
	// under an old/DST-shifted ms value still drops the right calendar day.
	const excludedCivilDates = new Set((exclusions ?? []).map(toCivilDate));

	const timestamps: number[] = [];
	let n = 0;

	while (true) {
		const current = nthOccurrence(startDate, n, rule);
		if (current > effectiveEnd) break;
		if (endCount != null && n >= endCount) break;

		if (!excludedCivilDates.has(toCivilDate(current))) {
			timestamps.push(current);
		}

		n++;
	}

	return timestamps;
}
