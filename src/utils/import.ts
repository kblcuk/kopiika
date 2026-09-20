import type { Entity, Plan, Transaction, MarketValueSnapshot } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	BALANCE_ADJUSTMENT_ENTITY_ID,
	createBalanceAdjustmentEntity,
} from '@/src/constants/system-entities';
import { validateTransaction } from './transaction-validation';
import { defaultIsConfirmed } from './transaction-builder';
import { resolveAppCurrency } from './app-currency';

export interface ParsedImportData {
	entities: Entity[];
	plans: Plan[];
	transactions: Transaction[];
	recurrenceTemplates: RecurrenceTemplate[];
	marketValueSnapshots: MarketValueSnapshot[];
}

/**
 * Why a row was flagged. The prompt groups by this rather than listing rows:
 * `id` is an internal string a user can neither recognise nor act on, and one
 * bullet per row overflowed a small phone screen for even a modest import.
 */
export type ImportNoticeCode = 'missing-entity' | 'dangling-series';

export type ImportNotice = {
	kind: 'transaction' | 'recurrenceTemplate';
	code: ImportNoticeCode;
	id: string;
	/** Full detail, kept for logs and tests; the prompt shows the summary. */
	reason: string;
};

type ParseResult =
	| {
			ok: true;
			data: ParsedImportData;
			/** Rows that will NOT reach the database — skipped entirely. */
			droppable: ImportNotice[];
			/**
			 * Rows that WILL be imported, with the single change named in
			 * `reason` (today: a dead `series_id` severed). Kept apart from
			 * `droppable` so the confirmation prompt can say which is which —
			 * they used to share one list under one "can't be imported"
			 * summary, which told users their transactions were about to be
			 * discarded when they were not.
			 */
			adjusted: ImportNotice[];
	  }
	| { ok: false; errors: string[] };

const VALID_ENTITY_TYPES = new Set(['income', 'account', 'category', 'saving']);

/**
 * Parse a single CSV line, handling quoted fields with "" escapes.
 * Supports custom delimiters for semicolon-separated, tab-separated, etc.
 * Needed because entity names and transaction notes can contain commas/quotes.
 */
export function splitCsvLine(line: string, delimiter = ','): string[] {
	const fields: string[] = [];
	let current = '';
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const ch = line[i];

		if (inQuotes) {
			if (ch === '"') {
				// Escaped quote ("") or end of quoted field
				if (i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i += 2;
				} else {
					inQuotes = false;
					i++;
				}
			} else {
				current += ch;
				i++;
			}
		} else if (ch === '"') {
			inQuotes = true;
			i++;
		} else if (ch === delimiter) {
			fields.push(current);
			current = '';
			i++;
		} else {
			current += ch;
			i++;
		}
	}
	fields.push(current);
	return fields;
}

/**
 * Parse a single CSV line on comma delimiter.
 * Delegates to splitCsvLine for backward compatibility.
 */
export function parseCsvLine(line: string): string[] {
	return splitCsvLine(line, ',');
}

/**
 * Split combined CSV content into sections by # ENTITIES / # PLANS / # TRANSACTIONS markers.
 * Returns null with error message if markers are missing.
 */
