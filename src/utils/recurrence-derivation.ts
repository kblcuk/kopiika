import type { Transaction } from '@/src/types';
import type { RecurrenceRule, RecurrenceTemplate } from '@/src/types/recurrence';
import { isDue } from './due';
import {
	generateOccurrences,
	occurrenceId,
	occurrenceSlotCivilDate,
	toCivilDate,
} from './recurrence';

/**
 * Derive the recurrence occurrences that are NOT YET DUE (strictly later than
 * `now`'s civil day, up to `rangeEnd`) and not yet materialized as real rows.
 * Occurrences due today or earlier are materialized by `backfillRecurrences`
 * instead (KII-159) — this function only ever returns "upcoming" occurrences.
 * Pure — the single shared source of "upcoming" occurrences for both the
 * balance hook and the history screen, so the two surfaces can never drift.
 *
 * Dedup keys on `(series_id, occurrence SLOT)`, where the slot is read from the
 * real row's deterministic id and falls back to `toCivilDate(timestamp)` for
 * legacy random-id rows. Keying on the slot (not the row's current civil date)
 * matches `backfillRecurrences`: a row whose date the user edited still
 * suppresses the occurrence it was generated for, instead of resurrecting that
 * occurrence as a duplicate while shadowing whichever slot it landed on
 * (KII-157).
 *
 * It ALSO falls back to matching a materialized row by its raw millisecond
 * timestamp, but ONLY when that row's slot is "orphaned" — i.e. does not equal
 * the civil date of any occurrence this series currently generates. A slot's
 * label is baked into its id at creation time and never recomputed; a fresh
 * candidate's label is computed right here via the same `toCivilDate`. The two
 * are normally the same day for the same instant, but they can disagree for a
 * row created under a different civil-day derivation than the one running now
 * (an older app build, a different device/OS timezone database, a DST-table
 * update) — confirmed in the field as two rows for one instant, 21:22 UTC /
 * 00:22 next-day Helsinki, that landed on different sides of that boundary.
 * The orphan check is what keeps this from breaking KII-157: a row
 * legitimately moved onto another occurrence's exact instant (e.g. a
 * date-only edit that keeps the series' fixed hour-of-day) still has a real,
 * currently-generated slot of its own, so it is never treated as a stray
 * mislabeling of the instant it now merely coincides with.
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
		const materializedSlots = new Set(
			seriesRows.map(
				(t) => occurrenceSlotCivilDate(t.id, template.id) ?? toCivilDate(t.timestamp)
			)
		);

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

		// Rows whose slot doesn't match ANY occurrence this series currently
		// generates are orphaned — see doc comment. Their raw timestamp is the
		// only remaining reliable identity, so index them by it as a fallback.
		const generatedCivilDates = new Set(timestamps.map(toCivilDate));
		const orphanTimestamps = new Set(
			seriesRows
				.filter(
					(t) =>
						!generatedCivilDates.has(
							occurrenceSlotCivilDate(t.id, template.id) ?? toCivilDate(t.timestamp)
						)
				)
				.map((t) => t.timestamp)
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
