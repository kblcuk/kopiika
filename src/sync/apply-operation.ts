import * as db from '@/src/db';
import type { Entity, Transaction } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	ensureValid,
	validateTransaction,
	validateUpdate,
} from '@/src/utils/transaction-validation';
import { defaultIsConfirmed } from '@/src/utils/transaction-builder';
import type { Op, OpResult, OpSource } from './ops';

/**
 * Read-only snapshot the chokepoint validates against. For `local` ops this is
 * the current store state; for future `inbound` ops it will be the local DB
 * state at apply time.
 */
export interface ApplyContext {
	entities: Entity[];
	transactions: Transaction[];
	recurrenceTemplates: RecurrenceTemplate[];
}

/**
 * The single mutation chokepoint. Every transaction-family mutation funnels
 * through here. Today it validates + persists + returns the persisted rows;
 * later PRs add idempotency (op_id), signature verification (inbound),
 * journaling, HLC stamping, and conflict resolution — all inside this function.
 */
export async function applyOperation(
	op: Op,
	source: OpSource,
	ctx: ApplyContext
): Promise<OpResult> {
	// `source` is reserved for future signature-verify + journaling (KII-99).
	// No behavioural branch in the no-op phase.
	void source;

	switch (op.kind) {
		case 'transaction.create': {
			ensureValid(validateTransaction(op.transaction, ctx.entities));
			const withConfirm = {
				...op.transaction,
				is_confirmed:
					op.transaction.is_confirmed ?? defaultIsConfirmed(op.transaction.timestamp),
			};
			const created = await db.createTransaction(withConfirm);
			return { kind: 'transaction.create', created };
		}
		case 'transaction.batch_create': {
			const prepared = op.transactions.map((tx) => {
				ensureValid(validateTransaction(tx, ctx.entities));
				return {
					...tx,
					is_confirmed: tx.is_confirmed ?? defaultIsConfirmed(tx.timestamp),
				};
			});
			const created = await db.createTransactionBatch(prepared);
			return { kind: 'transaction.batch_create', created };
		}
		case 'transaction.update': {
			const existing = ctx.transactions.find((t) => t.id === op.id);
			if (!existing) {
				console.warn(`applyOperation: cannot update unknown transaction: ${op.id}`);
				return { kind: 'transaction.update', updated: null };
			}
			ensureValid(validateUpdate(existing, op.updates, ctx.entities));
			const updated = await db.updateTransaction(op.id, op.updates);
			return { kind: 'transaction.update', updated };
		}
		case 'transaction.delete': {
			await db.deleteTransaction(
				op.id,
				op.seriesExclusion ? { seriesExclusion: op.seriesExclusion } : undefined
			);
			return { kind: 'transaction.delete' };
		}
		default: {
			const _exhaustive: never = op;
			throw new Error(`applyOperation: unsupported op kind "${JSON.stringify(_exhaustive)}"`);
		}
	}
}