function splitSections(content: string): {
	entities: string;
	plans: string;
	transactions: string;
	recurrenceTemplates: string;
	recurrenceExclusions: string;
	marketValueSnapshots: string;
} | null {
	const entitiesIdx = content.indexOf('# ENTITIES');
	const plansIdx = content.indexOf('# PLANS');
	const transactionsIdx = content.indexOf('# TRANSACTIONS');
	const recurrenceTemplatesIdx = content.indexOf('# RECURRENCE_TEMPLATES');
	// KII-123: optional section. Older exports (pre-KII-123) put exclusions
	// inline on the templates rows; new ones use a dedicated section.
	const recurrenceExclusionsIdx = content.indexOf('# RECURRENCE_EXCLUSIONS');
	const marketValueSnapshotsIdx = content.indexOf('# MARKET_VALUE_SNAPSHOTS');

	if (entitiesIdx === -1 || plansIdx === -1 || transactionsIdx === -1) {
		return null;
	}

	// Pick the earliest downstream marker after each section to bound its slice.
	const firstAfter = (start: number, candidates: number[]): number | undefined => {
		const later = candidates.filter((c) => c > start);
		return later.length > 0 ? Math.min(...later) : undefined;
	};
	const downstreamFromTransactions = firstAfter(transactionsIdx, [
		recurrenceTemplatesIdx,
		recurrenceExclusionsIdx,
		marketValueSnapshotsIdx,
	]);
	const downstreamFromTemplates =
		recurrenceTemplatesIdx === -1
			? undefined
			: firstAfter(recurrenceTemplatesIdx, [
					recurrenceExclusionsIdx,
					marketValueSnapshotsIdx,
				]);
	const downstreamFromExclusions =
		recurrenceExclusionsIdx === -1
			? undefined
			: firstAfter(recurrenceExclusionsIdx, [marketValueSnapshotsIdx]);

	return {
		entities: content.slice(entitiesIdx + '# ENTITIES'.length, plansIdx).trim(),
		plans: content.slice(plansIdx + '# PLANS'.length, transactionsIdx).trim(),
		transactions: content
			.slice(transactionsIdx + '# TRANSACTIONS'.length, downstreamFromTransactions)
			.trim(),
		recurrenceTemplates:
			recurrenceTemplatesIdx === -1
				? ''
				: content
						.slice(
							recurrenceTemplatesIdx + '# RECURRENCE_TEMPLATES'.length,
							downstreamFromTemplates
						)
						.trim(),
		recurrenceExclusions:
			recurrenceExclusionsIdx === -1
				? ''
				: content
						.slice(
							recurrenceExclusionsIdx + '# RECURRENCE_EXCLUSIONS'.length,
							downstreamFromExclusions
						)
						.trim(),
		marketValueSnapshots:
			marketValueSnapshotsIdx === -1
				? ''
				: content.slice(marketValueSnapshotsIdx + '# MARKET_VALUE_SNAPSHOTS'.length).trim(),
	};
}

/**
 * Parse rows from a CSV section (header + data lines).
 * Returns array of objects keyed by header names.
 */
function parseSection(csv: string): Record<string, string>[] {
	if (!csv) return [];

	const lines = csv.split('\n').filter((l) => l.trim() !== '');
	const [headerLine, ...dataLines] = lines;
	if (!headerLine) return [];

	const headers = parseCsvLine(headerLine);
	return dataLines.map((line) => {
		const values = parseCsvLine(line);
		const obj: Record<string, string> = {};
		headers.forEach((h, i) => {
			obj[h] = values[i] ?? '';
		});
		return obj;
	});
}

function parseEntities(rows: Record<string, string>[], errors: string[]): Entity[] {
	const result: Entity[] = [];

	for (const [idx, row] of rows.entries()) {
		const lineNum = idx + 1;

		if (!row.id) {
			errors.push(`Entity row ${lineNum}: missing id`);
			continue;
		}
		if (!row.type || !VALID_ENTITY_TYPES.has(row.type)) {
			errors.push(
				`Entity row ${lineNum}: invalid type "${row.type}" (must be income, account, category, or saving)`
			);
			continue;
		}
		if (!row.name) {
			errors.push(`Entity row ${lineNum}: missing name`);
			continue;
		}
		if (!row.currency) {
			errors.push(`Entity row ${lineNum}: missing currency`);
			continue;
		}

		const rowNum = Number(row.row || '0');
		const position = Number(row.position || '0');

		if (isNaN(rowNum) || isNaN(position)) {
			errors.push(`Entity row ${lineNum}: row/position must be numbers`);
			continue;
		}

		result.push({
			id: row.id,
			type: row.type as Entity['type'],
			name: row.name,
			currency: row.currency,
			icon: row.icon || null,
			color: row.color || null,
			row: rowNum,
			position,
			include_in_total: row.include_in_total !== 'false',
			is_deleted: row.is_deleted === 'true',
			is_default: row.is_default === 'true',
			is_investment: row.is_investment === 'true',
		});
	}

	return result;
}

function parseMarketValueSnapshots(
	rows: Record<string, string>[],
	entityIds: Set<string>,
	errors: string[]
): MarketValueSnapshot[] {
	const result: MarketValueSnapshot[] = [];

	for (const [idx, row] of rows.entries()) {
		const lineNum = idx + 1;

		if (!row.id) {
			errors.push(`Market value snapshot row ${lineNum}: missing id`);
			continue;
		}
		if (!row.entity_id) {
			errors.push(`Market value snapshot row ${lineNum}: missing entity_id`);
			continue;
		}
		if (!entityIds.has(row.entity_id)) {
			errors.push(
				`Market value snapshot row ${lineNum}: entity_id "${row.entity_id}" not found in imported entities`
			);
			continue;
		}

		const amount_minor = Number(row.amount_minor);
		if (!Number.isInteger(amount_minor)) {
			errors.push(
				`Market value snapshot row ${lineNum}: amount_minor "${row.amount_minor}" is not a valid integer (KII-120: minor units)`
			);
			continue;
		}

		if (!row.currency) {
			errors.push(`Market value snapshot row ${lineNum}: missing currency`);
			continue;
		}

		const date = Number(row.date);
		if (isNaN(date)) {
			errors.push(
				`Market value snapshot row ${lineNum}: date "${row.date}" is not a valid number`
			);
			continue;
		}

		result.push({
			id: row.id,
			entity_id: row.entity_id,
			amount_minor,
			currency: row.currency,
			date,
		});
	}

	return result;
}

