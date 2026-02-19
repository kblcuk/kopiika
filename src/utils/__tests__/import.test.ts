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

	test('rejects transaction referencing non-existent from entity', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,income,"Salary",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,nonexistent,e1,100,EUR,1706745600000,`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]).toContain('from_entity_id "nonexistent" not found');
	});

	test('rejects transaction referencing non-existent to entity', () => {
		const csv = `# ENTITIES
id,type,name,currency,icon,color,owner_id,order,row,position,include_in_total
e1,income,"Salary",EUR,,,,,0,0,true

# PLANS
id,entity_id,period,period_start,planned_amount

# TRANSACTIONS
id,from_entity_id,to_entity_id,amount,currency,timestamp,note
t1,e1,nonexistent,100,EUR,1706745600000,`;

		const result = parseImportCsv(csv);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]).toContain('to_entity_id "nonexistent" not found');
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

		expect(result.data.entities[0].name).toBe('My "Main" Account');
		expect(result.data.entities[1].name).toBe('Food, Drinks');
		expect(result.data.transactions[0].note).toBe('Lunch at "Joe\'s", expensive');
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
		expect(result.data.transactions[0].from_entity_id).toBe(BALANCE_ADJUSTMENT_ENTITY_ID);
	});
});
