import { describe, test, expect } from 'bun:test';
import { parseImportCsv, parseCsvLine } from '../import';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';

const VALID_CSV = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
__system_balance_adjustment__,account,"Balance Adjustments",EUR,refresh-cw,,,0,0,-1,true
e1,income,"Salary",EUR,briefcase,,,0,0,0,true
e2,account,"Bank Account",EUR,landmark,,,0,0,0,true
e3,category,"Groceries",EUR,shopping-cart,,,0,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount
p1,e1,all-time,2026-01,3000
p2,e3,all-time,2026-01,500

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,3000,EUR,1706745600000,
t2,e2,e3,150,EUR,1706832000000,"Weekly groceries"`;

const CURRENT_EXPORT_STYLE_CSV = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total,is_deleted
__system_balance_adjustment__,account,"Balance Adjustments",EUR,refresh-cw,,0,0,-1,true,false
e1,income,"Salary",EUR,briefcase,,0,0,0,true,false
e2,account,"Bank Account",EUR,landmark,,1,0,1,false,true

# PLANS
id,entity_id,period,period_start,planned_amount
p1,e1,all-time,2026-01,3000

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,3000,EUR,1706745600000,`;

const LEGACY_OWNER_ID_CSV = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total,is_deleted
__system_balance_adjustment__,account,"Balance Adjustments",EUR,refresh-cw,,,0,0,-1,true,false
e1,account,"Joint Account",EUR,landmark,#4CAF50,household-1,0,0,0,true,false

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

const INVESTMENT_EXPORT_CSV = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total,is_deleted,is_investment
__system_balance_adjustment__,account,"Balance Adjustments",EUR,refresh-cw,,0,0,-1,true,false,false
e1,account,"Brokerage",USD,landmark,,0,0,0,true,false,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note

