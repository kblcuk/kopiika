import type { Transaction } from '@/src/types';

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
 * the chokepoint dispatches on. Transaction family only for now; entity, plan,
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
	  };

export type OpResult =
	| { kind: 'transaction.create'; created: Transaction }
	| { kind: 'transaction.batch_create'; created: Transaction[] }
	| { kind: 'transaction.update'; updated: Transaction | null }
	| { kind: 'transaction.delete' };
