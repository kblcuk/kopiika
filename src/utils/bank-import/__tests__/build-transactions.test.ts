import { describe, it, expect } from 'bun:test';
import { buildImportTransactions } from '../build-transactions';
import type { ReconciledRow } from '../types';
import type { Entity } from '@/src/types';

const NOW = new Date(2026, 6, 20).getTime();
const makeCategory = (name: string): Entity => ({
	id: `new-${name}`, type: 'category', name, currency: 'EUR', row: 0, position: 0,
});

function row(over: Partial<ReconciledRow> & { parsed: ReconciledRow['parsed'] }): ReconciledRow {
	return { status: 'new', selected: true, assignment: null, ...over };
}
const parsed = (amountMinor: number) => ({ rowIndex: 0, dateMs: new Date(2026, 6, 12).getTime(), amountMinor, description: 'x' });

describe('buildImportTransactions', () => {
	const ctx = { accountId: 'acct-1', currency: 'EUR', now: NOW, makeCategory };

	it('expense -> Account->Category with abs amount', () => {
		const rows = [row({ parsed: parsed(-25000), assignment: { kind: 'category', entityId: 'cat-1' } })];
		const { transactions } = buildImportTransactions(rows, ctx);
		expect(transactions[0]).toMatchObject({
			from_entity_id: 'acct-1', to_entity_id: 'cat-1', amount_minor: 25000,
			currency: 'EUR', timestamp: parsed(-25000).dateMs, is_confirmed: true, note: 'x',
		});
	});

	it('income -> Income->Account', () => {
		const rows = [row({ parsed: parsed(15000), assignment: { kind: 'income', entityId: 'inc-1' } })];
		const { transactions } = buildImportTransactions(rows, ctx);
		expect(transactions[0]).toMatchObject({ from_entity_id: 'inc-1', to_entity_id: 'acct-1', amount_minor: 15000 });
	});

	it('outflow transfer -> Account->Account', () => {
		const rows = [row({ parsed: parsed(-10000), assignment: { kind: 'transfer', accountId: 'acct-2' } })];
		const { transactions } = buildImportTransactions(rows, ctx);
		expect(transactions[0]).toMatchObject({ from_entity_id: 'acct-1', to_entity_id: 'acct-2', amount_minor: 10000 });
	});

	it('newCategory mints one entity per unique name and references it', () => {
		const rows = [
			row({ parsed: parsed(-100), assignment: { kind: 'newCategory', name: 'Coffee' } }),
			row({ parsed: parsed(-200), assignment: { kind: 'newCategory', name: 'Coffee' } }),
		];
		const { transactions, newCategories } = buildImportTransactions(rows, ctx);
		expect(newCategories).toHaveLength(1);
		expect(newCategories[0]!.name).toBe('Coffee');
		expect(transactions[0]!.to_entity_id).toBe(newCategories[0]!.id);
		expect(transactions[1]!.to_entity_id).toBe(newCategories[0]!.id);
	});

	it('skips unselected, duplicate, and unassigned rows', () => {
		const rows = [
			row({ parsed: parsed(-100), selected: false, assignment: { kind: 'category', entityId: 'c' } }),
			row({ parsed: parsed(-100), status: 'duplicate', selected: false, assignment: null }),
			row({ parsed: parsed(-100), assignment: null }),
		];
		expect(buildImportTransactions(rows, ctx).transactions).toHaveLength(0);
	});
});
