import type { Entity, Transaction } from '@/src/types';
import { buildTransaction } from '@/src/utils/transaction-builder';
import type { ReconciledRow } from './types';

export interface BuildCtx {
	accountId: string;
	currency: string;
	now?: number;
	makeCategory: (name: string) => Entity;
}

export function buildImportTransactions(
	rows: ReconciledRow[],
	ctx: BuildCtx
): { transactions: Transaction[]; newCategories: Entity[] } {
	const now = ctx.now ?? Date.now();
	const newByName = new Map<string, Entity>();
	const transactions: Transaction[] = [];

	for (const row of rows) {
		if (!row.selected || row.status !== 'new' || !row.assignment) continue;
		const { parsed, assignment } = row;
		const magnitude = Math.abs(parsed.amountMinor);
		let fromId: string;
		let toId: string;

		switch (assignment.kind) {
			case 'category':
				fromId = ctx.accountId; toId = assignment.entityId; break;
			case 'income':
				fromId = assignment.entityId; toId = ctx.accountId; break;
			case 'transfer':
				if (parsed.amountMinor < 0) { fromId = ctx.accountId; toId = assignment.accountId; }
				else { fromId = assignment.accountId; toId = ctx.accountId; }
				break;
			case 'newCategory': {
				const name = assignment.name.trim();
				let entity = newByName.get(name);
				if (!entity) { entity = ctx.makeCategory(name); newByName.set(name, entity); }
				fromId = ctx.accountId; toId = entity.id; break;
			}
		}

		transactions.push(
			buildTransaction(
				{
					from_entity_id: fromId,
					to_entity_id: toId,
					amount_minor: magnitude,
					currency: ctx.currency,
					timestamp: parsed.dateMs,
					note: parsed.description || undefined,
					is_confirmed: true,
				},
				now
			)
		);
	}

	return { transactions, newCategories: [...newByName.values()] };
}