function parsePlans(
	rows: Record<string, string>[],
	entityIds: Set<string>,
	errors: string[]
): Plan[] {
	const result: Plan[] = [];

	for (const [idx, row] of rows.entries()) {
		const lineNum = idx + 1;

		if (!row.id) {
			errors.push(`Plan row ${lineNum}: missing id`);
			continue;
		}
		if (!row.entity_id) {
			errors.push(`Plan row ${lineNum}: missing entity_id`);
			continue;
		}
		if (!entityIds.has(row.entity_id)) {
			errors.push(
				`Plan row ${lineNum}: entity_id "${row.entity_id}" not found in imported entities`
			);
			continue;
		}
		if (!row.period) {
			errors.push(`Plan row ${lineNum}: missing period`);
			continue;
		}
		if (!row.period_start) {
			errors.push(`Plan row ${lineNum}: missing period_start`);
			continue;
		}

		const planned_amount_minor = Number(row.planned_amount_minor);
		if (!Number.isInteger(planned_amount_minor)) {
			errors.push(
				`Plan row ${lineNum}: planned_amount_minor "${row.planned_amount_minor}" is not a valid integer (KII-120: minor units)`
			);
			continue;
		}

		result.push({
			id: row.id,
			entity_id: row.entity_id,
			period: row.period,
			period_start: row.period_start,
			planned_amount_minor,
		});
	}

	return result;
}

function parseTransactions(
	rows: Record<string, string>[],
	entities: Entity[],
	entityIds: Set<string>,
	errors: string[],
	droppable: ImportNotice[]
): Transaction[] {
	const result: Transaction[] = [];

	for (const [idx, row] of rows.entries()) {
		const lineNum = idx + 1;

		if (!row.id) {
			errors.push(`Transaction row ${lineNum}: missing id`);
			continue;
		}
		if (!row.from_entity_id) {
			errors.push(`Transaction row ${lineNum}: missing from_entity_id`);
			continue;
		}
		if (!entityIds.has(row.from_entity_id)) {
			droppable.push({
				kind: 'transaction',
				code: 'missing-entity',
				id: row.id,
				reason: `from_entity_id "${row.from_entity_id}" not present in this import`,
			});
			continue;
		}
		if (!row.to_entity_id) {
			errors.push(`Transaction row ${lineNum}: missing to_entity_id`);
			continue;
		}
		if (!entityIds.has(row.to_entity_id)) {
			droppable.push({
				kind: 'transaction',
				code: 'missing-entity',
				id: row.id,
				reason: `to_entity_id "${row.to_entity_id}" not present in this import`,
			});
			continue;
		}

		const amount_minor = Number(row.amount_minor);
		if (!Number.isInteger(amount_minor)) {
			errors.push(
				`Transaction row ${lineNum}: amount_minor "${row.amount_minor}" is not a valid integer (KII-120: minor units)`
			);
			continue;
		}

		if (!row.currency) {
			errors.push(`Transaction row ${lineNum}: missing currency`);
			continue;
		}

		const timestamp = Number(row.timestamp);
		if (isNaN(timestamp)) {
			errors.push(
				`Transaction row ${lineNum}: timestamp "${row.timestamp}" is not a valid number`
			);
			continue;
		}

		const validation = validateTransaction(
			{
				from_entity_id: row.from_entity_id,
				to_entity_id: row.to_entity_id,
				amount_minor,
				currency: row.currency,
			},
			entities,
			{ allowDeletedEntities: true }
		);
		if (!validation.ok) {
			errors.push(`Transaction row ${lineNum}: ${validation.message}`);
			continue;
		}

		result.push({
			id: row.id,
			from_entity_id: row.from_entity_id,
			to_entity_id: row.to_entity_id,
			amount_minor,
			currency: row.currency,
			timestamp,
			note: row.note || null,
			series_id: row.series_id || null,
			split_id: row.split_id || null,
			is_confirmed:
				row.is_confirmed === 'true'
					? true
					: row.is_confirmed === 'false'
						? false
						: defaultIsConfirmed(timestamp),
		});
	}

	return result;
}

