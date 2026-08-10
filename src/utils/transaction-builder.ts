import type { Transaction } from '@/src/types';
import type { RecurrenceRule, RecurrenceTemplate } from '@/src/types/recurrence';
import { generateId } from './ids';
import { parseAmountToMinor } from './format';
import type { MutationInput } from './transaction-validation';

/**
 * Pure builders for "a Transaction is born" and friends. These functions own
 * ID generation, timestamp normalization, default `is_confirmed`, split-row
 * derivation, and recurrence-template construction — concerns that previously
 * lived inside `TransactionModal` and bypassed unit testing.
 *
 * Validation is the responsibility of `transaction-validation.ts`, run at the
 * mutation boundary in the store. Builders trust their inputs to be shaped
 * correctly; they do NOT enforce domain rules.
 *
 * KII-120: all monetary inputs are integer minor units (cents for EUR). String
 * inputs from the UI flow through `parseAmountToMinor` first; numeric inputs
 * are already in minor units by contract.
 */

export interface TransactionDraft extends MutationInput {
	/** Explicit row id. When omitted, a fresh id is generated. Used for
	 * deterministic recurrence-occurrence ids (`${series_id}:${YYYY-MM-DD}`). */
	id?: string;
	timestamp: number;
	note?: string;
	series_id?: string;
	split_id?: string;
	is_confirmed?: boolean;
	notification_id?: string;
}

/**
 * Stamps the wall-clock time-of-day from `now` onto a calendar `date`. Used
 * when the user picks a date via a date-only picker: the resulting transaction
 * is recorded at "the picked day, but at this exact moment".
 */
export function normalizeCreateTimestamp(date: Date, now: Date = new Date()): number {
	const result = new Date(date);
	result.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
	return result.getTime();
}

/** Past or now → confirmed; future → unconfirmed. */
export function defaultIsConfirmed(timestamp: number, now: number = Date.now()): boolean {
	return timestamp <= now;
}

export function buildTransaction(draft: TransactionDraft, now: number = Date.now()): Transaction {
	const tx: Transaction = {
		id: draft.id ?? generateId(),
		from_entity_id: draft.from_entity_id,
		to_entity_id: draft.to_entity_id,
		amount_minor: draft.amount_minor,
		currency: draft.currency,
		timestamp: draft.timestamp,
		is_confirmed: draft.is_confirmed ?? defaultIsConfirmed(draft.timestamp, now),
	};
	if (draft.note !== undefined) tx.note = draft.note;
	if (draft.series_id !== undefined) tx.series_id = draft.series_id;
	if (draft.split_id !== undefined) tx.split_id = draft.split_id;
	if (draft.notification_id !== undefined) tx.notification_id = draft.notification_id;
	return tx;
}

interface SplitRowInput {
	/** `null` rows are dropped silently (used by partially-filled split UI). */
	toEntityId: string | null;
	/** User-typed string, locale-normalized; ignored for the anchor (index 0). */
	amount: string;
}

export interface BuildSplitRowsArgs {
	fromEntityId: string;
	currency: string;
	timestamp: number;
	note?: string;
	/** The total typed by the user (in integer minor units) before splitting. */
	splitTotalMinor: number;
	/** First entry is the anchor; subsequent entries are user-edited shares. */
	splits: SplitRowInput[];
	now?: number;
}

/**
 * Builds the transaction rows for a split. Anchor row (index 0) auto-computes
 * its amount as `splitTotalMinor - sum(non-anchor amounts)`. Non-anchor rows
 * with missing entity / non-positive amount are skipped silently. All arithmetic
 * is in integer minor units — the anchor's amount is exact, never re-rounded.
 */
export function buildSplitRows(args: BuildSplitRowsArgs): Transaction[] {
	if (args.splits.length === 0) return [];

	const rows: Transaction[] = [];
	const otherSum = args.splits.slice(1).reduce((sum, sp) => {
		const n = parseAmountToMinor(sp.amount, args.currency);
		return sum + (Number.isFinite(n) ? n : 0);
	}, 0);
	const anchorAmountMinor = args.splitTotalMinor - otherSum;

	const anchor = args.splits[0]!;
	if (anchor.toEntityId && anchorAmountMinor > 0) {
		rows.push(
			buildTransaction(
				{
					from_entity_id: args.fromEntityId,
					to_entity_id: anchor.toEntityId,
					amount_minor: anchorAmountMinor,
					currency: args.currency,
					timestamp: args.timestamp,
					note: args.note,
				},
				args.now
			)
		);
	}

	for (const sp of args.splits.slice(1)) {
		const amtMinor = parseAmountToMinor(sp.amount, args.currency);
		if (!sp.toEntityId || !Number.isFinite(amtMinor) || amtMinor <= 0) continue;
		rows.push(
			buildTransaction(
				{
					from_entity_id: args.fromEntityId,
					to_entity_id: sp.toEntityId,
					amount_minor: amtMinor,
					currency: args.currency,
					timestamp: args.timestamp,
					note: args.note,
				},
				args.now
			)
		);
	}

	// KII-146: the legs of one split share a `split_id` so bank-CSV
	// reconciliation can fold them back into the single charge the bank
	// reported. Stamped here rather than at the batch layer because callers
	// commit split rows alongside savings releases, which are not legs.
	// Fewer than two surviving rows is not a split.
	if (rows.length >= 2) {
		const splitId = generateId();
		for (const row of rows) row.split_id = splitId;
	}

	return rows;
}

interface FundedReservation {
	savingEntityId: string;
	fundAmountMinor: number;
}

export interface BuildSavingsReleasesArgs {
	accountId: string;
	currency: string;
	timestamp: number;
	funded: FundedReservation[];
	now?: number;
}

/**
 * Saving → account release rows that fund a transaction. Always
 * `is_confirmed: true`: releases are immediate and decoupled from the
 * referencing transaction's date.
 */
export function buildSavingsReleases(args: BuildSavingsReleasesArgs): Transaction[] {
	return args.funded
		.filter((f) => Number.isFinite(f.fundAmountMinor) && f.fundAmountMinor > 0)
		.map((f) =>
			buildTransaction(
				{
					from_entity_id: f.savingEntityId,
					to_entity_id: args.accountId,
					amount_minor: f.fundAmountMinor,
					currency: args.currency,
					timestamp: args.timestamp,
					is_confirmed: true,
				},
				args.now
			)
		);
}

export interface BuildRecurringTemplateArgs {
	from_entity_id: string;
	to_entity_id: string;
	amount_minor: number;
	currency: string;
	/** First occurrence timestamp (a.k.a. start_date). */
	timestamp: number;
	note?: string;
	rule: RecurrenceRule;
	endDate?: number | null;
	endCount?: number | null;
	now?: number;
}

export function buildRecurringTemplate(args: BuildRecurringTemplateArgs): RecurrenceTemplate {
	return {
		id: generateId(),
		from_entity_id: args.from_entity_id,
		to_entity_id: args.to_entity_id,
		amount_minor: args.amount_minor,
		currency: args.currency,
		note: args.note,
		rule: JSON.stringify(args.rule),
		start_date: args.timestamp,
		end_date: args.endDate ?? null,
		end_count: args.endCount ?? null,
		created_at: args.now ?? Date.now(),
	};
}
