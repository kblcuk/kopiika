import type { Entity, EntityDraft, Transaction } from '@/src/types';
import { buildTransaction } from '@/src/utils/transaction-builder';
import type { ReconciledRow } from './types';

/** A category the import minted, paired with the planned amount the user
 * entered (if any) so the caller can persist a matching plan. */
export interface NewCategoryResult {
	entity: Entity;
	plannedAmountMinor: number | null;
}

export interface BuildCtx {
	accountId: string;
	currency: string;
	now?: number;
	makeCategory: (draft: EntityDraft) => Entity;
}

export function buildImportTransactions(
	rows: ReconciledRow[],
	ctx: BuildCtx
): { transactions: Transaction[]; newCategories: NewCategoryResult[] } {
	const now = ctx.now ?? Date.now();
	const newByName = new Map<string, NewCategoryResult>();
	const transactions: Transaction[] = [];

	for (const row of rows) {
		// Selected duplicates are imported too — the user explicitly opted in;
		// only the assignment is required.
		if (!row.selected || !row.assignment) continue;
		const { parsed, assignment } = row;
		const magnitude = Math.abs(parsed.amountMinor);
		let fromId: string;
		let toId: string;

		switch (assignment.kind) {
			case 'category':
				fromId = ctx.accountId;
				toId = assignment.entityId;
				break;
			case 'income':
				fromId = assignment.entityId;
				toId = ctx.accountId;
				break;
			case 'transfer':
				if (parsed.amountMinor < 0) {
					fromId = ctx.accountId;
					toId = assignment.accountId;
				} else {
					fromId = assignment.accountId;
					toId = ctx.accountId;
				}
				break;
			case 'newCategory': {
				const name = assignment.draft.name.trim();
				let created = newByName.get(name);
				if (!created) {
					created = {
						entity: ctx.makeCategory(assignment.draft),
						plannedAmountMinor: assignment.draft.plannedAmountMinor,
					};
					newByName.set(name, created);
				}
				fromId = ctx.accountId;
				toId = created.entity.id;
				break;
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
