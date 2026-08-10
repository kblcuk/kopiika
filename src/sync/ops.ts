import type { Entity, Transaction, Plan, MarketValueSnapshot } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';

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
 * the chokepoint dispatches on. Covers all local mutation kinds as of KII-155:
 * transaction, entity, plan, reservation, recurrence, market_value, import, and
 * currency.
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
	| { kind: 'plan.delete'; id: string }
	| {
			kind: 'reservation.set';
			accountEntityId: string;
			savingEntityId: string;
			desiredTotalMinor: number;
	  }
	| {
			kind: 'transaction.split';
			originalId: string;
			rows: Transaction[];
			seriesExclusion?: { templateId: string; timestamp: number };
	  }
	| { kind: 'recurrence.exclude'; seriesId: string; timestamp: number }
	| { kind: 'recurrence.create'; template: RecurrenceTemplate }
	| {
			kind: 'recurrence.update_future';
			anchorId: string;
			updates: Omit<Partial<Transaction>, 'id'>;
	  }
	| { kind: 'recurrence.delete_future'; seriesId: string; fromTimestamp: number }
	| { kind: 'recurrence.deactivate'; seriesId: string; fromTimestamp: number }
	| { kind: 'market_value.create'; snapshot: MarketValueSnapshot }
	| {
			kind: 'market_value.update';
			id: string;
			updates: { amount_minor?: number; date?: number };
	  }
	| { kind: 'market_value.delete'; id: string }
	| { kind: 'market_value.delete_all'; entityId: string }
	| {
			kind: 'import.replace_all';
			entities: Entity[];
			plans: Plan[];
			transactions: Transaction[];
			recurrenceTemplates: RecurrenceTemplate[];
			marketValueSnapshots: MarketValueSnapshot[];
	  }
	| { kind: 'currency.set_all'; currency: string };

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
	| { kind: 'plan.delete' }
	| { kind: 'reservation.set'; created: Transaction | null }
	| { kind: 'transaction.split'; created: Transaction[] }
	| { kind: 'recurrence.exclude' }
	| { kind: 'recurrence.create'; created: RecurrenceTemplate }
	| {
			kind: 'recurrence.update_future';
			template: RecurrenceTemplate | null;
			transactions: Transaction[];
	  }
	| { kind: 'recurrence.delete_future'; template: RecurrenceTemplate | null }
	| { kind: 'recurrence.deactivate'; template: RecurrenceTemplate | null }
	| { kind: 'market_value.create'; created: MarketValueSnapshot }
	| { kind: 'market_value.update'; updated: MarketValueSnapshot | null }
	| { kind: 'market_value.delete' }
	| { kind: 'market_value.delete_all' }
	| {
			kind: 'import.replace_all';
			entities: Entity[];
			plans: Plan[];
			transactions: Transaction[];
			recurrenceTemplates: RecurrenceTemplate[];
			marketValueSnapshots: MarketValueSnapshot[];
	  }
	| {
			kind: 'currency.set_all';
			entities: Entity[];
			transactions: Transaction[];
			recurrenceTemplates: RecurrenceTemplate[];
			marketValueSnapshots: MarketValueSnapshot[];
	  };
