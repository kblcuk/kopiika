import type { Transaction } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import { isDue } from '@/src/utils/due';
import { toCivilDate } from '@/src/utils/recurrence';
import { deriveVirtualOccurrences } from '@/src/utils/recurrence-derivation';

/** Local hour reminders fire on the occurrence's civil date (KII-159). */
export const REMINDER_HOUR = 9;

/** iOS allows 64 pending notifications; keep headroom for anything else. */
const MAX_SCHEDULED = 50;

/**
 * How far ahead occurrences are generated. The 50-entry cap is the real limit;
 * this bound only has to be wide enough that sparse series (yearly) contribute
 * at least one entry, while keeping generation O(days) per template.
 */
const HORIZON_DAYS = 400;

export interface ReminderEntry {
	transaction: Transaction;
	fireAt: number;
}

/**
 * The instant a reminder for `timestamp` fires: 09:00 local on that occurrence's
 * civil date. Built from local date components so it lands on the intended
 * calendar day regardless of DST.
 */
export function reminderInstant(timestamp: number): number {
	const d = new Date(timestamp);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), REMINDER_HOUR, 0, 0, 0).getTime();
}

/**
 * The reminders that should currently be scheduled. Pure — the effectful sweep
 * lives in `reminders.ts`.
 *
 * Sources: virtual occurrences derived from templates (future recurring
 * occurrences are never stored since KII-136, which is why a row-based scheduler
 * silently stopped covering them), plus real unconfirmed rows not yet due
 * (manually created future transactions).
 *
 * Both sources already exclude due occurrences — `deriveVirtualOccurrences`
 * skips anything whose civil day is on or before `now`'s, and `realFuture`
 * below filters on `!isDue`. Every surviving timestamp therefore falls on a
 * strictly later civil day, so its 09:00 reminder instant is always in the
 * future; no separate "already passed" filter is needed here.
 */
export function buildReminderSchedule(
	templates: RecurrenceTemplate[],
	transactions: Transaction[],
	now: number
): ReminderEntry[] {
	const exclusionsByTemplate = new Map(
		templates.map((t) => [t.id, new Set((t.exclusions ?? []).map(toCivilDate))])
	);
	const virtual = deriveVirtualOccurrences(
		templates,
		exclusionsByTemplate,
		transactions,
		now,
		now + HORIZON_DAYS * 86_400_000,
		now
	);
	const realFuture = transactions.filter(
		(t) => t.is_confirmed === false && !isDue(t.timestamp, now)
	);

	return [...virtual, ...realFuture]
		.map((transaction) => ({ transaction, fireAt: reminderInstant(transaction.timestamp) }))
		.sort((a, b) => a.fireAt - b.fireAt || a.transaction.id.localeCompare(b.transaction.id))
		.slice(0, MAX_SCHEDULED);
}

/**
 * Stable key for a schedule, used to skip the native cancel-and-reschedule sweep
 * when nothing changed. Mirrors `buildBackgroundNotificationKey`.
 */
export function reminderFingerprint(entries: ReminderEntry[]): string | null {
	if (entries.length === 0) return null;
	return entries
		.map((e) => `${e.transaction.id}@${e.fireAt}`)
		.sort()
		.join(',');
}
