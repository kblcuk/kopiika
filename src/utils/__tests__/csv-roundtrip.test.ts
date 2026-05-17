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
	] satisfies Entity[],
	plans: [
		{
			id: 'p1',
			entity_id: 'e2',
			period: 'all-time',
			period_start: '2026-01',
			planned_amount: 500,
		},
	] satisfies Plan[],
	transactions: [
		{
			id: 't1',
			from_entity_id: 'e1',
			to_entity_id: 'e2',
			amount: 43.21,
			currency: 'EUR',
			timestamp: 1706745600000,
			note: 'Weekly "groceries", with comma',
			series_id: 'rt1',
			is_confirmed: false,
		},
	] satisfies Transaction[],
	recurrenceTemplates: [
		{
			id: 'rt1',
			from_entity_id: 'e1',
			to_entity_id: 'e2',
			amount: 43.21,
			currency: 'EUR',
			note: 'Weekly groceries',
			rule: '{"type":"weekly"}',
			start_date: 1706745600000,
			end_date: 1730000000000,
			end_count: 12,
			horizon: 90,
			exclusions: '[1706832000000,1707436800000]',
			is_deleted: true,
			created_at: 1706745500000,
		},
	] satisfies RecurrenceTemplate[],
	marketValueSnapshots: [
		{ id: 's1', entity_id: 'e1', amount: 7500, currency: 'USD', date: 1736899200000 },
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
});
