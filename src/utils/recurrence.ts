import type { RecurrenceRule } from '@/src/types/recurrence';
import { shiftCivilDate } from '@/src/utils/date-shift';

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

/** The minimum shape of a materialized occurrence row the helpers below need. */
export interface OccurrenceRow {
	id: string;
	timestamp: number;
}

/** What a series' materialized rows occupy — see `seriesOccupancy`. */
export interface SeriesOccupancy {
	/** Civil SLOT dates already occupied by this series' materialized rows. */
	slots: Set<string>;
	/** Raw timestamps of rows whose slot matches no generated occurrence. */
	orphanTimestamps: Set<number>;
}

/**
 * A row's occurrence slot: read from its deterministic id, falling back to the
 * civil date of its raw timestamp for legacy random-id rows (pre-KII-136),
 * whose slot is only knowable that way.
 */
function rowSlotCivilDate(row: OccurrenceRow, seriesId: string): string {
	return occurrenceSlotCivilDate(row.id, seriesId) ?? toCivilDate(row.timestamp);
}

/**
 * Which occurrence SLOTS a series' materialized rows already occupy, plus the
 * raw-timestamp fallback for rows whose slot is orphaned. This is THE shared
 * definition of occurrence-dedup semantics: `backfillRecurrences`
 * (materialization) and `deriveVirtualOccurrences` (virtual occurrences) both
 * go through it, so the two surfaces can never drift. Each caller passes the
 * timestamps IT generates — backfill only the due ones, derivation the whole
 * horizon — and skips any candidate occurrence whose civil date is in `slots`
 * or whose raw timestamp is in `orphanTimestamps`.
 *
 * Keying on the SLOT (not on the row's current civil date) stops an edited row
 * from either resurrecting its original slot or shadowing a different slot it
 * happened to be dragged onto (KII-157).
 *
 * Rows whose slot matches NO occurrence in `generatedTimestamps` are ORPHANED.
 * A slot label is baked into the id at creation time and never recomputed, so
 * it can disagree with a fresh `toCivilDate` of the row's own timestamp when
 * the row was created under a different civil-day derivation than the one
 * running now (an older app build, a different device/OS timezone database, a
 * DST-table update) — confirmed in the field as two rows for one instant,
 * 21:22 UTC / 00:22 next-day Helsinki, that landed on different sides of that
 * boundary. An orphaned row's raw timestamp is its only remaining reliable
 * identity, hence the fallback.
 *
 * Testing "does this slot match a currently-generated occurrence" FIRST,
 * rather than matching raw timestamps unconditionally, is what keeps that
 * fallback from breaking KII-157: a row legitimately moved onto another
 * occurrence's exact instant (e.g. a date-only edit that keeps the series'
 * fixed hour-of-day) still has a real, currently-generated slot of its own, so
 * it is never treated as a stray mislabeling of the instant it now merely
 * coincides with.
 */
export function seriesOccupancy(
	seriesId: string,
	rows: readonly OccurrenceRow[],
	generatedTimestamps: readonly number[]
): SeriesOccupancy {
	const generatedCivilDates = new Set(generatedTimestamps.map(toCivilDate));
	const slots = new Set<string>();
	const orphanTimestamps = new Set<number>();

	for (const row of rows) {
		const slot = rowSlotCivilDate(row, seriesId);
		slots.add(slot);
		if (!generatedCivilDates.has(slot)) orphanTimestamps.add(row.timestamp);
	}

	return { slots, orphanTimestamps };
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
 * time-of-day. Delegates to `shiftCivilDate`, which is DST-safe by construction
 * and clamps monthly/yearly results to the target month's last day
 * (Jan 31 → Feb 28) from the base day, so drift cannot accumulate.
 */
function addIntervals(baseTimestamp: number, n: number, rule: RecurrenceRule): number {
	const base = new Date(baseTimestamp);

	switch (rule.type) {
		case 'daily':
			return shiftCivilDate(base, { days: n }).getTime();
		case 'weekly':
			return shiftCivilDate(base, { days: n * 7 }).getTime();
		case 'monthly':
			return shiftCivilDate(base, { months: n }).getTime();
		case 'yearly':
			return shiftCivilDate(base, { years: n }).getTime();
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
