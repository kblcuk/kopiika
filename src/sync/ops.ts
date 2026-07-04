import type { Entity, Transaction, Plan } from '@/src/types';

/**
 * Origin of an operation. Reserved for future use (KII-99): `inbound` ops will
 * be signature-verified and journaled differently from `local` ops. In this
 * no-op chokepoint phase it does not branch behaviour. Side effects
 * (notifications, badges) stay in the local store actions, so inbound ops —
 * which call `applyOperation` directly — never trigger them.
 */
export type OpSource = 'local' | 'inbound';

/**
 * In-memory operation union. NOT yet a persisted wire format — only the shape
 * the chokepoint dispatches on. Transaction and entity families for now; plan,
 * reservation, recurrence, and import variants land in follow-up PRs.
 */
export type Op =
	| { kind: 'transaction.create'; transaction: Transaction }
	| { kind: 'transaction.batch_create'; transactions: Transaction[] }
	| { kind: 'transaction.update'; id: string; updates: Omit<Partial<Transaction>, 'id'> }
	| {
			kind: 'transaction.delete';
			id: string;
			seriesExclusion?: { templateId: string; timestamp: number };
	  }
	| { kind: 'transaction.confirm'; ids: string[] }
	| { kind: 'entity.create'; entity: Entity }
	| {
			kind: 'entity.update';
			entity: Entity;
			options?: { deleteMarketValueSnapshots?: boolean };
	  }
	| { kind: 'entity.delete'; id: string }
	| { kind: 'plan.set'; plan: Plan }
	| { kind: 'plan.delete'; id: string };

export type OpResult =
	| { kind: 'transaction.create'; created: Transaction }
	| { kind: 'transaction.batch_create'; created: Transaction[] }
	| { kind: 'transaction.update'; updated: Transaction | null }
	| { kind: 'transaction.delete' }
	| { kind: 'transaction.confirm'; confirmed: Transaction[] }
	| { kind: 'entity.create'; created: Entity }
	| { kind: 'entity.update'; updated: Entity }
	| { kind: 'entity.delete'; entities: Entity[] | null }
	| { kind: 'plan.set'; plan: Plan | null }
	| { kind: 'plan.delete' };
