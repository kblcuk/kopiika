import type { Transaction } from '@/src/types';
import type { RecurrenceRule, RecurrenceTemplate } from '@/src/types/recurrence';
import { isDue } from './due';
import { generateOccurrences, occurrenceId, seriesOccupancy, toCivilDate } from './recurrence';

/**
 * Derive the recurrence occurrences that are NOT YET DUE (strictly later than
 * `now`'s civil day, up to `rangeEnd`) and not yet materialized as real rows.
 * Occurrences due today or earlier are materialized by `backfillRecurrences`
 * instead (KII-159) — this function only ever returns "upcoming" occurrences.
 * Pure — the single shared source of "upcoming" occurrences for both the
 * balance hook and the history screen, so the two surfaces can never drift.
 *
 * Dedup keys on `(series_id, occurrence SLOT)`, with a raw-timestamp fallback
 * for rows whose slot is orphaned. Both rules live in `seriesOccupancy` and are
 * shared verbatim with `backfillRecurrences`, so the two surfaces can never
 * drift on what suppresses an occurrence (KII-157) — see that helper for the
 * field-confirmed case behind the fallback and why the orphan check is ordered
 * the way it is.
 *
 * @param exclusionsByTemplate template_id → Set of excluded civil dates (YYYY-MM-DD)
 */
export function deriveVirtualOccurrences(
	templates: RecurrenceTemplate[],
	exclusionsByTemplate: Map<string, Set<string>>,
	realTransactions: Transaction[],
	rangeStart: number,
	rangeEnd: number,
	now: number
): Transaction[] {
	// Materialized rows grouped by series, keeping the row (not just its slot)
	// so the per-template loop below can compute the orphan-timestamp fallback.
	const realBySeries = new Map<string, Transaction[]>();
	for (const tx of realTransactions) {
		if (!tx.series_id) continue;
		let list = realBySeries.get(tx.series_id);
		if (!list) {
			list = [];
			realBySeries.set(tx.series_id, list);
		}
		list.push(tx);
	}

	const out: Transaction[] = [];

	for (const template of templates) {
		if (template.is_deleted) continue;

		const rule: RecurrenceRule = JSON.parse(template.rule);
		const excludedCivil = exclusionsByTemplate.get(template.id) ?? new Set<string>();
		const seriesRows = realBySeries.get(template.id) ?? [];

		// generateOccurrences is bounded by min(endDate, now + horizonDays); pass a
		// horizon wide enough to reach rangeEnd, then filter to (now, rangeEnd].
		const horizonDays = Math.max(0, Math.ceil((rangeEnd - now) / 86_400_000)) + 1;

		// template.exclusions is number[] | undefined — matches GenerateOptions.exclusions exactly.
		const timestamps = generateOccurrences({
			rule,
			startDate: template.start_date,
			horizonDays,
			now,
			endDate: template.end_date,
			endCount: template.end_count,
			exclusions: template.exclusions,
		});

		const { slots: materializedSlots, orphanTimestamps } = seriesOccupancy(
			template.id,
			seriesRows,
			timestamps
		);

		for (const ts of timestamps) {
			if (isDue(ts, now) || ts < rangeStart || ts > rangeEnd) continue;
			if (orphanTimestamps.has(ts)) continue;
			const civil = toCivilDate(ts);
			if (excludedCivil.has(civil)) continue;
			if (materializedSlots.has(civil)) continue;

			out.push({
				id: occurrenceId(template.id, civil),
				from_entity_id: template.from_entity_id,
				to_entity_id: template.to_entity_id,
				amount_minor: template.amount_minor,
				currency: template.currency,
				timestamp: ts,
				note: template.note ?? undefined,
				series_id: template.id,
				is_confirmed: false,
				isVirtual: true,
			});
		}
	}

	return out;
}
