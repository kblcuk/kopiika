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
			d.setMonth(d.getMonth() + 1, 1); // move to 1st of next month
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
 */
export function generateOccurrences(opts: GenerateOptions): number[] {
	const { rule, startDate, horizonDays, now, endDate, endCount, exclusions } = opts;

	const horizonEnd = now + horizonDays * 24 * 60 * 60 * 1000;
	const effectiveEnd = endDate != null ? Math.min(endDate, horizonEnd) : horizonEnd;
	const exclusionSet = new Set(exclusions ?? []);

	const timestamps: number[] = [];
	let current = startDate;
	let totalSlots = 0; // counts all slots including excluded ones

	while (current <= effectiveEnd) {
		totalSlots++;
		if (endCount != null && totalSlots > endCount) break;

		if (!exclusionSet.has(current)) {
			timestamps.push(current);
		}

		current = nextOccurrence(current, rule);
	}

	return timestamps;
}