function parseRecurrenceTemplates(
	rows: Record<string, string>[],
	entities: Entity[],
	entityIds: Set<string>,
	errors: string[],
	droppable: ImportNotice[]
): RecurrenceTemplate[] {
	const result: RecurrenceTemplate[] = [];

	for (const [idx, row] of rows.entries()) {
		const lineNum = idx + 1;

		const missing: string[] = [];
		for (const field of [
			'id',
			'from_entity_id',
			'to_entity_id',
			'amount_minor',
			'currency',
			'rule',
			'start_date',
			'created_at',
		]) {
			if (!row[field]) missing.push(field);
		}
		if (missing.length > 0) {
			errors.push(
				`Recurrence template row ${lineNum}: missing required field(s): ${missing.join(', ')}`
			);
			continue;
		}

		// All required fields verified present by the missing-check above; pull
		// into typed locals so downstream code sees `string`, not `string | undefined`.
		const id = row.id!;
		const from_entity_id = row.from_entity_id!;
		const to_entity_id = row.to_entity_id!;
		const currency = row.currency!;
		const rule = row.rule!;

		const amount_minor = Number(row.amount_minor);
		const start_date = Number(row.start_date);
		const created_at = Number(row.created_at);
		if (!Number.isInteger(amount_minor)) {
			errors.push(
				`Recurrence template row ${lineNum}: amount_minor "${row.amount_minor}" is not a valid integer (KII-120: minor units)`
			);
			continue;
		}
		if (isNaN(start_date) || isNaN(created_at)) {
			errors.push(
				`Recurrence template row ${lineNum}: start_date/created_at must be numbers`
			);
			continue;
		}

		let end_date: number | null = null;
		if (row.end_date) {
			const parsed = Number(row.end_date);
			if (isNaN(parsed)) {
				errors.push(`Recurrence template row ${lineNum}: end_date must be a number`);
				continue;
			}
			end_date = parsed;
		}

		let end_count: number | null = null;
		if (row.end_count) {
			const parsed = Number(row.end_count);
			if (isNaN(parsed)) {
				errors.push(`Recurrence template row ${lineNum}: end_count must be a number`);
				continue;
			}
			end_count = parsed;
		}

		try {
			const parsedRule = JSON.parse(rule);
			if (!parsedRule || typeof parsedRule.type !== 'string') {
				errors.push(
					`Recurrence template row ${lineNum}: rule must be JSON with a "type" field`
				);
				continue;
			}
		} catch {
			errors.push(`Recurrence template row ${lineNum}: rule "${rule}" is not valid JSON`);
			continue;
		}

		// KII-123: back-compat for older CSV exports that embedded exclusions
		// as a JSON array on the template row. The current schema stores them
		// in a separate `# RECURRENCE_EXCLUSIONS` section. We parse the legacy
		// shape here and merge with the dedicated section in the caller.
		let legacyExclusions: number[] | undefined;
		if (row.exclusions) {
			try {
				const parsed = JSON.parse(row.exclusions);
				if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'number')) {
					errors.push(
						`Recurrence template row ${lineNum}: exclusions must be a JSON array of numbers`
					);
					continue;
				}
				legacyExclusions = parsed;
			} catch {
				errors.push(
					`Recurrence template row ${lineNum}: exclusions "${row.exclusions}" is not valid JSON`
				);
				continue;
			}
		}

		if (!entityIds.has(from_entity_id)) {
			droppable.push({
				kind: 'recurrenceTemplate',
				code: 'missing-entity',
				id,
				reason: `from_entity_id "${from_entity_id}" not present in this import`,
			});
			continue;
		}
		if (!entityIds.has(to_entity_id)) {
			droppable.push({
				kind: 'recurrenceTemplate',
				code: 'missing-entity',
				id,
				reason: `to_entity_id "${to_entity_id}" not present in this import`,
			});
			continue;
		}

		const validation = validateTransaction(
			{
				from_entity_id,
				to_entity_id,
				amount_minor,
				currency,
			},
			entities,
			{ allowDeletedEntities: true }
		);
		if (!validation.ok) {
			errors.push(`Recurrence template row ${lineNum}: ${validation.message}`);
			continue;
		}

		result.push({
			id,
			from_entity_id,
			to_entity_id,
			amount_minor,
			currency,
			note: row.note || null,
			rule,
			start_date,
			end_date,
			end_count,
			exclusions: legacyExclusions,
			is_deleted: row.is_deleted === 'true',
			created_at,
		});
	}

	return result;
}

