import { describe, test, expect } from 'bun:test';
import { buildCombinedCsv } from '../export';
import { parseImportCsv } from '../import';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import type { Entity, Plan, Transaction, MarketValueSnapshot } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';

// Fully-populated fixture: every nullable/boolean field set to a
// non-default value so missing serialization shows up as a diff.
const FULL_FIXTURE = {
	entities: [
		{
			id: BALANCE_ADJUSTMENT_ENTITY_ID,
			type: 'account',
			name: 'Balance Adjustments',
			currency: 'EUR',
			icon: 'refresh-cw',
			color: null,
			order: 0,
			row: 0,
			position: -1,
			include_in_total: true,
			is_deleted: false,
			is_default: false,
			is_investment: false,
		},
		{
			id: 'e1',
			type: 'account',
			name: 'Main "Card", €',
			currency: 'EUR',
			icon: 'landmark',
			color: '#4CAF50',
			order: 1,
			row: 0,
			position: 0,
			include_in_total: false,
			is_deleted: true,
			is_default: true,
			is_investment: true,
		},
		{
			id: 'e2',
			type: 'category',
			name: 'Groceries',
			currency: 'EUR',
			icon: 'shopping-cart',
			color: '#FF9800',
			order: 2,
			row: 1,
			position: 0,
			include_in_total: true,
			is_deleted: false,
			is_default: false,
			is_investment: false,
		},
		{
			id: 'e3',
			type: 'income',
			name: 'Salary',
			currency: 'EUR',
			icon: null,
			color: null,
			order: 3,
			row: 0,
			position: 1,
			include_in_total: true,
			is_deleted: false,
			is_default: false,
			is_investment: false,
		},
	] satisfies Entity[],
	plans: [
		{
			id: 'p1',
			entity_id: 'e2',
			period: 'all-time',
			period_start: '2026-01',
			planned_amount_minor: 50000,
		},
	] satisfies Plan[],
	transactions: [
		{
			id: 't1',
			from_entity_id: 'e1',
			to_entity_id: 'e2',
			amount_minor: 4321,
			currency: 'EUR',
			timestamp: 1706745600000,
			note: 'Weekly "groceries", with comma',
			// References the *active* template (rt2): import severs series_id that
			// points at an absent or soft-deleted template (keeping the row as a
			// one-off + reporting it via `droppable`), so only a live series
			// round-trips losslessly. rt1 below stays soft-deleted but unreferenced,
			// preserving is_deleted/exclusion serialization coverage.
			series_id: 'rt2',
			is_confirmed: false,
		},
		{
			id: 't2',
			from_entity_id: 'e1',
			to_entity_id: 'e2',
			amount_minor: 1000,
			currency: 'EUR',
			timestamp: 1706832000000,
			note: null,
			series_id: null,
			is_confirmed: true,
		},
	] satisfies Transaction[],
	recurrenceTemplates: [
		{
			id: 'rt1',
			from_entity_id: 'e1',
			to_entity_id: 'e2',
			amount_minor: 4321,
			currency: 'EUR',
			note: 'Weekly groceries',
			rule: '{"type":"weekly"}',
			start_date: 1706745600000,
			end_date: 1730000000000,
			end_count: 12,
			horizon: 90,
			// KII-123: exclusions now round-trip through a dedicated
			// `# RECURRENCE_EXCLUSIONS` CSV section keyed by `template_id` +
			// `timestamp`. Mentions in this fixture also serve the parser-
			// coverage guard in csv-schema-coverage.test.ts.
			exclusions: [1706832000000, 1707436800000],
			is_deleted: true,
			created_at: 1706745500000,
		},
		{
			id: 'rt2',
			from_entity_id: 'e1',
			to_entity_id: 'e2',
			amount_minor: 1000,
			currency: 'EUR',
			note: null,
			rule: '{"type":"daily"}',
			start_date: 1706745600000,
			end_date: null,
			end_count: null,
			horizon: 30,
			// No exclusions on this template — left undefined so we cover the
			// "template with empty exclusion set" round-trip path.
			exclusions: undefined,
			is_deleted: false,
			created_at: 1706745500000,
		},
	] satisfies RecurrenceTemplate[],
	marketValueSnapshots: [
		{ id: 's1', entity_id: 'e1', amount_minor: 750000, currency: 'USD', date: 1736899200000 },
	] satisfies MarketValueSnapshot[],
};

describe('csv roundtrip', () => {
	test('parse(export(F)) == F for every field in a fully-populated fixture', () => {
		const csv = buildCombinedCsv(FULL_FIXTURE);
		const result = parseImportCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.droppable).toEqual([]);

		// Compare each section independently for clearer diff output.
		expect(result.data.entities).toEqual(FULL_FIXTURE.entities);
		expect(result.data.plans).toEqual(FULL_FIXTURE.plans);
		expect(result.data.transactions).toEqual(FULL_FIXTURE.transactions);
		expect(result.data.recurrenceTemplates).toEqual(FULL_FIXTURE.recurrenceTemplates);
		expect(result.data.marketValueSnapshots).toEqual(FULL_FIXTURE.marketValueSnapshots);
	});

	test('KII-123 back-compat: legacy CSV with inline `exclusions` JSON column still imports', () => {
		// Pre-KII-123 exports embedded exclusions as a JSON array directly on the
		// recurrence_templates row. Users with backup CSVs on disk must still be
		// able to round-trip them. The importer parses the legacy column and
		// merges it into the template's in-memory `exclusions` array.
		const legacyCsv = [
			'# ENTITIES',
			'id,type,name,currency,icon,color,order,row,position,include_in_total,is_deleted,is_default,is_investment',
			'e1,account,Cash,EUR,,,1,0,0,true,false,false,false',
			'e2,category,Groceries,EUR,,,2,1,0,true,false,false,false',
			'',
			'# PLANS',
			'id,entity_id,period,period_start,planned_amount_minor',
			'',
			'# TRANSACTIONS',
			'id,from_entity_id,to_entity_id,amount_minor,currency,timestamp,note,series_id,is_confirmed',
			'',
			// Legacy header includes `exclusions` between horizon and is_deleted.
			'# RECURRENCE_TEMPLATES',
			'id,from_entity_id,to_entity_id,amount_minor,currency,note,rule,start_date,end_date,end_count,horizon,exclusions,is_deleted,created_at',
			'rt1,e1,e2,1000,EUR,,"{""type"":""weekly""}",1706745600000,,,30,"[1706832000000,1707436800000]",false,1706745500000',
		].join('\n');

		const result = parseImportCsv(legacyCsv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.recurrenceTemplates[0]!.exclusions).toEqual([
			1706832000000, 1707436800000,
		]);
	});
});
