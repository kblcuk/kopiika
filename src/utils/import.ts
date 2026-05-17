import type { Entity, Plan, Transaction, MarketValueSnapshot } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	BALANCE_ADJUSTMENT_ENTITY_ID,
	createBalanceAdjustmentEntity,
} from '@/src/constants/system-entities';

export interface ParsedImportData {
	entities: Entity[];
	plans: Plan[];
	transactions: Transaction[];
	recurrenceTemplates: RecurrenceTemplate[];
	marketValueSnapshots: MarketValueSnapshot[];
}

export type DroppableItem = {
	kind: 'transaction' | 'recurrenceTemplate';
	id: string;
	reason: string;
};

type ParseResult =
	| { ok: true; data: ParsedImportData; droppable: DroppableItem[] }
	| { ok: false; errors: string[] };

const VALID_ENTITY_TYPES = new Set(['income', 'account', 'category', 'saving']);

/**
 * Parse a single CSV line, handling quoted fields with "" escapes.
 * Needed because entity names and transaction notes can contain commas/quotes.
 */
export function parseCsvLine(line: string): string[] {
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
		} else if (ch === ',') {
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
 * Split combined CSV content into sections by # ENTITIES / # PLANS / # TRANSACTIONS markers.
 * Returns null with error message if markers are missing.
 */
function splitSections(content: string): {
	entities: string;
	plans: string;
	transactions: string;
	recurrenceTemplates: string;
	marketValueSnapshots: string;
} | null {
	const entitiesIdx = content.indexOf('# ENTITIES');
	const plansIdx = content.indexOf('# PLANS');
	const transactionsIdx = content.indexOf('# TRANSACTIONS');
	const recurrenceTemplatesIdx = content.indexOf('# RECURRENCE_TEMPLATES');
	const marketValueSnapshotsIdx = content.indexOf('# MARKET_VALUE_SNAPSHOTS');

	if (entitiesIdx === -1 || plansIdx === -1 || transactionsIdx === -1) {
		return null;
	}

	// Transactions end at recurrence_templates if present, else market_value_snapshots if present, else EOF.
	const transactionsEndIdx =
		recurrenceTemplatesIdx !== -1
			? recurrenceTemplatesIdx
			: marketValueSnapshotsIdx !== -1
				? marketValueSnapshotsIdx
				: undefined;

	// Recurrence templates end at market_value_snapshots if present, else EOF.
	const recurrenceTemplatesEndIdx =
		marketValueSnapshotsIdx !== -1 ? marketValueSnapshotsIdx : undefined;

	return {
		entities: content.slice(entitiesIdx + '# ENTITIES'.length, plansIdx).trim(),
		plans: content.slice(plansIdx + '# PLANS'.length, transactionsIdx).trim(),
		transactions: content
			.slice(transactionsIdx + '# TRANSACTIONS'.length, transactionsEndIdx)
			.trim(),
		recurrenceTemplates:
			recurrenceTemplatesIdx === -1
				? ''
				: content
						.slice(
							recurrenceTemplatesIdx + '# RECURRENCE_TEMPLATES'.length,
							recurrenceTemplatesEndIdx
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
	if (lines.length === 0) return [];

	const headers = parseCsvLine(lines[0]);
	return lines.slice(1).map((line) => {
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

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const lineNum = i + 1;

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

		const order = Number(row.order || '0');
		const rowNum = Number(row.row || '0');
		const position = Number(row.position || '0');

		if (isNaN(order) || isNaN(rowNum) || isNaN(position)) {
			errors.push(`Entity row ${lineNum}: order/row/position must be numbers`);
			continue;
		}

		result.push({
			id: row.id,
			type: row.type as Entity['type'],
			name: row.name,
			currency: row.currency,
			icon: row.icon || null,
			color: row.color || null,
			order,
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

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const lineNum = i + 1;

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

		const amount = Number(row.amount);
		if (isNaN(amount)) {
			errors.push(
				`Market value snapshot row ${lineNum}: amount "${row.amount}" is not a valid number`
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
			amount,
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

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const lineNum = i + 1;

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

		const planned_amount = Number(row.planned_amount);
		if (isNaN(planned_amount)) {
			errors.push(
				`Plan row ${lineNum}: planned_amount "${row.planned_amount}" is not a valid number`
			);
			continue;
		}

		result.push({
			id: row.id,
			entity_id: row.entity_id,
			period: row.period,
			period_start: row.period_start,
			planned_amount,
		});
	}

	return result;
}

function parseTransactions(
	rows: Record<string, string>[],
	entityIds: Set<string>,
	errors: string[],
	droppable: DroppableItem[]
): Transaction[] {
	const result: Transaction[] = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const lineNum = i + 1;

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
				id: row.id,
				reason: `to_entity_id "${row.to_entity_id}" not present in this import`,
			});
			continue;
		}

		const amount = Number(row.amount);
		if (isNaN(amount)) {
			errors.push(`Transaction row ${lineNum}: amount "${row.amount}" is not a valid number`);
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

		result.push({
			id: row.id,
			from_entity_id: row.from_entity_id,
			to_entity_id: row.to_entity_id,
			amount,
			currency: row.currency,
			timestamp,
			note: row.note || null,
			series_id: row.series_id || undefined,
			is_confirmed: row.is_confirmed === 'false' ? false : true,
		});
	}

	return result;
}

function parseRecurrenceTemplates(
	rows: Record<string, string>[],
	entityIds: Set<string>,
	errors: string[],
	droppable: DroppableItem[]
): RecurrenceTemplate[] {
	const result: RecurrenceTemplate[] = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const lineNum = i + 1;

		const missing: string[] = [];
		for (const field of [
			'id',
			'from_entity_id',
			'to_entity_id',
			'amount',
			'currency',
			'rule',
			'start_date',
			'horizon',
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

		const amount = Number(row.amount);
		const start_date = Number(row.start_date);
		const horizon = Number(row.horizon);
		const created_at = Number(row.created_at);
		if (isNaN(amount) || isNaN(start_date) || isNaN(horizon) || isNaN(created_at)) {
			errors.push(
				`Recurrence template row ${lineNum}: amount/start_date/horizon/created_at must be numbers`
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
			const parsedRule = JSON.parse(row.rule);
			if (!parsedRule || typeof parsedRule.type !== 'string') {
				errors.push(
					`Recurrence template row ${lineNum}: rule must be JSON with a "type" field`
				);
				continue;
			}
		} catch {
			errors.push(`Recurrence template row ${lineNum}: rule "${row.rule}" is not valid JSON`);
			continue;
		}

		if (row.exclusions) {
			try {
				const parsed = JSON.parse(row.exclusions);
				if (!Array.isArray(parsed)) {
					errors.push(
						`Recurrence template row ${lineNum}: exclusions must be a JSON array`
					);
					continue;
				}
			} catch {
				errors.push(
					`Recurrence template row ${lineNum}: exclusions "${row.exclusions}" is not valid JSON`
				);
				continue;
			}
		}

		if (!entityIds.has(row.from_entity_id)) {
			droppable.push({
				kind: 'recurrenceTemplate',
				id: row.id,
				reason: `from_entity_id "${row.from_entity_id}" not present in this import`,
			});
			continue;
		}
		if (!entityIds.has(row.to_entity_id)) {
			droppable.push({
				kind: 'recurrenceTemplate',
				id: row.id,
				reason: `to_entity_id "${row.to_entity_id}" not present in this import`,
			});
			continue;
		}

		result.push({
			id: row.id,
			from_entity_id: row.from_entity_id,
			to_entity_id: row.to_entity_id,
			amount,
			currency: row.currency,
			note: row.note || null,
			rule: row.rule,
			start_date,
			end_date,
			end_count,
			horizon,
			exclusions: row.exclusions || null,
			is_deleted: row.is_deleted === 'true',
			created_at,
		});
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
	const droppable: DroppableItem[] = [];

	const entityRows = parseSection(sections.entities);
	const entities = parseEntities(entityRows, errors);

	// Auto-insert system entity if missing
	const entityIds = new Set(entities.map((e) => e.id));
	if (!entityIds.has(BALANCE_ADJUSTMENT_ENTITY_ID)) {
		entities.push(createBalanceAdjustmentEntity());
		entityIds.add(BALANCE_ADJUSTMENT_ENTITY_ID);
	}

	const planRows = parseSection(sections.plans);
	const plans = parsePlans(planRows, entityIds, errors);

	const transactionRows = parseSection(sections.transactions);
	const transactions = parseTransactions(transactionRows, entityIds, errors, droppable);

	const recurrenceTemplateRows = parseSection(sections.recurrenceTemplates);
	const recurrenceTemplates = parseRecurrenceTemplates(
		recurrenceTemplateRows,
		entityIds,
		errors,
		droppable
	);

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
	};
}

export function formatImportErrors(errors: string[]): string {
	return errors.join('\n');
}
