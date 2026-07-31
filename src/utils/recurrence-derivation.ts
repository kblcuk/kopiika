import type { Transaction } from '@/src/types';
import type { RecurrenceRule, RecurrenceTemplate } from '@/src/types/recurrence';
import {
	generateOccurrences,
	occurrenceId,
	occurrenceSlotCivilDate,
	toCivilDate,
} from './recurrence';

/**
 * Derive the FUTURE recurrence occurrences (strictly after `now`, up to
 * `rangeEnd`) that are not yet materialized as real rows. Pure — the single
 * shared source of "upcoming" occurrences for both the balance hook and the
 * history screen, so the two surfaces can never drift.
 *
 * Dedup keys on `(series_id, occurrence SLOT)`, where the slot is read from the
 * real row's deterministic id and falls back to `toCivilDate(timestamp)` for
 * legacy random-id rows. Keying on the slot (not the row's current civil date)
 * matches `backfillRecurrences`: a row whose date the user edited still
 * suppresses the occurrence it was generated for, instead of resurrecting that
 * occurrence as a duplicate while shadowing whichever slot it landed on
 * (KII-157).
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
	// Occurrence slots already materialized per series (any real row counts).
	const realBySeries = new Map<string, Set<string>>();
	for (const tx of realTransactions) {
		if (!tx.series_id) continue;
		let set = realBySeries.get(tx.series_id);
		if (!set) {
			set = new Set();
			realBySeries.set(tx.series_id, set);
		}
		set.add(occurrenceSlotCivilDate(tx.id, tx.series_id) ?? toCivilDate(tx.timestamp));
	}

	const out: Transaction[] = [];

	for (const template of templates) {
		if (template.is_deleted) continue;

		const rule: RecurrenceRule = JSON.parse(template.rule);
		const excludedCivil = exclusionsByTemplate.get(template.id) ?? new Set<string>();
		const materializedSlots = realBySeries.get(template.id) ?? new Set<string>();

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

		for (const ts of timestamps) {
			if (ts <= now || ts < rangeStart || ts > rangeEnd) continue;
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
