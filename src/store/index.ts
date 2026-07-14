import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import type {
	Entity,
	EntityType,
	EntityWithBalance,
	Plan,
	Transaction,
	MarketValueSnapshot,
} from '@/src/types';
import type { RecurrenceTemplate, RecurrenceRule } from '@/src/types/recurrence';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import * as db from '@/src/db';
import { generateOccurrences, occurrenceId, toCivilDate } from '@/src/utils/recurrence';
import { deriveVirtualOccurrences } from '@/src/utils/recurrence-derivation';
import { formatAmount } from '@/src/utils/format';
import {
	BALANCE_ADJUSTMENT_ENTITY_ID,
	createBalanceAdjustmentEntity,
} from '@/src/constants/system-entities';
import { getTotalReservedForAccount } from '@/src/utils/savings-transactions';
import { validateTransaction } from '@/src/utils/transaction-validation';
import { buildRecurringTemplate, buildTransaction } from '@/src/utils/transaction-builder';
import { applyOperation } from '@/src/sync/apply-operation';
import {
	getNotifiableTransactions,
	scheduleTransactionNotification,
	setupNotificationChannel,
	requestPermission,
	cancelNotification,
	cancelAllNotifications,
	updateBadgeCount,
} from '@/src/services/notifications';
import {
	getRemindersEnabled,
	getHasRequestedPermission,
	setRemindersEnabled,
	setHasRequestedPermission,
} from '@/src/utils/app-prefs';

interface AppState {
	// Data
	entities: Entity[];
	plans: Plan[];
	transactions: Transaction[];
	recurrenceTemplates: RecurrenceTemplate[];
	marketValueSnapshots: MarketValueSnapshot[];

	// UI State
	currentPeriod: string;
	isLoading: boolean;
	draggedEntity: Entity | null;
	incomeVisible: boolean;

	// Actions
	initialize: () => Promise<void>;
	replaceAllData: (
		entities: Entity[],
		plans: Plan[],
		transactions: Transaction[],
		recurrenceTemplates: RecurrenceTemplate[],
		marketValueSnapshots?: MarketValueSnapshot[]
	) => Promise<void>;
	setCurrentPeriod: (period: string) => void;
	setDraggedEntity: (entity: Entity | null) => void;
	toggleIncomeVisible: () => void;

	// Entity actions
	addEntity: (entity: Entity) => Promise<void>;
	updateEntity: (entity: Entity) => Promise<void>;
	updateEntityWithOptions: (
		entity: Entity,
		options?: { deleteMarketValueSnapshots?: boolean }
	) => Promise<void>;
	deleteEntity: (id: string) => Promise<void>;
	reorderEntitiesByIds: (
		type: EntityType,
		orderedIds: string[],
		maxRows: number
	) => Promise<void>;

	// Plan actions
	setPlan: (plan: Plan) => Promise<void>;
	deletePlan: (id: string) => Promise<void>;

	// Transaction actions
	addTransaction: (transaction: Transaction) => Promise<void>;
	createTransactionBatch: (transactions: Transaction[]) => Promise<void>;
	updateTransaction: (id: string, updates: Omit<Partial<Transaction>, 'id'>) => Promise<void>;
	deleteTransaction: (id: string) => Promise<void>;
	replaceTransactionWithSplit: (originalId: string, rows: Transaction[]) => Promise<void>;

	// Recurrence actions
	addRecurringTransaction: (
		transaction: Omit<Transaction, 'id' | 'series_id'>,
		recurrence: {
			rule: RecurrenceRule;
			endDate?: number | null;
			endCount?: number | null;
		}
	) => Promise<void>;
	backfillRecurringIfStale: () => Promise<void>;
	updateTransactionWithScope: (
		id: string,
		updates: Omit<Partial<Transaction>, 'id'>,
		scope: 'single' | 'future'
	) => Promise<void>;
	deleteTransactionWithScope: (id: string, scope: 'single' | 'future') => Promise<void>;
	deactivateTemplatesForEntity: (entityId: string) => Promise<void>;
	materializeOccurrence: (occurrence: Transaction) => Promise<Transaction>;
	excludeOccurrence: (occurrence: Transaction) => Promise<void>;

	// Confirmation actions
	confirmTransaction: (id: string) => Promise<void>;
	confirmAllDueTransactions: () => Promise<void>;

	// Default account — toggle the default flag; only one account at a time
	setDefaultAccount: (accountId: string | null) => Promise<void>;

	// Savings reservation action — creates account↔saving transactions to reach
	// `desiredTotalMinor` (integer minor units, KII-120).
	reserveToSaving: (
		accountEntityId: string,
		savingEntityId: string,
		desiredTotalMinor: number
	) => Promise<void>;

	// Market value snapshot actions
	addMarketValueSnapshot: (snapshot: MarketValueSnapshot) => Promise<void>;
	updateMarketValueSnapshot: (
		id: string,
		updates: { amount_minor?: number; date?: number }
	) => Promise<void>;
	deleteMarketValueSnapshot: (id: string) => Promise<void>;
	deleteAllMarketValueSnapshots: (entityId: string) => Promise<void>;
}

// KII-132: module-level mutable promise — not reset by `useStore.setState(...)`
// in tests, so a rejected initialize poisons later tests. Move into store state.
let initializePromise: Promise<void> | null = null;

