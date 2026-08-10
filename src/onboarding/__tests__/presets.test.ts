import { describe, test, expect } from 'bun:test';
import {
	PRESET_CHIPS,
	presetKey,
	createEntitiesFromPresets,
	createPlansForEntities,
} from '../presets';
import { getCurrentPeriod } from '@/src/types';

describe('PRESET_CHIPS catalog', () => {
	test('contains at least one of every entity type', () => {
		const types = new Set(PRESET_CHIPS.map((c) => c.type));
		expect(types).toContain('income');
		expect(types).toContain('account');
		expect(types).toContain('category');
		expect(types).toContain('saving');
	});

	test('every chip has unique presetKey', () => {
		const keys = PRESET_CHIPS.map(presetKey);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test('Salary, Main Card, Cash, Groceries, Transport are default-selected', () => {
		const defaults = PRESET_CHIPS.filter((c) => c.defaultSelected).map((c) => c.name);
		expect(defaults).toEqual(
			expect.arrayContaining(['Salary', 'Main Card', 'Cash', 'Groceries', 'Transport'])
		);
	});
});

describe('createEntitiesFromPresets', () => {
	test('produces one Entity per picked chip', () => {
		const picked = PRESET_CHIPS.filter((c) => c.defaultSelected);
		const entities = createEntitiesFromPresets(picked, 'EUR');
		expect(entities).toHaveLength(picked.length);
	});

	test('preserves chip name + type + icon', () => {
		const picked = [PRESET_CHIPS.find((c) => c.name === 'Salary')!];
		const [entity] = createEntitiesFromPresets(picked, 'EUR');
		expect(entity!.name).toBe('Salary');
		expect(entity!.type).toBe('income');
		expect(entity!.icon).toBe('briefcase');
	});

	test('distributes categories across maxRows=3 (round-robin by index)', () => {
		const categoryPresets = PRESET_CHIPS.filter((c) => c.type === 'category');
		const entities = createEntitiesFromPresets(categoryPresets, 'EUR');
		const rows = entities.map((e) => e.row);
		const uniqueRows = new Set(rows);
		// At least 2 rows used when more than 3 categories
		if (categoryPresets.length > 3) {
			expect(uniqueRows.size).toBeGreaterThanOrEqual(2);
		}
		expect(Math.max(...rows)).toBeLessThanOrEqual(2);
	});

	test('single-row types (income/account/saving) all sit on row 0', () => {
		const singleRow = PRESET_CHIPS.filter((c) =>
			['income', 'account', 'saving'].includes(c.type)
		);
		const entities = createEntitiesFromPresets(singleRow, 'EUR');
		expect(entities.every((e) => e.row === 0)).toBe(true);
	});
});

describe('createPlansForEntities', () => {
	test('uses all-time semantics with current period_start', () => {
		const picked = PRESET_CHIPS.filter((c) => c.defaultSelected);
		const entities = createEntitiesFromPresets(picked, 'EUR');
		const entityToPreset = new Map(
			entities.map((e) => [e.id, picked.find((c) => c.name === e.name && c.type === e.type)!])
		);
		const plans = createPlansForEntities(entities, entityToPreset, 'EUR');
		expect(plans.every((p) => p.period === 'all-time')).toBe(true);
		expect(plans.every((p) => p.period_start === getCurrentPeriod())).toBe(true);
	});

	test('chips without suggestedPlan get planned_amount=0', () => {
		const chip = PRESET_CHIPS.find((c) => c.suggestedPlan === undefined)!;
		const entities = createEntitiesFromPresets([chip], 'EUR');
		const entityToPreset = new Map([[entities[0]!.id, chip]]);
		const [plan] = createPlansForEntities(entities, entityToPreset, 'EUR');
		expect(plan!.planned_amount_minor).toBe(0);
	});

	test('chips with suggestedPlan preserve the amount', () => {
		const chip = PRESET_CHIPS.find((c) => c.suggestedPlan !== undefined)!;
		const entities = createEntitiesFromPresets([chip], 'EUR');
		const entityToPreset = new Map([[entities[0]!.id, chip]]);
		const [plan] = createPlansForEntities(entities, entityToPreset, 'EUR');
		// chip.suggestedPlan is authored in major units (e.g. 50000 = €50,000);
		// production converts to integer minor units via toMinor(value, currency).
		expect(plan!.planned_amount_minor).toBe(chip.suggestedPlan! * 100);
	});

	test('creates entities in the supplied currency', () => {
		const picked = PRESET_CHIPS.filter((c) => c.type === 'account').slice(0, 2);
		const entities = createEntitiesFromPresets(picked, 'GBP');
		expect(entities.map((e) => e.currency)).toEqual(['GBP', 'GBP']);
	});

	test('converts suggested plans at the supplied currency precision', () => {
		const chip = PRESET_CHIPS.find((c) => c.name === 'Salary')!;
		const entities = createEntitiesFromPresets([chip], 'JPY');
		const plans = createPlansForEntities(entities, new Map([[entities[0]!.id, chip]]), 'JPY');
		// JPY has 0 decimals, so 50000 major is 50000 minor — not 5000000.
		expect(plans[0]!.planned_amount_minor).toBe(50000);
	});
});
