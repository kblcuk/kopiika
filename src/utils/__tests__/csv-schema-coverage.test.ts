import { describe, test, expect } from 'bun:test';
import { getTableColumns } from 'drizzle-orm';
import * as schema from '@/src/db/drizzle-schema';
import {
	ENTITY_HEADERS,
	PLAN_HEADERS,
	TRANSACTION_HEADERS,
	RECURRENCE_TEMPLATE_HEADERS,
	MARKET_VALUE_SNAPSHOT_HEADERS,
	EXPORT_EXCLUDED_COLUMNS,
} from '../csv-spec';

// One entry per drizzle table that participates in CSV export.
// Adding a new exported table requires a new entry here AND a header
// constant in csv-spec.ts; missing either fails this test.
const TABLE_REGISTRY = [
	{ name: 'entities', table: schema.entities, header: ENTITY_HEADERS },
	{ name: 'plans', table: schema.plans, header: PLAN_HEADERS },
	{ name: 'transactions', table: schema.transactions, header: TRANSACTION_HEADERS },
	{
		name: 'recurrence_templates',
		table: schema.recurrenceTemplates,
		header: RECURRENCE_TEMPLATE_HEADERS,
	},
	{
		name: 'market_value_snapshots',
		table: schema.marketValueSnapshots,
		header: MARKET_VALUE_SNAPSHOT_HEADERS,
	},
] as const;

describe('csv schema coverage', () => {
	for (const entry of TABLE_REGISTRY) {
		test(`every drizzle column for ${entry.name} appears in the export header (or is explicitly excluded)`, () => {
			const drizzleCols = Object.keys(getTableColumns(entry.table));
			const excluded = EXPORT_EXCLUDED_COLUMNS[entry.name] ?? [];
			const expected = drizzleCols.filter((c) => !excluded.includes(c));
			const missing = expected.filter((c) => !entry.header.includes(c as never));
			expect(missing).toEqual([]);
		});

		test(`every header for ${entry.name} corresponds to a real drizzle column`, () => {
			const drizzleCols = new Set(Object.keys(getTableColumns(entry.table)));
			const unknown = entry.header.filter((h) => !drizzleCols.has(h));
			expect(unknown).toEqual([]);
		});
	}

	test('EXPORT_EXCLUDED_COLUMNS only references known drizzle tables and columns', () => {
		for (const entry of TABLE_REGISTRY) {
			const excluded = EXPORT_EXCLUDED_COLUMNS[entry.name] ?? [];
			const drizzleCols = new Set(Object.keys(getTableColumns(entry.table)));
			for (const col of excluded) {
				expect(drizzleCols.has(col)).toBe(true);
			}
		}
	});
});