// Tracks the wall-clock time of the most recent recurrence backfill. Used by
// `backfillRecurringIfStale` to avoid re-running on every app foreground; the
// shortest supported recurrence period is daily, so once a day is sufficient.
let lastBackfillAt = 0;
const BACKFILL_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Test-only: lets the test file reset the throttle between cases.
export function _resetBackfillTimestampForTests(): void {
	lastBackfillAt = 0;
}

async function scheduleNotificationsForTransactions(
	transactions: Transaction[],
	entities: Entity[],
	set: (fn: (state: AppState) => Partial<AppState>) => void
): Promise<void> {
	const enabled = await getRemindersEnabled();
	if (!enabled) return;

	const now = Date.now();
	const toSchedule = getNotifiableTransactions(transactions, now);
	if (toSchedule.length === 0) return;

	await setupNotificationChannel();
	const entityMap = new Map(entities.map((e) => [e.id, e.name]));
	const updates: { id: string; notificationId: string }[] = [];

	for (const tx of toSchedule) {
		try {
			const notificationId = await scheduleTransactionNotification({
				transactionId: tx.id,
				fromName: entityMap.get(tx.from_entity_id) ?? 'Unknown',
				toName: entityMap.get(tx.to_entity_id) ?? 'Unknown',
				amount: `${formatAmount(tx.amount_minor, tx.currency)} ${tx.currency}`,
				timestamp: tx.timestamp,
			});
			updates.push({ id: tx.id, notificationId });
		} catch (e) {
			console.warn('Failed to schedule notification for', tx.id, e);
		}
	}

	if (updates.length > 0) {
		const stamped = await db.updateTransactionNotificationIdsBatch(updates);
		const stampedMap = new Map(stamped.map((row) => [row.id, row]));
		set((state) => ({
			transactions: state.transactions.map((t) => stampedMap.get(t.id) ?? t),
		}));
	}
}

async function syncBadgeCount(get: () => AppState): Promise<void> {
	try {
		const enabled = await getRemindersEnabled();
		if (!enabled) return;
		const count = getUnconfirmedCount(get().transactions);
		await updateBadgeCount(count);
	} catch (e) {
		console.warn('Failed to sync badge count', e);
	}
}

async function backfillRecurrences(
	templates: RecurrenceTemplate[],
	existingTransactions: Transaction[],
	entities: Entity[],
	set: (fn: (state: AppState) => Partial<AppState>) => void
): Promise<void> {
	const now = Date.now();
	const newTransactions: Transaction[] = [];

	for (const template of templates) {
		if (template.is_deleted) continue;

		// Skip templates whose entities became invalid (e.g. soft-deleted) since
		// authoring. Validating the template once is enough — every generated
		// occurrence shares its from/to/currency.
		const validation = validateTransaction(
			{
				from_entity_id: template.from_entity_id,
				to_entity_id: template.to_entity_id,
				amount_minor: template.amount_minor,
				currency: template.currency,
			},
			entities
		);
		if (!validation.ok) {
			console.warn(
				`Skipping backfill for template ${template.id}: ${validation.code} (${validation.message})`
			);
			continue;
		}

		const rule: RecurrenceRule = JSON.parse(template.rule);

		// Materialize only occurrences whose date has passed (≤ now). Future
		// occurrences are derived virtually (deriveVirtualOccurrences), never
		// stored. horizonDays: 0 bounds generateOccurrences at `now`.
		const dueTimestamps = generateOccurrences({
			rule,
			startDate: template.start_date,
			horizonDays: 0,
			now,
			endDate: template.end_date,
			endCount: template.end_count,
			exclusions: template.exclusions,
		});

		const existingCivil = new Set(
			existingTransactions
				.filter((t) => t.series_id === template.id)
				.map((t) => toCivilDate(t.timestamp))
		);

		for (const ts of dueTimestamps) {
			const civil = toCivilDate(ts);
			if (existingCivil.has(civil)) continue;
			newTransactions.push(
				buildTransaction(
					{
						id: occurrenceId(template.id, civil),
						from_entity_id: template.from_entity_id,
						to_entity_id: template.to_entity_id,
						amount_minor: template.amount_minor,
						currency: template.currency,
						timestamp: ts,
						note: template.note ?? undefined,
						series_id: template.id,
						is_confirmed: false,
					},
					now
				)
			);
		}
	}

	if (newTransactions.length > 0) {
		const result = await applyOperation(
			{ kind: 'transaction.batch_create', transactions: newTransactions },
			'local',
			{ entities, transactions: existingTransactions, recurrenceTemplates: templates } // templates is the backfill subset, unused by transaction.batch_create today; revisit if that op kind ever reads templates
		);
		if (result.kind !== 'transaction.batch_create') return;
		const stamped = result.created;
		set((state) => ({
			transactions: [...stamped, ...state.transactions],
		}));
		// Past-due rows are all ≤ now, so this is a no-op for them
		// (getNotifiableTransactions filters to future unconfirmed rows);
		// retained for safety / parity with other write paths.
		await scheduleNotificationsForTransactions(stamped, entities, set);
	}
}

