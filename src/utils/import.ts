import type { Entity, Plan, Transaction } from '@/src/types';
import {
	BALANCE_ADJUSTMENT_ENTITY_ID,
	createBalanceAdjustmentEntity,
} from '@/src/constants/system-entities';

export interface ParsedImportData {
	entities: Entity[];
	plans: Plan[];
	transactions: Transaction[];
}

type ParseResult =
	| { ok: true; data: ParsedImportData }
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
function splitSections(
	content: string
): { entities: string; plans: string; transactions: string } | null {
	const entitiesIdx = content.indexOf('# ENTITIES');
	const plansIdx = content.indexOf('# PLANS');
	const transactionsIdx = content.indexOf('# TRANSACTIONS');

	if (entitiesIdx === -1 || plansIdx === -1 || transactionsIdx === -1) {
		return null;
	}

	return {
		entities: content.slice(entitiesIdx + '# ENTITIES'.length, plansIdx).trim(),
		plans: content.slice(plansIdx + '# PLANS'.length, transactionsIdx).trim(),
		transactions: content.slice(transactionsIdx + '# TRANSACTIONS'.length).trim(),
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

function parseEntities(
	rows: Record<string, string>[],
	errors: string[]
): Entity[] {
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
			errors.push(
				`Entity row ${lineNum}: order/row/position must be numbers`
			);
			continue;
		}

		result.push({
			id: row.id,
			type: row.type as Entity['type'],
			name: row.name,
			currency: row.currency,
			icon: row.icon || null,
			color: row.color || null,
			owner_id: row.owner_id || null,
			order,
			row: rowNum,
			position,
			include_in_total: row.include_in_total !== 'false',
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
	errors: string[]
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
			errors.push(
				`Transaction row ${lineNum}: from_entity_id "${row.from_entity_id}" not found in imported entities`
			);
			continue;
		}
		if (!row.to_entity_id) {
			errors.push(`Transaction row ${lineNum}: missing to_entity_id`);
			continue;
		}
		if (!entityIds.has(row.to_entity_id)) {
			errors.push(
				`Transaction row ${lineNum}: to_entity_id "${row.to_entity_id}" not found in imported entities`
			);
			continue;
		}

		const amount = Number(row.amount);
		if (isNaN(amount)) {
			errors.push(
				`Transaction row ${lineNum}: amount "${row.amount}" is not a valid number`
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

		result.push({
			id: row.id,
			from_entity_id: row.from_entity_id,
			to_entity_id: row.to_entity_id,
			amount,
			currency: row.currency,
			timestamp,
			note: row.note || null,
		});
	}

	return result;
}

/**
 * Parse a combined CSV import file with # ENTITIES / # PLANS / # TRANSACTIONS sections.
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
	const transactions = parseTransactions(transactionRows, entityIds, errors);

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return { ok: true, data: { entities, plans, transactions } };
}

export function formatImportErrors(errors: string[]): string {
	return errors.join('\n');
}