# MARKET_VALUE_SNAPSHOTS
id,entity_id,amount,currency,date
s1,e1,7500,USD,1736899200000`;

describe('parseCsvLine', () => {
	test('parses simple fields', () => {
		expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
	});

	test('handles quoted fields with commas', () => {
		expect(parseCsvLine('a,"hello, world",c')).toEqual(['a', 'hello, world', 'c']);
	});

	test('handles escaped quotes inside quoted fields', () => {
		expect(parseCsvLine('a,"say ""hello""",c')).toEqual(['a', 'say "hello"', 'c']);
	});

	test('handles empty fields', () => {
		expect(parseCsvLine('a,,c,')).toEqual(['a', '', 'c', '']);
	});

	test('handles single field', () => {
		expect(parseCsvLine('hello')).toEqual(['hello']);
	});

	test('handles empty quoted field', () => {
		expect(parseCsvLine('"",b')).toEqual(['', 'b']);
	});
});

describe('parseImportCsv', () => {
	test('parses valid combined CSV with all three sections', () => {
		const result = parseImportCsv(VALID_CSV);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.entities).toHaveLength(4);
		expect(result.data.plans).toHaveLength(2);
		expect(result.data.transactions).toHaveLength(2);

		// Check entity parsing
		const salary = result.data.entities.find((e) => e.id === 'e1');
		expect(salary).toBeDefined();
		expect(salary!.type).toBe('income');
		expect(salary!.name).toBe('Salary');
		expect(salary!.currency).toBe('EUR');

		// Check plan parsing
		const plan = result.data.plans.find((p) => p.id === 'p1');
		expect(plan).toBeDefined();
		expect(plan!.entity_id).toBe('e1');
		expect(plan!.planned_amount).toBe(3000);

		// Check transaction parsing
		const txn = result.data.transactions.find((t) => t.id === 't2');
		expect(txn).toBeDefined();
		expect(txn!.amount).toBe(150);
		expect(txn!.note).toBe('Weekly groceries');
	});

	test('parses current export-style entity headers without owner_id', () => {
		const result = parseImportCsv(CURRENT_EXPORT_STYLE_CSV);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const account = result.data.entities.find((e) => e.id === 'e2');
		expect(account).toBeDefined();
		expect(account!.include_in_total).toBe(false);
		expect(account!.is_deleted).toBe(true);
		expect('owner_id' in account!).toBe(false);
	});

	test('accepts legacy owner_id headers but ignores the field', () => {
		const result = parseImportCsv(LEGACY_OWNER_ID_CSV);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const account = result.data.entities.find((e) => e.id === 'e1');
		expect(account).toBeDefined();
		expect(account!.color).toBe('#4CAF50');
		expect('owner_id' in account!).toBe(false);
	});

	test('parses investment entities and market value snapshots from current export format', () => {
		const result = parseImportCsv(INVESTMENT_EXPORT_CSV);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const account = result.data.entities.find((e) => e.id === 'e1');
		expect(account).toBeDefined();
		expect(account!.is_investment).toBe(true);
		expect(result.data.marketValueSnapshots).toEqual([
			{
				id: 's1',
				entity_id: 'e1',
				amount: 7500,
				currency: 'USD',
				date: 1736899200000,
			},
		]);
	});

	test('rejects missing section markers', () => {
		const result = parseImportCsv('just some random text');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]).toContain('section markers');
	});

	test('rejects file with only some section markers', () => {
		const result = parseImportCsv('# ENTITIES\nid,type\n\n# PLANS\nid');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]).toContain('section markers');
	});

	test('accepts imports without market value snapshots section', () => {
		const result = parseImportCsv(CURRENT_EXPORT_STYLE_CSV);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.marketValueSnapshots).toEqual([]);
	});

	test('rejects invalid entity type', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,bogus,"Test",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]).toContain('invalid type "bogus"');
	});

	test('rejects plan referencing non-existent entity', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,income,"Salary",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount
p1,nonexistent,all-time,2026-01,1000

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]).toContain('entity_id "nonexistent" not found');
	});

	test('drops transaction referencing non-existent from entity (not fatal)', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,income,"Salary",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,nonexistent,e1,100,EUR,1706745600000,`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.transactions).toEqual([]);
		expect(result.droppable).toHaveLength(1);
		expect(result.droppable[0]).toMatchObject({
			kind: 'transaction',
			id: 't1',
		});
		expect(result.droppable[0]!.reason).toContain('from_entity_id "nonexistent"');
	});

	test('drops transaction referencing non-existent to entity', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,income,"Salary",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,nonexistent,100,EUR,1706745600000,`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.transactions).toEqual([]);
		expect(result.droppable).toHaveLength(1);
		expect(result.droppable[0]!.reason).toContain('to_entity_id "nonexistent"');
	});

	test('handles quoted fields with commas and escaped quotes in notes', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,account,"My ""Main"" Account",EUR,,,,,0,0,true
e2,category,"Food, Drinks",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,50,EUR,1706745600000,"Lunch at ""Joe's"", expensive"`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.entities[0]!.name).toBe('My "Main" Account');
		expect(result.data.entities[1]!.name).toBe('Food, Drinks');
		expect(result.data.transactions[0]!.note).toBe('Lunch at "Joe\'s", expensive');
	});

	test('auto-inserts system entity when missing', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,income,"Salary",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Should have e1 + auto-inserted system entity
		expect(result.data.entities).toHaveLength(2);
		const systemEntity = result.data.entities.find(
			(e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID
		);
		expect(systemEntity).toBeDefined();
		expect(systemEntity!.type).toBe('account');
	});

	test('does not duplicate system entity when already present', () => {
		const result = parseImportCsv(VALID_CSV);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const systemEntities = result.data.entities.filter(
			(e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID
		);
		expect(systemEntities).toHaveLength(1);
	});

	test('empty sections are valid', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Only the auto-inserted system entity
		expect(result.data.entities).toHaveLength(1);
		expect(result.data.plans).toHaveLength(0);
		expect(result.data.transactions).toHaveLength(0);
	});

	test('rejects invalid planned_amount', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,income,"Salary",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount
p1,e1,all-time,2026-01,not-a-number

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]).toContain('not a valid number');
	});

	test('include_in_total defaults to true when not "false"', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,income,"A",EUR,,,,,0,0,true
e2,account,"B",EUR,,,,,0,0,false
e3,category,"C",EUR,,,,,0,0,

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const e1 = result.data.entities.find((e) => e.id === 'e1');
		const e2 = result.data.entities.find((e) => e.id === 'e2');
		const e3 = result.data.entities.find((e) => e.id === 'e3');
		expect(e1!.include_in_total).toBe(true);
		expect(e2!.include_in_total).toBe(false);
		expect(e3!.include_in_total).toBe(true);
	});

	test('is_deleted defaults to false unless explicitly true', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total,is_deleted
e1,income,"A",EUR,,,,,0,0,true,true
e2,account,"B",EUR,,,,,0,0,true,

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.entities.find((e) => e.id === 'e1')!.is_deleted).toBe(true);
		expect(result.data.entities.find((e) => e.id === 'e2')!.is_deleted).toBe(false);
	});

	test('parses entities.is_default from CSV', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total,is_deleted,is_default,is_investment
__system_balance_adjustment__,account,"Balance Adjustments",EUR,refresh-cw,,0,0,-1,true,false,false,false
e1,account,"Main",EUR,landmark,,0,0,0,true,false,true,false

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const main = result.data.entities.find((e) => e.id === 'e1');
		expect(main).toBeDefined();
		expect(main!.is_default).toBe(true);
		const sys = result.data.entities.find((e) => e.id === '__system_balance_adjustment__');
		expect(sys!.is_default).toBe(false);
	});

	describe('transactions.is_confirmed default', () => {
		const PAST = 1000; // 1970, always past
		const FUTURE = 9_999_999_999_999; // year 2286, always future
		const ENTITIES = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,income,"Salary",EUR,,,0,0,0,true
e2,account,"Bank",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
`;

		test('explicit "true" stays true regardless of timestamp', () => {
			const csv =
				ENTITIES +
				`id,from_entity_id,to_entity_id,amount,currency,timestamp,note,series_id,is_confirmed
t1,e1,e2,10,EUR,${PAST},,,true
t2,e1,e2,20,EUR,${FUTURE},,,true`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.data.transactions.find((t) => t.id === 't1')!.is_confirmed).toBe(true);
			expect(result.data.transactions.find((t) => t.id === 't2')!.is_confirmed).toBe(true);
		});

		test('explicit "false" stays false regardless of timestamp', () => {
			const csv =
				ENTITIES +
				`id,from_entity_id,to_entity_id,amount,currency,timestamp,note,series_id,is_confirmed
t1,e1,e2,10,EUR,${PAST},,,false
t2,e1,e2,20,EUR,${FUTURE},,,false`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.data.transactions.find((t) => t.id === 't1')!.is_confirmed).toBe(false);
			expect(result.data.transactions.find((t) => t.id === 't2')!.is_confirmed).toBe(false);
		});

		test('empty cell defaults by timestamp (past → true, future → false)', () => {
			const csv =
				ENTITIES +
				`id,from_entity_id,to_entity_id,amount,currency,timestamp,note,series_id,is_confirmed
t1,e1,e2,10,EUR,${PAST},,,
t2,e1,e2,20,EUR,${FUTURE},,,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.data.transactions.find((t) => t.id === 't1')!.is_confirmed).toBe(true);
			expect(result.data.transactions.find((t) => t.id === 't2')!.is_confirmed).toBe(false);
		});

		test('missing column defaults by timestamp (past → true, future → false)', () => {
			const csv =
				ENTITIES +
				`id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,10,EUR,${PAST},
t2,e1,e2,20,EUR,${FUTURE},`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.data.transactions.find((t) => t.id === 't1')!.is_confirmed).toBe(true);
			expect(result.data.transactions.find((t) => t.id === 't2')!.is_confirmed).toBe(false);
		});
	});

	test('transactions can reference the system entity', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,account,"Bank",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,__system_balance_adjustment__,e1,100,EUR,1706745600000,Correction`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.transactions).toHaveLength(1);
		expect(result.data.transactions[0]!.from_entity_id).toBe(BALANCE_ADJUSTMENT_ENTITY_ID);
	});

	test('parses recurrence_templates section', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,account,"Main",EUR,,,0,0,0,true
e2,category,"Groceries",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note

# RECURRENCE_TEMPLATES
id,from_entity_id,to_entity_id,amount,currency,note,rule,start_date,end_date,end_count,horizon,exclusions,is_deleted,created_at
rt1,e1,e2,50,EUR,"Weekly groceries","{""type"":""weekly""}",1706745600000,,,90,"[1706832000000]",false,1706745500000`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.recurrenceTemplates).toHaveLength(1);
		const t = result.data.recurrenceTemplates[0]!;
		expect(t.id).toBe('rt1');
		expect(t.from_entity_id).toBe('e1');
		expect(t.amount).toBe(50);
		expect(t.note).toBe('Weekly groceries');
		expect(t.rule).toBe('{"type":"weekly"}');
		expect(t.start_date).toBe(1706745600000);
		expect(t.end_date).toBeNull();
		expect(t.end_count).toBeNull();
		expect(t.horizon).toBe(90);
		// KII-123: legacy inline `exclusions` JSON column is parsed into the
		// in-memory `number[]` representation for forward-compat.
		expect(t.exclusions).toEqual([1706832000000]);
		expect(t.is_deleted).toBe(false);
		expect(t.created_at).toBe(1706745500000);
	});

	test('accepts imports without recurrence_templates section (backward compat)', () => {
		const result = parseImportCsv(VALID_CSV);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.recurrenceTemplates).toEqual([]);
	});

	test('drops recurrence_template referencing unknown entity', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,account,"Main",EUR,,,0,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note

# RECURRENCE_TEMPLATES
id,from_entity_id,to_entity_id,amount,currency,note,rule,start_date,end_date,end_count,horizon,exclusions,is_deleted,created_at
rt1,e1,e-gone,50,EUR,,"{""type"":""weekly""}",1706745600000,,,90,,false,1706745500000`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.recurrenceTemplates).toEqual([]);
		expect(result.droppable).toHaveLength(1);
		expect(result.droppable[0]).toMatchObject({
			kind: 'recurrenceTemplate',
			id: 'rt1',
		});
		expect(result.droppable[0]!.reason).toContain('to_entity_id "e-gone"');
	});

	test('drops recurrence_template referencing unknown from entity', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e2,category,"Groceries",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note

# RECURRENCE_TEMPLATES
id,from_entity_id,to_entity_id,amount,currency,note,rule,start_date,end_date,end_count,horizon,exclusions,is_deleted,created_at
rt1,e-gone,e2,50,EUR,,"{""type"":""weekly""}",1706745600000,,,90,,false,1706745500000`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.recurrenceTemplates).toEqual([]);
		expect(result.droppable).toHaveLength(1);
		expect(result.droppable[0]).toMatchObject({
			kind: 'recurrenceTemplate',
			id: 'rt1',
		});
		expect(result.droppable[0]!.reason).toContain('from_entity_id "e-gone"');
	});

	test('happy-path parse returns empty droppable', () => {
		const result = parseImportCsv(VALID_CSV);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.droppable).toEqual([]);
	});

	test('rejects recurrence_template with malformed rule JSON', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,account,"Main",EUR,,,0,0,0,true
e2,category,"Groceries",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note

# RECURRENCE_TEMPLATES
id,from_entity_id,to_entity_id,amount,currency,note,rule,start_date,end_date,end_count,horizon,exclusions,is_deleted,created_at
rt1,e1,e2,50,EUR,,not-json,1706745600000,,,90,,false,1706745500000`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]).toMatch(/rule/i);
	});

	// KII-117 — Domain validation on import (allowed type pairs, currency, amount)
	describe('domain validation', () => {
		test('rejects category → category (blocked pair)', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,category,"Groceries",EUR,,,0,0,0,true
e2,category,"Rent",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,50,EUR,1706745600000,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.join('\n')).toMatch(/category to category/i);
		});

		test('rejects income → category (blocked pair)', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,income,"Salary",EUR,,,0,0,0,true
e2,category,"Groceries",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,50,EUR,1706745600000,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.join('\n')).toMatch(/income to category/i);
		});

		test('rejects saving → category (blocked pair)', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,saving,"Emergency",EUR,,,0,0,0,true
e2,category,"Groceries",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,50,EUR,1706745600000,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.join('\n')).toMatch(/saving to category/i);
		});

		test('rejects same-entity transfer (from == to)', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,account,"Main",EUR,,,0,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e1,50,EUR,1706745600000,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.join('\n')).toMatch(/source and destination must differ/i);
		});

		test('rejects currency mismatch between entities', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,account,"Main EUR",EUR,,,0,0,0,true
e2,category,"USD Goods",USD,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,50,EUR,1706745600000,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.join('\n')).toMatch(/currency mismatch/i);
		});

		test('rejects non-positive transaction amount', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,account,"Main",EUR,,,0,0,0,true
e2,category,"Groceries",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,0,EUR,1706745600000,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.join('\n')).toMatch(/positive number/i);
		});

		test('accepts transaction whose entity is soft-deleted (historical record)', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total,is_deleted
e1,account,"Old Card",EUR,,,0,0,0,true,true
e2,category,"Groceries",EUR,,,0,0,1,true,false

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,50,EUR,1706745600000,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.data.transactions).toHaveLength(1);
		});

		test('rejects recurrence_template with blocked pair (category → category)', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,category,"Groceries",EUR,,,0,0,0,true
e2,category,"Rent",EUR,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note

# RECURRENCE_TEMPLATES
id,from_entity_id,to_entity_id,amount,currency,note,rule,start_date,end_date,end_count,horizon,exclusions,is_deleted,created_at
rt1,e1,e2,50,EUR,,"{""type"":""weekly""}",1706745600000,,,90,,false,1706745500000`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.join('\n')).toMatch(/category to category/i);
		});

		test('rejects recurrence_template with currency mismatch', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,account,"Main EUR",EUR,,,0,0,0,true
e2,category,"USD Goods",USD,,,0,0,1,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note

# RECURRENCE_TEMPLATES
id,from_entity_id,to_entity_id,amount,currency,note,rule,start_date,end_date,end_count,horizon,exclusions,is_deleted,created_at
rt1,e1,e2,50,EUR,,"{""type"":""weekly""}",1706745600000,,,90,,false,1706745500000`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.join('\n')).toMatch(/currency mismatch/i);
		});

		test('accepts recurrence_template whose entity is soft-deleted', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total,is_deleted
e1,account,"Old Card",EUR,,,0,0,0,true,true
e2,category,"Groceries",EUR,,,0,0,1,true,false

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note

# RECURRENCE_TEMPLATES
id,from_entity_id,to_entity_id,amount,currency,note,rule,start_date,end_date,end_count,horizon,exclusions,is_deleted,created_at
rt1,e1,e2,50,EUR,,"{""type"":""weekly""}",1706745600000,,,90,,false,1706745500000`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.data.recurrenceTemplates).toHaveLength(1);
		});

		test('rejects whole import even if one row is invalid (all-or-nothing)', () => {
			const csv = `# ENTITIES
id,type,name,currency,icon,color,order,row,position,include_in_total
e1,account,"Main",EUR,,,0,0,0,true
e2,category,"Groceries",EUR,,,0,0,1,true
e3,category,"Rent",EUR,,,0,0,2,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,e2,50,EUR,1706745600000,
t2,e2,e3,25,EUR,1706745700000,`;

			const result = parseImportCsv(csv);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors.join('\n')).toMatch(/category to category/i);
		});
	});
});
