import type { RecurrenceRule } from '@/src/types/recurrence';

/**
 * Compute the next occurrence timestamp from a given timestamp using the rule.
 * All date math is in local time to avoid DST shifts.
 */
export function nextOccurrence(fromTimestamp: number, rule: RecurrenceRule): number {
	const d = new Date(fromTimestamp);

	switch (rule.type) {
		case 'daily':
			d.setDate(d.getDate() + 1);
			break;
		case 'weekly':
			d.setDate(d.getDate() + 7);
			break;
		case 'monthly': {
			const originalDay = d.getDate();
			d.setMonth(d.getMonth() + 1, 1);
			const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
			d.setDate(Math.min(originalDay, maxDay));
			break;
		}
		case 'yearly': {
			const origMonth = d.getMonth();
			const origDay = d.getDate();
			d.setFullYear(d.getFullYear() + 1, origMonth, 1);
			const maxDay = new Date(d.getFullYear(), origMonth + 1, 0).getDate();
			d.setDate(Math.min(origDay, maxDay));
			break;
		}
		default: {
			const _exhaustive: string = rule.type;
			throw new Error(`Unsupported recurrence type: ${_exhaustive}`);
		}
	}

	return d.getTime();
}

/**
 * Compute the Nth occurrence from a start date, always deriving from the
 * original start date to avoid cumulative day-of-month clamping drift.
 * E.g. monthly from Jan 31: Jan 31 → Feb 28 → Mar 31 → Apr 30 (not Mar 28).
 */
function nthOccurrence(startDate: number, n: number, rule: RecurrenceRule): number {
	if (n === 0) return startDate;

	const start = new Date(startDate);
	const d = new Date(startDate);

	switch (rule.type) {
		case 'daily':
			d.setDate(start.getDate() + n);
			break;
		case 'weekly':
			d.setDate(start.getDate() + n * 7);
			break;
		case 'monthly': {
			const originalDay = start.getDate();
			d.setMonth(start.getMonth() + n, 1);
			const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
			d.setDate(Math.min(originalDay, maxDay));
			break;
		}
		case 'yearly': {
			const origMonth = start.getMonth();
			const origDay = start.getDate();
			d.setFullYear(start.getFullYear() + n, origMonth, 1);
			const maxDay = new Date(d.getFullYear(), origMonth + 1, 0).getDate();
			d.setDate(Math.min(origDay, maxDay));
			break;
		}
		default: {
			throw new Error(`Unsupported recurrence type: ${rule.type as string}`);
		}
	}

	return d.getTime();
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
	const exclusionSet = new Set(exclusions ?? []);

	const timestamps: number[] = [];
	let n = 0;

	while (true) {
		const current = nthOccurrence(startDate, n, rule);
		if (current > effectiveEnd) break;
		if (endCount != null && n >= endCount) break;

		if (!exclusionSet.has(current)) {
			timestamps.push(current);
		}

		n++;
	}

	return timestamps;
}
