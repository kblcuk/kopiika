import { toCivilDate } from './recurrence';

/**
 * Whether a transaction is due — i.e. confirmable. Due-ness is a CIVIL DAY
 * comparison, not a raw instant one (KII-159): a recurrence occurrence inherits
 * the local time-of-day of its template's start date, so `timestamp <= now`
 * made an occurrence confirmable only after an arbitrary hour of its own day.
 *
 * `toCivilDate` returns `YYYY-MM-DD`, whose lexicographic order matches
 * chronological order, so string comparison is the date comparison.
 */
export function isDue(timestamp: number, now: number): boolean {
	return toCivilDate(timestamp) <= toCivilDate(now);
}

/**
 * The last millisecond of `now`'s local day. For callers that cannot evaluate a
 * per-row predicate — the background task queries SQLite directly, and
 * `generateOccurrences` is bounded by an instant — this is the instant that
 * makes "<= x" mean "due today or earlier".
 */
export function endOfLocalDay(now: number): number {
	const d = new Date(now);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}