export const useStore = create<AppState>((set, get) => {
	// DRY helper — builds the read-only context snapshot applyOperation needs.
	// Defined inside the creator so `get` is in scope; the resolved object is
	// identical to the inline spread it replaces.
	const buildApplyContext = () => ({
		entities: get().entities,
		transactions: get().transactions,
		recurrenceTemplates: get().recurrenceTemplates,
	});

	return {
		// Initial state
		entities: [],
		plans: [],
		transactions: [],
		recurrenceTemplates: [],
		marketValueSnapshots: [],
		currentPeriod: getCurrentPeriod(),
		isLoading: true,
		draggedEntity: null,
		incomeVisible: false,

		// Initialize from database
		initialize: async () => {
			if (initializePromise) {
				return initializePromise;
			}

			initializePromise = (async () => {
				set({ isLoading: true });
				try {
					console.info('Hydrating store from database');
					// KII-124 measurement spike: cold-start hydration is a full-table
					// scan of `transactions` loaded into the store. Time it (row count +
					// the scan itself + the load→dataReady window + backfill) so the
					// defer-vs-build decision for pagination is driven by real numbers
					// rather than the ticket's speculative "noticeable in a year". Coarse
					// ms via Date.now() is the right granularity: we only care once this
					// crosses into tens of ms; a 0–1ms reading is itself the answer.
					const hydrateStart = Date.now();
					let getAllTransactionsMs = 0;
					const [
						entities,
						plans,
						transactions,
						rawTemplates,
						marketValueSnapshots,
						exclusionsByTemplate,
					] = await Promise.all([
						db.getAllEntities(),
						db.getAllPlans(),
						(async () => {
							const start = Date.now();
							const rows = await db.getAllTransactions();
							getAllTransactionsMs = Date.now() - start;
							return rows;
						})(),
						db.getAllRecurrenceTemplates(),
						db.getAllMarketValueSnapshots(),
						db.getAllExclusionsByTemplate(),
					]);
					// KII-123: attach exclusions from the normalized table. Templates
					// without any exclusions get an empty array so consumers never
					// need to null-check.
					const recurrenceTemplates: RecurrenceTemplate[] = rawTemplates.map((t) => ({
						...t,
						exclusions: exclusionsByTemplate.get(t.id) ?? [],
					}));

					// Ensure balance adjustment system entity exists (may be missing after data reset)
					if (!entities.some((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID)) {
						const systemEntity = createBalanceAdjustmentEntity();
						await db.createEntity(systemEntity);
						entities.push(systemEntity);
					}

					// Filter out orphaned plans that reference non-existent entities
					const entityIds = new Set(entities.map((e) => e.id));
					const validPlans = plans.filter((p) => entityIds.has(p.entity_id));

					set({
						entities,
						plans: validPlans,
						transactions,
						recurrenceTemplates,
						marketValueSnapshots,
						isLoading: false,
					});

					// KII-124: data is now in the store and the UI can render — this is
					// the user-visible cold-start cost.
					const dataReadyMs = Date.now() - hydrateStart;

					// Legacy materialized future occurrences are removed by migration
					// 0021 (runs before hydration), so the rows loaded above are already
					// free of phantom future rows.
					// Backfill any missing past-due occurrences.
					const backfillStart = Date.now();
					await backfillRecurrences(recurrenceTemplates, transactions, entities, set);
					const backfillMs = Date.now() - backfillStart;
					lastBackfillAt = Date.now();

					// KII-124: one structured line per cold start. `getAllTransactions`
					// vs `dataReady` shows whether the transaction scan is the long pole
					// among the six concurrent loads.
					console.info(
						`[hydration] ${transactions.length} txns | getAllTransactions ${getAllTransactionsMs}ms | dataReady ${dataReadyMs}ms | backfill ${backfillMs}ms`
					);
				} catch (error) {
					console.error('Failed to initialize store:', error);
					set({ isLoading: false });
					throw error;
				} finally {
					initializePromise = null;
				}
			})();

			return initializePromise;
		},

		// Replace all data atomically — used by CSV import.
		replaceAllData: async (
			newEntities,
			newPlans,
			newTransactions,
			newRecurrenceTemplates,
			newMarketValueSnapshots = []
		) => {
			// Cancel all scheduled notifications before replacing data —
			// side effect, local only by construction.
			try {
				await cancelAllNotifications();
				await updateBadgeCount(0);
			} catch (e) {
				console.warn('Failed to cancel notifications on data replace', e);
			}

			const result = await applyOperation(
				{
					kind: 'import.replace_all',
					entities: newEntities,
					plans: newPlans,
					transactions: newTransactions,
					recurrenceTemplates: newRecurrenceTemplates,
					marketValueSnapshots: newMarketValueSnapshots,
				},
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'import.replace_all') return;
			set({
				entities: result.entities,
				plans: result.plans,
				transactions: result.transactions,
				recurrenceTemplates: result.recurrenceTemplates,
				marketValueSnapshots: result.marketValueSnapshots,
			});
		},

		setCurrentPeriod: (period) => set({ currentPeriod: period }),
		setDraggedEntity: (entity) => set({ draggedEntity: entity }),
		toggleIncomeVisible: () => set((state) => ({ incomeVisible: !state.incomeVisible })),

		// Entity actions
		addEntity: async (entity) => {
			const result = await applyOperation(
				{ kind: 'entity.create', entity },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'entity.create') return;
			set((state) => ({ entities: [...state.entities, result.created] }));
		},

		updateEntity: async (entity) => {
			const result = await applyOperation(
				{ kind: 'entity.update', entity },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'entity.update') return;
			const stamped = result.updated;
			set((state) => ({
				entities: state.entities.map((e) => (e.id === stamped.id ? stamped : e)),
			}));
		},

		updateEntityWithOptions: async (entity, options) => {
			const result = await applyOperation(
				{ kind: 'entity.update', entity, options },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'entity.update') return;
			const stamped = result.updated;
			set((state) => ({
				entities: state.entities.map((e) => (e.id === stamped.id ? stamped : e)),
				marketValueSnapshots: options?.deleteMarketValueSnapshots
					? state.marketValueSnapshots.filter((s) => s.entity_id !== entity.id)
					: state.marketValueSnapshots,
			}));
		},

		deleteEntity: async (id) => {
			// Guards (system entity, already-inactive) live in applyOperation now.
			const result = await applyOperation(
				{ kind: 'entity.delete', id },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'entity.delete' || result.entities === null) return;
			const nextEntities = result.entities;
			// KII-132: functional updater so a concurrent `plans` mutation isn't
			// clobbered by a stale pre-await snapshot.
			set((state) => ({
				entities: nextEntities,
				plans: state.plans.filter((p) => p.entity_id !== id),
			}));
		},

		// LOCAL-ONLY (never an op): row/position are per-device fields per the
		// KII-96 field-locality decision — they never sync, so this action
		// deliberately bypasses applyOperation.
		reorderEntitiesByIds: async (type, orderedIds, maxRows) => {
			const state = get();

			// Convert flat ordered list to row/position assignments
			// Horizontal grid: items flow left-to-right (columns), then top-to-bottom (rows within column)
			// Index i maps to: col = floor(i / maxRows), row = i % maxRows
			// In DB: position = column index, row = row within that column
			const updates: { id: string; row: number; position: number }[] = [];

			for (const [i, id] of orderedIds.entries()) {
				const entity = state.entities.find((e) => e.id === id && !e.is_deleted);
				if (!entity || entity.type !== type) continue;

				const position = Math.floor(i / maxRows); // column index
				const row = i % maxRows; // row within column

				// Only add to updates if position actually changed
				if (entity.row !== row || entity.position !== position) {
					updates.push({ id, row, position });
				}
			}

			if (updates.length === 0) return;

			// Batch update all positions, then mirror DB-stamped rows into state.
			const stamped = await db.updateEntityPositions(updates);
			const stampedMap = new Map(stamped.map((row) => [row.id, row]));
			set((state) => ({
				entities: state.entities.map((e) => stampedMap.get(e.id) ?? e),
			}));
		},

		// Plan actions
		setPlan: async (plan) => {
			// Entity-exists validation lives in applyOperation now.
			const result = await applyOperation(
				{ kind: 'plan.set', plan },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'plan.set' || !result.plan) return;
			const stamped = result.plan;
			set((state) => {
				const existingIndex = state.plans.findIndex((p) => p.id === stamped.id);
				if (existingIndex >= 0) {
					const newPlans = [...state.plans];
					newPlans[existingIndex] = stamped;
					return { plans: newPlans };
				}
				return { plans: [...state.plans, stamped] };
			});
		},

		deletePlan: async (id) => {
			const result = await applyOperation(
				{ kind: 'plan.delete', id },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'plan.delete') return;
			set((state) => ({
				plans: state.plans.filter((plan) => plan.id !== id),
			}));
		},

		// Transaction actions
		addTransaction: async (transaction) => {
			const result = await applyOperation(
				{ kind: 'transaction.create', transaction },
				'local',
				buildApplyContext()
			);
			// Narrowing only: applyOperation returns the OpResult matching the op kind,
			// so this guard never trips at runtime — it exists to narrow the union for TS.
			if (result.kind !== 'transaction.create') return;
			set((state) => ({ transactions: [result.created, ...state.transactions] }));
		},

		materializeOccurrence: async (occurrence) => {
			// A virtual occurrence (derived, isVirtual: true) has no DB row. Insert
			// one with its deterministic id so the normal id-based edit/delete/
			// confirm paths can operate on a real row. Idempotent against in-memory
			// state: if the store already tracks this id, return that row instead of
			// re-inserting (all write paths flow through this state, so this also
			// avoids a duplicate-id INSERT against the DB).
			const existing = get().transactions.find((t) => t.id === occurrence.id);
			if (existing) return existing;

			const row = buildTransaction(
				{
					id: occurrence.id,
					from_entity_id: occurrence.from_entity_id,
					to_entity_id: occurrence.to_entity_id,
					amount_minor: occurrence.amount_minor,
					currency: occurrence.currency,
					timestamp: occurrence.timestamp,
					note: occurrence.note ?? undefined,
					series_id: occurrence.series_id ?? undefined,
					is_confirmed: occurrence.is_confirmed ?? false,
				},
				Date.now()
			);
			const result = await applyOperation(
				{ kind: 'transaction.create', transaction: row },
				'local',
				buildApplyContext()
			);
			// Must return a Transaction, so silent return is not an option; branch is unreachable.
			if (result.kind !== 'transaction.create') {
				throw new Error('applyOperation returned mismatched result for transaction.create');
			}
			set((state) => ({ transactions: [result.created, ...state.transactions] }));
			return result.created;
		},

		excludeOccurrence: async (occurrence) => {
			// Deleting a single virtual (future) occurrence is purely an exclusion:
			// there is no materialized row to remove, so record the skip directly
			// rather than materialize-then-delete. Derivation then omits this civil
			// date. (Edit/confirm still materialize, since they need a real row.)
			const seriesId = occurrence.series_id;
			if (!seriesId) return;
			const exclusionTs = occurrence.timestamp;
			const result = await applyOperation(
				{ kind: 'recurrence.exclude', seriesId, timestamp: exclusionTs },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'recurrence.exclude') return;
			set((state) => ({
				recurrenceTemplates: state.recurrenceTemplates.map((t) => {
					if (t.id !== seriesId) return t;
					const existing = t.exclusions ?? [];
					if (existing.includes(exclusionTs)) return t;
					return { ...t, exclusions: [...existing, exclusionTs] };
				}),
			}));
		},

		createTransactionBatch: async (transactions) => {
			if (transactions.length === 0) return;

			const ctx = buildApplyContext();
			const result = await applyOperation(
				{ kind: 'transaction.batch_create', transactions },
				'local',
				ctx
			);
			if (result.kind !== 'transaction.batch_create') return;
			set((state) => ({ transactions: [...result.created, ...state.transactions] }));

			// Side effect — local only by construction (inbound ops call applyOperation
			// directly and never reach this store action).
			await scheduleNotificationsForTransactions(result.created, ctx.entities, set);
		},

		updateTransaction: async (id, updates) => {
			const result = await applyOperation(
				{ kind: 'transaction.update', id, updates },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'transaction.update' || !result.updated) return;
			const stamped = result.updated;
			set((state) => ({
				transactions: state.transactions.map((t) => (t.id === stamped.id ? stamped : t)),
			}));
		},

		deleteTransaction: async (id) => {
			const transaction = get().transactions.find((t) => t.id === id);
			// Side effect — local only by construction.
			if (transaction?.notification_id) {
				try {
					await cancelNotification(transaction.notification_id);
				} catch (e) {
					console.warn('Failed to cancel notification', e);
				}
			}
			await applyOperation({ kind: 'transaction.delete', id }, 'local', buildApplyContext());
			set((state) => ({
				transactions: state.transactions.filter((t) => t.id !== id),
			}));
		},

		replaceTransactionWithSplit: async (originalId, rows) => {
			const state = get();
			const original = state.transactions.find((t) => t.id === originalId);
			if (!original) {
				console.warn(`Cannot split non-existent transaction: ${originalId}`);
				return;
			}
			if (rows.length === 0) {
				console.warn('replaceTransactionWithSplit called with no rows; aborting');
				return;
			}

			// Cancel the original's scheduled notification (if any) BEFORE mutating the DB
			// so a system-side failure surfaces before we touch persistent state.
			// Side effect — local only by construction.
			if (original.notification_id) {
				try {
					await cancelNotification(original.notification_id);
				} catch (e) {
					console.warn('Failed to cancel notification', e);
				}
			}

			const seriesExclusion = original.series_id
				? { templateId: original.series_id, timestamp: original.timestamp }
				: undefined;

			const result = await applyOperation(
				{ kind: 'transaction.split', originalId, rows, seriesExclusion },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'transaction.split') return;
			const stamped = result.created;

			set((s) => {
				const transactionsNext = [
					...stamped,
					...s.transactions.filter((t) => t.id !== originalId),
				];
				let recurrenceTemplatesNext = s.recurrenceTemplates;
				if (seriesExclusion) {
					recurrenceTemplatesNext = s.recurrenceTemplates.map((t) => {
						if (t.id !== seriesExclusion.templateId) return t;
						const existing = t.exclusions ?? [];
						// Idempotent merge — mirrors the DB's INSERT OR IGNORE.
						if (existing.includes(seriesExclusion.timestamp)) return t;
						return { ...t, exclusions: [...existing, seriesExclusion.timestamp] };
					});
				}
				return {
					transactions: transactionsNext,
					recurrenceTemplates: recurrenceTemplatesNext,
				};
			});

			await scheduleNotificationsForTransactions(stamped, get().entities, set);
		},

		// Recurrence actions
		addRecurringTransaction: async (transaction, recurrence) => {
			const template = buildRecurringTemplate({
				from_entity_id: transaction.from_entity_id,
				to_entity_id: transaction.to_entity_id,
				amount_minor: transaction.amount_minor,
				currency: transaction.currency,
				note: transaction.note ?? undefined,
				timestamp: transaction.timestamp,
				rule: recurrence.rule,
				endDate: recurrence.endDate,
				endCount: recurrence.endCount,
			});
			const result = await applyOperation(
				{ kind: 'recurrence.create', template },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'recurrence.create') return;
			const stampedTemplate = result.created;

			set((state) => ({
				recurrenceTemplates: [...state.recurrenceTemplates, stampedTemplate],
			}));

			// A template whose first occurrence is already due (start ≤ now) should
			// materialize immediately as an unconfirmed past-due row; future
			// occurrences are derived on demand, never stored. backfillRecurrences
			// (unthrottled) handles past-due materialization + its own dedup.
			await backfillRecurrences(
				[{ ...stampedTemplate, exclusions: [] }],
				get().transactions,
				get().entities,
				set
			);

			// Request permission on first recurring transaction (contextual ask) —
			// side effect, local only by construction.
			const remindersEnabled = await getRemindersEnabled();
			const hasAsked = await getHasRequestedPermission();
			if (remindersEnabled && !hasAsked) {
				const granted = await requestPermission();
				await setHasRequestedPermission(true);
				if (!granted) {
					await setRemindersEnabled(false);
				}
			}
		},

		// Materialize past-due occurrences since the last run. Because
		// backfillRecurrences passes horizonDays: 0, `generateOccurrences` is
		// bounded at `now` — no future phantom rows are written (future
		// occurrences are derived on demand). Throttled to once per day (the
		// shortest recurrence period) so an app foreground bounce doesn't thrash
		// the DB.
		backfillRecurringIfStale: async () => {
			const now = Date.now();
			if (now - lastBackfillAt < BACKFILL_MIN_INTERVAL_MS) return;
			const state = get();
			await backfillRecurrences(
				state.recurrenceTemplates,
				state.transactions,
				state.entities,
				set
			);
			lastBackfillAt = now;
		},

		updateTransactionWithScope: async (id, updates, scope) => {
			const state = get();
			const transaction = state.transactions.find((t) => t.id === id);
			if (!transaction) return;

			if (scope === 'single' || !transaction.series_id) {
				await get().updateTransaction(id, updates);
				return;
			}

			// scope === 'future': one atomic-intent op updates template + future rows.
			const result = await applyOperation(
				{ kind: 'recurrence.update_future', anchorId: id, updates },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'recurrence.update_future') return;

			const stampedTxnMap = new Map(result.transactions.map((t) => [t.id, t]));
			const updatedTemplate = result.template;
			set((state) => ({
				recurrenceTemplates: updatedTemplate
					? state.recurrenceTemplates.map((t) =>
							t.id === updatedTemplate.id
								? { ...updatedTemplate, exclusions: t.exclusions ?? [] }
								: t
						)
					: state.recurrenceTemplates,
				transactions: state.transactions.map((t) => stampedTxnMap.get(t.id) ?? t),
			}));
		},

		deleteTransactionWithScope: async (id, scope) => {
			const state = get();
			const transaction = state.transactions.find((t) => t.id === id);
			if (!transaction) return;

			if (scope === 'single' || !transaction.series_id) {
				// Side effect — local only by construction.
				if (transaction.notification_id) {
					try {
						await cancelNotification(transaction.notification_id);
					} catch (e) {
						console.warn('Failed to cancel notification', e);
					}
				}
				// KII-123: for a series row, delete + exclusion-insert happen in a
				// single SQLite tx inside the op, so a crash between them can't strand
				// the row (deleted) and the exclusion (missing) — which would let
				// backfillRecurrences silently resurrect the occurrence on next launch.
				const seriesExclusion = transaction.series_id
					? { templateId: transaction.series_id, timestamp: transaction.timestamp }
					: undefined;
				await applyOperation(
					{ kind: 'transaction.delete', id, seriesExclusion },
					'local',
					buildApplyContext()
				);
				set((state) => ({
					transactions: state.transactions.filter((t) => t.id !== id),
					recurrenceTemplates: seriesExclusion
						? state.recurrenceTemplates.map((t) => {
								if (t.id !== seriesExclusion.templateId) return t;
								const existing = t.exclusions ?? [];
								if (existing.includes(seriesExclusion.timestamp)) return t;
								return {
									...t,
									exclusions: [...existing, seriesExclusion.timestamp],
								};
							})
						: state.recurrenceTemplates,
				}));
				return;
			}

			// scope === 'future'
			const seriesId = transaction.series_id;

			// Cancel notifications for all future transactions in this series —
			// side effect, local only by construction.
			const futureTxs = state.transactions.filter(
				(t) =>
					t.series_id === seriesId &&
					t.timestamp >= transaction.timestamp &&
					t.notification_id
			);
			for (const tx of futureTxs) {
				try {
					await cancelNotification(tx.notification_id!);
				} catch (e) {
					console.warn('Failed to cancel notification', e);
				}
			}

			const result = await applyOperation(
				{
					kind: 'recurrence.delete_future',
					seriesId,
					fromTimestamp: transaction.timestamp,
				},
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'recurrence.delete_future') return;
			const stampedTemplate = result.template;

			set((state) => ({
				transactions: state.transactions.filter(
					(t) => !(t.series_id === seriesId && t.timestamp >= transaction.timestamp)
				),
				recurrenceTemplates: state.recurrenceTemplates.map((t) =>
					stampedTemplate && t.id === stampedTemplate.id
						? { ...stampedTemplate, exclusions: t.exclusions ?? [] }
						: t
				),
			}));
		},

		deactivateTemplatesForEntity: async (entityId) => {
			const state = get();
			const now = Date.now();
			const templates = state.recurrenceTemplates.filter(
				(t) =>
					!t.is_deleted && (t.from_entity_id === entityId || t.to_entity_id === entityId)
			);
			if (templates.length === 0) return;

			// Cancel notifications for future transactions being deleted —
			// side effect, local only by construction.
			const templateIds = new Set(templates.map((t) => t.id));
			const futureTxs = state.transactions.filter(
				(t) =>
					t.series_id &&
					templateIds.has(t.series_id) &&
					t.timestamp >= now &&
					t.notification_id
			);
			for (const tx of futureTxs) {
				try {
					await cancelNotification(tx.notification_id!);
				} catch (e) {
					console.warn('Failed to cancel notification', e);
				}
			}

			const stampedTemplates: RecurrenceTemplate[] = [];
			for (const template of templates) {
				const result = await applyOperation(
					{ kind: 'recurrence.deactivate', seriesId: template.id, fromTimestamp: now },
					'local',
					buildApplyContext()
				);
				if (result.kind === 'recurrence.deactivate' && result.template) {
					stampedTemplates.push(result.template);
				}
			}

			const stampedMap = new Map(stampedTemplates.map((t) => [t.id, t]));
			set((state) => ({
				transactions: state.transactions.filter(
					(t) => !(t.series_id && templateIds.has(t.series_id) && t.timestamp >= now)
				),
				recurrenceTemplates: state.recurrenceTemplates.map((t) => {
					const stamped = stampedMap.get(t.id);
					return stamped ? { ...stamped, exclusions: t.exclusions ?? [] } : t;
				}),
			}));
		},

		// Confirmation actions
		confirmTransaction: async (id) => {
			const transaction = get().transactions.find((t) => t.id === id);
			// Side effect — local only by construction.
			if (transaction?.notification_id) {
				try {
					await cancelNotification(transaction.notification_id);
				} catch (e) {
					console.warn('Failed to cancel notification', e);
				}
			}
			const result = await applyOperation(
				{ kind: 'transaction.confirm', ids: [id] },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'transaction.confirm') return;
			const stampedMap = new Map(result.confirmed.map((t) => [t.id, t]));
			set((state) => ({
				transactions: state.transactions.map((t) => stampedMap.get(t.id) ?? t),
			}));
			await syncBadgeCount(get);
		},

		confirmAllDueTransactions: async () => {
			const now = Date.now();
			const dueTxs = get().transactions.filter(
				(t) => t.is_confirmed === false && t.timestamp <= now
			);
			if (dueTxs.length === 0) return;

			// Cancel notifications for transactions being confirmed — local only.
			for (const tx of dueTxs) {
				if (tx.notification_id) {
					try {
						await cancelNotification(tx.notification_id);
					} catch (e) {
						console.warn('Failed to cancel notification', e);
					}
				}
			}

			const result = await applyOperation(
				{ kind: 'transaction.confirm', ids: dueTxs.map((t) => t.id) },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'transaction.confirm') return;
			const stampedMap = new Map(result.confirmed.map((t) => [t.id, t]));
			set((state) => ({
				transactions: state.transactions.map((t) => stampedMap.get(t.id) ?? t),
			}));
			await syncBadgeCount(get);
		},

		// LOCAL-ONLY (never an op): is_default is a per-device field per the
		// KII-96 field-locality decision — atomic clear-and-set in a single DB
		// transaction (KII-113), deliberately outside applyOperation.
		setDefaultAccount: async (accountId) => {
			const stamped = await db.setDefaultAccount(accountId);
			const stampedMap = new Map(stamped.map((e) => [e.id, e]));
			set((state) => ({
				entities: state.entities.map((e) => stampedMap.get(e.id) ?? e),
			}));
		},

		// Savings reservation — the op carries the intent (target total); delta
		// computation and row construction live in applyOperation.
		reserveToSaving: async (accountEntityId, savingEntityId, desiredTotalMinor) => {
			const result = await applyOperation(
				{ kind: 'reservation.set', accountEntityId, savingEntityId, desiredTotalMinor },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'reservation.set' || !result.created) return;
			const stamped = result.created;
			set((s) => ({ transactions: [stamped, ...s.transactions] }));
		},

		// Market value snapshot actions
		addMarketValueSnapshot: async (snapshot) => {
			const result = await applyOperation(
				{ kind: 'market_value.create', snapshot },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'market_value.create') return;
			set((state) => ({
				marketValueSnapshots: [result.created, ...state.marketValueSnapshots],
			}));
		},

		updateMarketValueSnapshot: async (id, updates) => {
			const result = await applyOperation(
				{ kind: 'market_value.update', id, updates },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'market_value.update' || !result.updated) return;
			const stamped = result.updated;
			set((state) => ({
				marketValueSnapshots: state.marketValueSnapshots.map((s) =>
					s.id === stamped.id ? stamped : s
				),
			}));
		},

		deleteMarketValueSnapshot: async (id) => {
			const result = await applyOperation(
				{ kind: 'market_value.delete', id },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'market_value.delete') return;
			set((state) => ({
				marketValueSnapshots: state.marketValueSnapshots.filter((s) => s.id !== id),
			}));
		},

		deleteAllMarketValueSnapshots: async (entityId) => {
			const result = await applyOperation(
				{ kind: 'market_value.delete_all', entityId },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'market_value.delete_all') return;
			set((state) => ({
				marketValueSnapshots: state.marketValueSnapshots.filter(
					(s) => s.entity_id !== entityId
				),
			}));
		},
	};
});

// Selectors - using useShallow and useMemo to prevent infinite loops

// Pure function to calculate balances for entities (testable without React)
export function getEntitiesWithBalance(
	entities: Entity[],
	plans: Plan[],
	transactions: Transaction[],
	currentPeriod: string,
	type: EntityType,
	marketValueSnapshots?: MarketValueSnapshot[]
): EntityWithBalance[] {
	const { start, end } = getPeriodRange(currentPeriod);
	// Filter by type and exclude system entities (balance adjustments)
	const filteredEntities = entities
		.filter(
			(e) => e.type === type && e.id !== BALANCE_ADJUSTMENT_ENTITY_ID && e.is_deleted !== true
		)
		.sort((a, b) => a.row - b.row || a.position - b.position);

	const now = Date.now();
	// Accounts and savings use all transactions (all-time balance); income and
	// categories use the current period only.
	const useAllTime = type === 'account' || type === 'saving';

	// KII-124: single pass over `transactions` accumulating per-entity bucket
	// totals, replacing the previous per-entity filter/reduce. The old shape was
	// O(entities × transactions) — each entity re-walked the whole array (all of
	// it, for all-time account/saving) three times — which dominated the
	// month-switch cost on multi-year histories. This is O(transactions).
	const buckets = new Map<string, { actual: number; upcoming: number; unconfirmed: number }>();
	for (const entity of filteredEntities) {
		buckets.set(entity.id, { actual: 0, upcoming: 0, unconfirmed: 0 });
	}

	// Signed contribution of one transaction to one tracked entity, preserving
	// the previous `calcBalance` semantics exactly:
	// - account/saving: net flow — incoming (+), outgoing (-)
	// - income: money flowing OUT is positive (from +), in is negative (to -)
	// - category: only incoming counts (to +); as a source it contributes 0
	const contribution = (t: Transaction, entityId: string): number => {
		switch (type) {
			case 'account':
			case 'saving':
				if (t.from_entity_id === entityId) return -t.amount_minor;
				if (t.to_entity_id === entityId) return t.amount_minor;
				return 0;
			case 'income':
				if (t.from_entity_id === entityId) return t.amount_minor;
				if (t.to_entity_id === entityId) return -t.amount_minor;
				return 0;
			case 'category':
				return t.to_entity_id === entityId ? t.amount_minor : 0;
		}
	};

	for (const t of transactions) {
		// Income/categories are period-scoped; accounts/savings are all-time.
		if (!useAllTime && (t.timestamp < start || t.timestamp > end)) continue;

		// KII-132: `is_confirmed === undefined` is treated as confirmed here
		// (`!== false`) but as unconfirmed by the badge count (`=== false`).
		// Normalize to a non-optional boolean at the DB read boundary.
		let bucketKey: 'actual' | 'upcoming' | 'unconfirmed';
		if (t.timestamp > now) {
			// Future rows only count toward "upcoming" up to the period end;
			// anything past `end` is out of view for every bucket.
			if (t.timestamp > end) continue;
			bucketKey = 'upcoming';
		} else {
			bucketKey = t.is_confirmed !== false ? 'actual' : 'unconfirmed';
		}

		// A transaction can touch two tracked entities of the same type (e.g. an
		// account→account transfer): debit the source and credit the destination
		// from the same row. Validation rejects from===to (SAME_ENTITY), but guard
		// against degenerate/imported self-referential rows so a single bucket
		// isn't debited twice (from-branch matches first, doubling the outflow).
		const fromBucket = buckets.get(t.from_entity_id);
		if (fromBucket) fromBucket[bucketKey] += contribution(t, t.from_entity_id);
		if (t.to_entity_id !== t.from_entity_id) {
			const toBucket = buckets.get(t.to_entity_id);
			if (toBucket) toBucket[bucketKey] += contribution(t, t.to_entity_id);
		}
	}

	return filteredEntities.map((entity) => {
		// All plans use 'all-time' period - static budget/goal that applies every month
		const plan = plans.find((p) => p.entity_id === entity.id && p.period === 'all-time');
		const planned = plan?.planned_amount_minor ?? 0;

		const bucket = buckets.get(entity.id)!;

		// Track how much of the account's outflows went to savings (for funding-section breakdown)
		// Since KII-61 savings are real transactions already reflected in actual
		const reserved =
			entity.type === 'account'
				? getTotalReservedForAccount(transactions, entities, entity.id)
				: 0;

		// For investment accounts, find the latest market value snapshot
		let latestMarketValue: number | null = null;
		if (entity.type === 'account' && entity.is_investment && marketValueSnapshots) {
			const latest = marketValueSnapshots
				.filter((s) => s.entity_id === entity.id)
				.sort((a, b) => b.date - a.date)[0];
			if (latest) {
				latestMarketValue = latest.amount_minor;
			}
		}

		return {
			...entity,
			planned,
			actual: bucket.actual,
			upcoming: bucket.upcoming,
			unconfirmed: bucket.unconfirmed,
			reserved,
			latestMarketValue,
			remaining: planned - bucket.actual,
		};
	});
}

export function getUnconfirmedCount(transactions: Transaction[]): number {
	const now = Date.now();
	return transactions.filter((t) => t.is_confirmed === false && t.timestamp <= now).length;
}

export function useUnconfirmedCount(): number {
	const transactions = useStore((state) => state.transactions);
	return useMemo(() => getUnconfirmedCount(transactions), [transactions]);
}

// React hook that wraps the pure function
export function useEntitiesWithBalance(type: EntityType): EntityWithBalance[] {
	const {
		entities,
		plans,
		transactions,
		currentPeriod,
		marketValueSnapshots,
		recurrenceTemplates,
	} = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
			transactions: state.transactions,
			currentPeriod: state.currentPeriod,
			marketValueSnapshots: state.marketValueSnapshots,
			recurrenceTemplates: state.recurrenceTemplates,
		}))
	);

	return useMemo(() => {
		const { start, end } = getPeriodRange(currentPeriod);
		const now = Date.now();
		const exclusionsByTemplate = new Map(
			recurrenceTemplates.map((t) => [t.id, new Set((t.exclusions ?? []).map(toCivilDate))])
		);
		const virtual = deriveVirtualOccurrences(
			recurrenceTemplates,
			exclusionsByTemplate,
			transactions,
			start,
			end,
			now
		);
		return getEntitiesWithBalance(
			entities,
			plans,
			[...transactions, ...virtual],
			currentPeriod,
			type,
			marketValueSnapshots
		);
	}, [
		entities,
		plans,
		transactions,
		currentPeriod,
		type,
		marketValueSnapshots,
		recurrenceTemplates,
	]);
}