/**
 * Parse the dedicated `# RECURRENCE_EXCLUSIONS` section into a map of
 * `templateId → number[]`. Rows whose `template_id` does not appear in the
 * parsed templates are silently dropped — they would orphan in the FK-enforced
 * DB anyway, and surfacing them as a hard error would be too strict for a
 * forgiving CSV importer.
 */
function parseRecurrenceExclusions(
	rows: Record<string, string>[],
	templateIds: Set<string>,
	errors: string[]
): Map<string, number[]> {
	const result = new Map<string, number[]>();
	for (const [idx, row] of rows.entries()) {
		const lineNum = idx + 1;
		const templateId = row.template_id;
		if (!templateId) {
			errors.push(`Recurrence exclusion row ${lineNum}: missing template_id`);
			continue;
		}
		const ts = Number(row.timestamp);
		if (!row.timestamp || isNaN(ts)) {
			errors.push(
				`Recurrence exclusion row ${lineNum}: timestamp "${row.timestamp}" is not a valid number`
			);
			continue;
		}
		if (!templateIds.has(templateId)) continue;
		const list = result.get(templateId);
		if (list) list.push(ts);
		else result.set(templateId, [ts]);
	}
	return result;
}

/**
 * Parse a combined CSV import file with # ENTITIES / # PLANS / # TRANSACTIONS sections,
 * and an optional # MARKET_VALUE_SNAPSHOTS section.
 * Returns parsed data or validation errors.
 */
export function parseImportCsv(content: string): ParseResult {
	const sections = splitSections(content);
	if (!sections) {
		return {
			ok: false,
			errors: [
				'Invalid format: file must contain # ENTITIES, # PLANS, and # TRANSACTIONS section markers',
			],
		};
	}

	const errors: string[] = [];
	const droppable: ImportNotice[] = [];
	const adjusted: ImportNotice[] = [];

	const entityRows = parseSection(sections.entities);
	const entities = parseEntities(entityRows, errors);

	// Auto-insert system entity if missing
	const entityIds = new Set(entities.map((e) => e.id));
	if (!entityIds.has(BALANCE_ADJUSTMENT_ENTITY_ID)) {
		const importedCurrency = resolveAppCurrency(entities, null);
		entities.push(createBalanceAdjustmentEntity(importedCurrency));
		entityIds.add(BALANCE_ADJUSTMENT_ENTITY_ID);
	}

	const planRows = parseSection(sections.plans);
	const plans = parsePlans(planRows, entityIds, errors);

	const transactionRows = parseSection(sections.transactions);
	const transactions = parseTransactions(transactionRows, entities, entityIds, errors, droppable);

	const recurrenceTemplateRows = parseSection(sections.recurrenceTemplates);
	const recurrenceTemplates = parseRecurrenceTemplates(
		recurrenceTemplateRows,
		entities,
		entityIds,
		errors,
		droppable
	);

	// KII-123: Merge exclusions from the dedicated section into each template's
	// in-memory `exclusions` array, deduplicating against any legacy inline
	// values (back-compat). New exports never produce both, but a hand-edited
	// or partial-merge CSV could — `Set` collapses duplicates.
	const templateIds = new Set(recurrenceTemplates.map((t) => t.id));

	// A transaction's `series_id` has no FK, so it can reference a template that
	// is not an *active* series in this file — exports omit soft-deleted templates
	// (the store only loads active ones), templates get dropped for a missing
	// entity, and hand-edited CSVs are unconstrained. Keying off active templates
	// matches what the store will actually load: a row pointing at an absent or
	// soft-deleted template would otherwise render as recurring with an invisible
	// series and could no longer be deleted or split ("recurrence template … not
	// found"). Sever the dead link, keeping the row as a one-off — but surface it
	// via `adjusted` rather than silently mutating user data (import contract).
	// It belongs in `adjusted`, not `droppable`: the transaction itself is kept
	// in full and only its dead series link is severed.
	const activeTemplateIds = new Set(
		recurrenceTemplates.filter((t) => !t.is_deleted).map((t) => t.id)
	);
	for (const tx of transactions) {
		if (tx.series_id && !activeTemplateIds.has(tx.series_id)) {
			adjusted.push({
				kind: 'transaction',
				code: 'dangling-series',
				id: tx.id,
				reason: `series_id "${tx.series_id}" references a recurrence template that is absent or deleted in this import; imported as a one-off`,
			});
			tx.series_id = null;
		}
	}

	const exclusionRows = parseSection(sections.recurrenceExclusions);
	const exclusionsByTemplate = parseRecurrenceExclusions(exclusionRows, templateIds, errors);
	for (const template of recurrenceTemplates) {
		const fromSection = exclusionsByTemplate.get(template.id) ?? [];
		const merged = new Set<number>(template.exclusions ?? []);
		for (const ts of fromSection) merged.add(ts);
		template.exclusions = merged.size > 0 ? [...merged].sort((a, b) => a - b) : undefined;
	}

	const marketValueSnapshotRows = parseSection(sections.marketValueSnapshots);
	const marketValueSnapshots = parseMarketValueSnapshots(
		marketValueSnapshotRows,
		entityIds,
		errors
	);

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return {
		ok: true,
		data: { entities, plans, transactions, recurrenceTemplates, marketValueSnapshots },
		droppable,
		adjusted,
	};
}

export function formatImportErrors(errors: string[]): string {
	return errors.join('\n');
}

const NOTICE_SUMMARIES: Record<
	ImportNotice['kind'],
	Record<ImportNoticeCode, (count: number) => string>
> = {
	transaction: {
		'missing-entity': (n) =>
			`${plural(n, 'transaction')} using an account or category that isn't in the file`,
		'dangling-series': (n) =>
			`${plural(n, 'transaction')} whose repeating series isn't in the file - kept as one-offs`,
	},
	recurrenceTemplate: {
		'missing-entity': (n) =>
			`${plural(n, 'repeating series')} using an account or category that isn't in the file`,
		// Unreachable today (a template is only ever skipped, never adjusted),
		// but the table is total so a future adjustment can't fall through to
		// an empty bullet.
		'dangling-series': (n) => `${plural(n, 'repeating series')} with a broken link`,
	},
};

function plural(count: number, noun: string): string {
	if (noun.endsWith('s')) return `${count} ${noun}`;
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Collapse notices to one bullet per (kind, cause), in first-seen order.
 *
 * Listing every row put nine identical sentences on screen for one deleted
 * template, each led by an opaque internal id - past the bottom of an iPhone
 * 13 mini. The count is the part a user can act on.
 */
function summarizeNotices(notices: ImportNotice[]): string[] {
	const counts = new Map<
		string,
		{ kind: ImportNotice['kind']; code: ImportNoticeCode; n: number }
	>();
	for (const notice of notices) {
		const key = `${notice.kind}:${notice.code}`;
		const seen = counts.get(key);
		if (seen) {
			seen.n += 1;
		} else {
			counts.set(key, { kind: notice.kind, code: notice.code, n: 1 });
		}
	}
	return [...counts.values()].map(
		(group) => `• ${NOTICE_SUMMARIES[group.kind][group.code](group.n)}`
	);
}

/**
 * Build the pre-import confirmation prompt from a parse result.
 *
 * The two buckets are worded apart on purpose: a `droppable` row never reaches
 * the database, while an `adjusted` row is imported in full and only loses the
 * part named in its reason. The prompt used to summarise both as "N item(s)
 * can't be imported … continue without them", so a file whose only notice was a
 * severed `series_id` read as though its transactions were about to be thrown
 * away.
 */
export function formatImportNotices(
	droppable: ImportNotice[],
	adjusted: ImportNotice[]
): { title: string; message: string } {
	const sections: string[] = [];
	// Skipped first: it is the outcome that loses data, so it should not sit
	// below a list of rows that are being kept.
	if (droppable.length > 0) {
		sections.push(['Skipped, not imported:', ...summarizeNotices(droppable)].join('\n'));
	}
	if (adjusted.length > 0) {
		sections.push(['Imported, with a change:', ...summarizeNotices(adjusted)].join('\n'));
	}

	let title = 'Review before importing';
	if (droppable.length > 0 && adjusted.length === 0) {
		title = "Some items can't be imported";
	} else if (adjusted.length > 0 && droppable.length === 0) {
		title = 'Some items need a change';
	}

	return {
		title,
		message: `${sections.join('\n\n')}\n\nContinue, or cancel to fix the file?`,
	};
}
