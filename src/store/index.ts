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
import * as schema from '@/src/db/drizzle-schema';
import { generateId } from '@/src/utils/ids';
import { generateOccurrences } from '@/src/utils/recurrence';
import { getCurrencyDecimalPlaces } from '@/src/utils/currency-precision';
import { roundMoney } from '@/src/utils/format';
import {
	BALANCE_ADJUSTMENT_ENTITY_ID,
	createBalanceAdjustmentEntity,
} from '@/src/constants/system-entities';
import { isEntityActive } from '@/src/utils/entity-display';
import {
	getReservationForPair,
	getTotalReservedForAccount,
} from '@/src/utils/savings-transactions';
import {
	ensureValid,
	validateTransaction,
	validateUpdate,
} from '@/src/utils/transaction-validation';
import {
	buildRecurringTemplate,
	buildTransaction,
	defaultIsConfirmed,
} from '@/src/utils/transaction-builder';
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
			horizon: number;
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

	// Confirmation actions
	confirmTransaction: (id: string) => Promise<void>;
	confirmAllDueTransactions: () => Promise<void>;

	// Default account — toggle the default flag; only one account at a time
	setDefaultAccount: (accountId: string | null) => Promise<void>;

	// Savings reservation action — creates account↔saving transactions to reach desiredTotal
	reserveToSaving: (
		accountEntityId: string,
		savingEntityId: string,
		desiredTotal: number
	) => Promise<void>;

	// Market value snapshot actions
	addMarketValueSnapshot: (snapshot: MarketValueSnapshot) => Promise<void>;
	updateMarketValueSnapshot: (
		id: string,
		updates: { amount?: number; date?: number }
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

function getActiveEntities(entities: Entity[]): Entity[] {
	return entities.filter(isEntityActive);
}

function hasActiveEntity(entities: Entity[], id: string): boolean {
	return getActiveEntities(entities).some((entity) => entity.id === id);
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
				amount: `${tx.amount} ${tx.currency}`,
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
				amount: template.amount,
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
		const exclusions = template.exclusions ?? [];

		const expectedTimestamps = generateOccurrences({
			rule,
			startDate: template.start_date,
			horizonDays: template.horizon,
			now,
			endDate: template.end_date,
			endCount: template.end_count,
			exclusions,
		});

		const existingTimestamps = new Set(
			existingTransactions.filter((t) => t.series_id === template.id).map((t) => t.timestamp)
		);

		for (const ts of expectedTimestamps) {
			if (!existingTimestamps.has(ts)) {
				newTransactions.push(
					buildTransaction(
						{
							from_entity_id: template.from_entity_id,
							to_entity_id: template.to_entity_id,
							amount: template.amount,
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
	}

	if (newTransactions.length > 0) {
		const stamped = await db.createTransactionBatch(newTransactions);
		set((state) => ({
			transactions: [...stamped, ...state.transactions],
		}));
		// Schedule notifications for future unconfirmed transactions
		await scheduleNotificationsForTransactions(stamped, entities, set);
	}
}

export const useStore = create<AppState>((set, get) => ({
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
					db.getAllTransactions(),
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

				// Backfill any missing occurrences within the horizon window
				await backfillRecurrences(recurrenceTemplates, transactions, entities, set);
				lastBackfillAt = Date.now();
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
		// Cancel all scheduled notifications before replacing data
		try {
			await cancelAllNotifications();
			await updateBadgeCount(0);
		} catch (e) {
			console.warn('Failed to cancel notifications on data replace', e);
		}

		const drizzleDb = await db.getDrizzleDb();

		// Wrap in transaction so a mid-import failure doesn't leave an empty DB
		const now = Date.now();
		await drizzleDb.transaction((tx) => {
			// Delete in FK-safe order: snapshots → transactions → exclusions →
			// recurrenceTemplates → plans → entities (KII-123 added exclusions).
			tx.delete(schema.marketValueSnapshots).run();
			tx.delete(schema.transactions).run();
			tx.delete(schema.recurrenceExclusions).run();
			tx.delete(schema.recurrenceTemplates).run();
			tx.delete(schema.plans).run();
			tx.delete(schema.entities).run();

			// Insert in FK-safe order: entities → plans → recurrenceTemplates → transactions → snapshots.
			// `created_at`/`updated_at` come from CSV when present (round-trip
			// preserves write-time across export/import); otherwise stamp now.
			for (const entity of newEntities) {
				tx.insert(schema.entities)
					.values({
						id: entity.id,
						type: entity.type,
						name: entity.name,
						currency: entity.currency,
						icon: entity.icon ?? null,
						color: entity.color ?? null,
						row: entity.row,
						position: entity.position,
						order: entity.order ?? 0,
						include_in_total: entity.include_in_total ?? true,
						is_deleted: entity.is_deleted ?? false,
						is_default: entity.is_default ?? false,
						is_investment: entity.is_investment ?? false,
						created_at: entity.created_at ?? now,
						updated_at: entity.updated_at ?? now,
					})
					.run();
			}
			for (const plan of newPlans) {
				tx.insert(schema.plans)
					.values({
						...plan,
						created_at: plan.created_at ?? now,
						updated_at: plan.updated_at ?? now,
					})
					.run();
			}
			for (const template of newRecurrenceTemplates) {
				tx.insert(schema.recurrenceTemplates)
					.values({
						id: template.id,
						from_entity_id: template.from_entity_id,
						to_entity_id: template.to_entity_id,
						amount: template.amount,
						currency: template.currency,
						note: template.note ?? null,
						rule: template.rule,
						start_date: template.start_date,
						end_date: template.end_date ?? null,
						end_count: template.end_count ?? null,
						horizon: template.horizon,
						is_deleted: template.is_deleted ?? false,
						created_at: template.created_at,
						updated_at: template.updated_at ?? template.created_at,
					})
					.run();
				// KII-123: write exclusions into the normalized table. We do this
				// inside the FK-safe insert window (templates already inserted in
				// the loop above, so each exclusion's FK target exists).
				for (const ts of template.exclusions ?? []) {
					tx.insert(schema.recurrenceExclusions)
						.values({ template_id: template.id, timestamp: ts })
						.onConflictDoNothing()
						.run();
				}
			}
			for (const txn of newTransactions) {
				tx.insert(schema.transactions)
					.values({
						id: txn.id,
						from_entity_id: txn.from_entity_id,
						to_entity_id: txn.to_entity_id,
						amount: txn.amount,
						currency: txn.currency,
						timestamp: txn.timestamp,
						note: txn.note ?? null,
						series_id: txn.series_id ?? null,
						is_confirmed: txn.is_confirmed ?? true,
						created_at: txn.created_at ?? now,
						updated_at: txn.updated_at ?? now,
					})
					.run();
			}
			for (const snapshot of newMarketValueSnapshots) {
				tx.insert(schema.marketValueSnapshots)
					.values({
						...snapshot,
						created_at: snapshot.created_at ?? now,
						updated_at: snapshot.updated_at ?? now,
					})
					.run();
			}
		});

		// Re-read all data from DB into store state
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
			db.getAllTransactions(),
			db.getAllRecurrenceTemplates(),
			db.getAllMarketValueSnapshots(),
			db.getAllExclusionsByTemplate(),
		]);
		const recurrenceTemplates: RecurrenceTemplate[] = rawTemplates.map((t) => ({
			...t,
			exclusions: exclusionsByTemplate.get(t.id) ?? [],
		}));
		set({ entities, plans, transactions, recurrenceTemplates, marketValueSnapshots });
	},

	setCurrentPeriod: (period) => set({ currentPeriod: period }),
	setDraggedEntity: (entity) => set({ draggedEntity: entity }),
	toggleIncomeVisible: () => set((state) => ({ incomeVisible: !state.incomeVisible })),

	// Entity actions
	addEntity: async (entity) => {
		const stamped = await db.createEntity(entity);
		set((state) => ({ entities: [...state.entities, stamped] }));
	},

	updateEntity: async (entity) => {
		const stamped = await db.updateEntity(entity);
		set((state) => ({
			entities: state.entities.map((e) => (e.id === stamped.id ? stamped : e)),
		}));
	},

	updateEntityWithOptions: async (entity, options) => {
		const stamped = await db.updateEntity(entity, options);
		set((state) => ({
			entities: state.entities.map((e) => (e.id === stamped.id ? stamped : e)),
			marketValueSnapshots: options?.deleteMarketValueSnapshots
				? state.marketValueSnapshots.filter((s) => s.entity_id !== entity.id)
				: state.marketValueSnapshots,
		}));
	},

	deleteEntity: async (id) => {
		// Prevent deleting system entities
		if (id === BALANCE_ADJUSTMENT_ENTITY_ID) {
			console.warn('Cannot delete system entity');
			return;
		}

		const state = get();
		const entity = state.entities.find((e) => e.id === id);
		if (!isEntityActive(entity)) {
			return;
		}

		// Use deleteEntityAndReindex to close gaps
		await db.deleteEntityAndReindex(id);

		// Reload entities to get updated positions (deleteEntityAndReindex
		// returns the touched rows, but we use the full select to keep ordering
		// consistent with how `initialize` hydrates the store).
		const updatedEntities = await db.getAllEntities();
		// KII-132: `state` captured before await — non-functional set overwrites
		// any concurrent `plans` mutation. Switch to functional updater.
		set({
			entities: updatedEntities,
			plans: state.plans.filter((p) => p.entity_id !== id),
		});
	},

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
		// Validate that the entity exists before setting the plan
		const state = get();
		const entityExists = hasActiveEntity(state.entities, plan.entity_id);
		if (!entityExists) {
			console.warn(`Cannot set plan for non-existent entity: ${plan.entity_id}`);
			return;
		}

		const stamped = await db.upsertPlan(plan);
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
		await db.deletePlan(id);
		set((state) => ({
			plans: state.plans.filter((plan) => plan.id !== id),
		}));
	},

	// Transaction actions
	addTransaction: async (transaction) => {
		// KII-132: entities snapshot taken before await — a concurrent entity
		// delete races into a DB write with stale validation. Re-validate after
		// the write, or push validation into the DB write itself.
		ensureValid(validateTransaction(transaction, get().entities));

		const txWithConfirm = {
			...transaction,
			is_confirmed: transaction.is_confirmed ?? defaultIsConfirmed(transaction.timestamp),
		};
		const stamped = await db.createTransaction(txWithConfirm);
		set((state) => ({ transactions: [stamped, ...state.transactions] }));
	},

	createTransactionBatch: async (transactions) => {
		if (transactions.length === 0) return;

		const entities = get().entities;
		// Validate every row before any DB write — fail fast so a bad row
		// rejects the whole batch instead of leaking a partial split (KII-116).
		const prepared: Transaction[] = transactions.map((tx) => {
			ensureValid(validateTransaction(tx, entities));
			return {
				...tx,
				is_confirmed: tx.is_confirmed ?? defaultIsConfirmed(tx.timestamp),
			};
		});

		const stamped = await db.createTransactionBatch(prepared);
		set((state) => ({ transactions: [...stamped, ...state.transactions] }));

		await scheduleNotificationsForTransactions(stamped, entities, set);
	},

	updateTransaction: async (id, updates) => {
		const state = get();
		const transaction = state.transactions.find((t) => t.id === id);
		if (!transaction) {
			console.warn(`Cannot update non-existent transaction: ${id}`);
			return;
		}

		ensureValid(validateUpdate(transaction, updates, state.entities));

		const stamped = await db.updateTransaction(id, updates);
		if (!stamped) return;
		set((state) => ({
			transactions: state.transactions.map((t) => (t.id === stamped.id ? stamped : t)),
		}));
	},

	deleteTransaction: async (id) => {
		const transaction = get().transactions.find((t) => t.id === id);
		if (transaction?.notification_id) {
			try {
				await cancelNotification(transaction.notification_id);
			} catch (e) {
				console.warn('Failed to cancel notification', e);
			}
		}
		await db.deleteTransaction(id);
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

		// Validate + default is_confirmed for each row, same shape as createTransactionBatch.
		const prepared: Transaction[] = rows.map((tx) => {
			ensureValid(validateTransaction(tx, state.entities));
			return {
				...tx,
				// Split children are never part of the parent series — strip unconditionally.
				series_id: undefined,
				is_confirmed: tx.is_confirmed ?? defaultIsConfirmed(tx.timestamp),
			};
		});

		// Cancel the original's scheduled notification (if any) BEFORE mutating the DB
		// so a system-side failure surfaces before we touch persistent state.
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

		const stamped = await db.replaceTransactionAtomic(originalId, prepared, {
			seriesExclusion,
		});

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
		const state = get();
		ensureValid(validateTransaction(transaction, state.entities));

		const template = buildRecurringTemplate({
			from_entity_id: transaction.from_entity_id,
			to_entity_id: transaction.to_entity_id,
			amount: transaction.amount,
			currency: transaction.currency,
			note: transaction.note ?? undefined,
			timestamp: transaction.timestamp,
			rule: recurrence.rule,
			endDate: recurrence.endDate,
			endCount: recurrence.endCount,
			horizon: recurrence.horizon,
		});
		const templateId = template.id;

		const stampedTemplate = await db.createRecurrenceTemplate(template);

		const occurrences = generateOccurrences({
			rule: recurrence.rule,
			startDate: transaction.timestamp,
			horizonDays: recurrence.horizon,
			now: Date.now(),
			endDate: recurrence.endDate,
			endCount: recurrence.endCount,
		});

		const now = Date.now();
		const txns: Transaction[] = occurrences.map((ts) =>
			buildTransaction(
				{
					from_entity_id: transaction.from_entity_id,
					to_entity_id: transaction.to_entity_id,
					amount: transaction.amount,
					currency: transaction.currency,
					timestamp: ts,
					note: transaction.note ?? undefined,
					series_id: templateId,
				},
				now
			)
		);

		const stampedTxns = txns.length > 0 ? await db.createTransactionBatch(txns) : [];
		set((state) => ({
			recurrenceTemplates: [...state.recurrenceTemplates, stampedTemplate],
			transactions:
				stampedTxns.length > 0
					? [...stampedTxns, ...state.transactions]
					: state.transactions,
		}));

		// Request permission on first recurring transaction (contextual ask)
		const remindersEnabled = await getRemindersEnabled();
		const hasAsked = await getHasRequestedPermission();
		if (remindersEnabled && !hasAsked) {
			const granted = await requestPermission();
			await setHasRequestedPermission(true);
			if (!granted) {
				await setRemindersEnabled(false);
			}
		}

		// Schedule notifications for future occurrences
		if (stampedTxns.length > 0) {
			await scheduleNotificationsForTransactions(stampedTxns, get().entities, set);
		}
	},

	// Roll the horizon window forward on app foreground. `generateOccurrences`
	// only materializes up to `now + horizonDays`, so without periodic re-runs
	// an "until further notice" recurrence silently stops producing rows after
	// the horizon elapses. Throttled to once per day (the smallest supported
	// frequency) so a foreground bounce doesn't thrash the DB.
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

		// scope === 'future': update template + all future transactions
		ensureValid(validateUpdate(transaction, updates, state.entities));

		const seriesId = transaction.series_id;
		const template = state.recurrenceTemplates.find((t) => t.id === seriesId);

		if (template) {
			const templateUpdates: Partial<RecurrenceTemplate> = {};
			if (updates.amount !== undefined) templateUpdates.amount = updates.amount;
			if (updates.from_entity_id !== undefined)
				templateUpdates.from_entity_id = updates.from_entity_id;
			if (updates.to_entity_id !== undefined)
				templateUpdates.to_entity_id = updates.to_entity_id;
			if (updates.note !== undefined) templateUpdates.note = updates.note;

			const stampedTemplate = await db.updateRecurrenceTemplate(seriesId, templateUpdates);
			const stampedTxns = await db.updateTransactionsBySeriesFuture(
				seriesId,
				transaction.timestamp,
				updates
			);
			const stampedTxnMap = new Map(stampedTxns.map((t) => [t.id, t]));
			set((state) => ({
				recurrenceTemplates: state.recurrenceTemplates.map((t) =>
					stampedTemplate && t.id === stampedTemplate.id
						? { ...stampedTemplate, exclusions: t.exclusions ?? [] }
						: t
				),
				transactions: state.transactions.map((t) => stampedTxnMap.get(t.id) ?? t),
			}));
		}
	},

	deleteTransactionWithScope: async (id, scope) => {
		const state = get();
		const transaction = state.transactions.find((t) => t.id === id);
		if (!transaction) return;

		if (scope === 'single' || !transaction.series_id) {
			if (transaction.notification_id) {
				try {
					await cancelNotification(transaction.notification_id);
				} catch (e) {
					console.warn('Failed to cancel notification', e);
				}
			}
			if (transaction.series_id) {
				// KII-123: delete + exclusion-insert in a single SQLite tx so a
				// crash between them can't strand the row (deleted) and the
				// exclusion (missing) — which would let backfillRecurrences
				// silently resurrect the occurrence on the next launch.
				const seriesId = transaction.series_id;
				const exclusionTs = transaction.timestamp;
				await db.deleteTransaction(id, {
					seriesExclusion: { templateId: seriesId, timestamp: exclusionTs },
				});
				set((state) => ({
					transactions: state.transactions.filter((t) => t.id !== id),
					recurrenceTemplates: state.recurrenceTemplates.map((t) => {
						if (t.id !== seriesId) return t;
						const existing = t.exclusions ?? [];
						if (existing.includes(exclusionTs)) return t;
						return { ...t, exclusions: [...existing, exclusionTs] };
					}),
				}));
			} else {
				await db.deleteTransaction(id);
				set((state) => ({
					transactions: state.transactions.filter((t) => t.id !== id),
				}));
			}
			return;
		}

		// scope === 'future'
		const seriesId = transaction.series_id;

		// Cancel notifications for all future transactions in this series
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

		await db.deleteTransactionsBySeriesFuture(seriesId, transaction.timestamp);

		const remaining = state.transactions.filter(
			(t) => t.series_id === seriesId && t.timestamp < transaction.timestamp
		);

		if (remaining.length === 0) {
			const stampedTemplate = await db.softDeleteRecurrenceTemplate(seriesId);
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
		} else {
			const lastRemaining = Math.max(...remaining.map((t) => t.timestamp));
			const stampedTemplate = await db.updateRecurrenceTemplate(seriesId, {
				end_date: lastRemaining,
			});
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
		}
	},

	deactivateTemplatesForEntity: async (entityId) => {
		const state = get();
		const now = Date.now();
		const templates = state.recurrenceTemplates.filter(
			(t) => !t.is_deleted && (t.from_entity_id === entityId || t.to_entity_id === entityId)
		);

		// Cancel notifications for future transactions being deleted
		if (templates.length > 0) {
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
		}

		const stampedTemplates: RecurrenceTemplate[] = [];
		for (const template of templates) {
			await db.deleteTransactionsBySeriesFuture(template.id, now);
			const stamped = await db.softDeleteRecurrenceTemplate(template.id);
			if (stamped) stampedTemplates.push(stamped);
		}

		if (templates.length > 0) {
			const templateIds = new Set(templates.map((t) => t.id));
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
		}
	},

	// Confirmation actions
	confirmTransaction: async (id) => {
		const transaction = get().transactions.find((t) => t.id === id);
		if (transaction?.notification_id) {
			try {
				await cancelNotification(transaction.notification_id);
			} catch (e) {
				console.warn('Failed to cancel notification', e);
			}
		}
		const stamped = await db.confirmTransaction(id);
		if (stamped) {
			set((state) => ({
				transactions: state.transactions.map((t) => (t.id === stamped.id ? stamped : t)),
			}));
		}
		await syncBadgeCount(get);
	},

	confirmAllDueTransactions: async () => {
		const now = Date.now();
		const dueTxs = get().transactions.filter(
			(t) => t.is_confirmed === false && t.timestamp <= now
		);
		if (dueTxs.length === 0) return;

		// Cancel notifications for transactions being confirmed
		for (const tx of dueTxs) {
			if (tx.notification_id) {
				try {
					await cancelNotification(tx.notification_id);
				} catch (e) {
					console.warn('Failed to cancel notification', e);
				}
			}
		}

		const dueIds = dueTxs.map((t) => t.id);
		const stamped = await db.confirmTransactionsBatch(dueIds);
		const stampedMap = new Map(stamped.map((t) => [t.id, t]));
		set((state) => ({
			transactions: state.transactions.map((t) => stampedMap.get(t.id) ?? t),
		}));
		await syncBadgeCount(get);
	},

	// Default account — atomic clear-and-set in a single DB transaction (KII-113).
	setDefaultAccount: async (accountId) => {
		const stamped = await db.setDefaultAccount(accountId);
		const stampedMap = new Map(stamped.map((e) => [e.id, e]));
		set((state) => ({
			entities: state.entities.map((e) => stampedMap.get(e.id) ?? e),
		}));
	},

	// Savings reservation — computes delta from current net and creates a transaction
	reserveToSaving: async (accountEntityId, savingEntityId, desiredTotal) => {
		const state = get();
		const account = state.entities.find((e) => e.id === accountEntityId);
		const saving = state.entities.find((e) => e.id === savingEntityId);
		if (!account || !saving) {
			throw new Error(
				`Cannot reserve with non-existent entities: account=${accountEntityId}, saving=${savingEntityId}`
			);
		}

		const currentNet = getReservationForPair(
			state.transactions,
			accountEntityId,
			savingEntityId
		);
		const delta = desiredTotal - currentNet;

		if (Math.abs(delta) < 0.005) return; // no meaningful change

		const transaction: Transaction = {
			id: generateId(),
			from_entity_id: delta > 0 ? accountEntityId : savingEntityId,
			to_entity_id: delta > 0 ? savingEntityId : accountEntityId,
			amount: roundMoney(Math.abs(delta), getCurrencyDecimalPlaces(account.currency)),
			currency: account.currency,
			timestamp: Date.now(),
		};

		// KII-132: same stale-entities-snapshot pattern as `addTransaction`.
		ensureValid(validateTransaction(transaction, state.entities));

		const stamped = await db.createTransaction(transaction);
		set((s) => ({ transactions: [stamped, ...s.transactions] }));
	},

	// Market value snapshot actions
	addMarketValueSnapshot: async (snapshot) => {
		const stamped = await db.createMarketValueSnapshot(snapshot);
		set((state) => ({
			marketValueSnapshots: [stamped, ...state.marketValueSnapshots],
		}));
	},

	updateMarketValueSnapshot: async (id, updates) => {
		const stamped = await db.updateMarketValueSnapshot(id, updates);
		if (!stamped) return;
		set((state) => ({
			marketValueSnapshots: state.marketValueSnapshots.map((s) =>
				s.id === stamped.id ? stamped : s
			),
		}));
	},

	deleteMarketValueSnapshot: async (id) => {
		await db.deleteMarketValueSnapshot(id);
		set((state) => ({
			marketValueSnapshots: state.marketValueSnapshots.filter((s) => s.id !== id),
		}));
	},

	deleteAllMarketValueSnapshots: async (entityId) => {
		await db.deleteAllMarketValueSnapshots(entityId);
		set((state) => ({
			marketValueSnapshots: state.marketValueSnapshots.filter(
				(s) => s.entity_id !== entityId
			),
		}));
	},
}));

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

	return filteredEntities.map((entity) => {
		// All plans use 'all-time' period - static budget/goal that applies every month
		const plan = plans.find((p) => p.entity_id === entity.id && p.period === 'all-time');
		const planned = plan?.planned_amount ?? 0;

		// Accounts and savings use all transactions (all-time balance)
		// Income and categories use current period only
		const useAllTime = entity.type === 'account' || entity.type === 'saving';
		const relevantTransactions = useAllTime
			? transactions
			: transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);

		// KII-132: `is_confirmed === undefined` is treated as confirmed here
		// (`!== false`) but as unconfirmed by the badge count (`=== false`).
		// Normalize to a non-optional boolean at the DB read boundary.
		// Split into confirmed past, unconfirmed past, and future
		const pastConfirmed = relevantTransactions.filter(
			(t) => t.timestamp <= now && t.is_confirmed !== false
		);
		const pastUnconfirmed = relevantTransactions.filter(
			(t) => t.timestamp <= now && t.is_confirmed === false
		);
		const futureTxns = relevantTransactions.filter(
			(t) => t.timestamp > now && t.timestamp <= end
		);

		// KII-132: `calcBalance` is redefined on every `.map()` iteration. Hoist
		// to module scope (or just above this function) to dodge the per-row
		// allocation.
		function calcBalance(
			txns: typeof relevantTransactions,
			entityId: string,
			type: Entity['type']
		): number {
			switch (type) {
				case 'account':
				case 'saving':
					// Both use net flow: incoming (+), outgoing (-)
					return txns
						.filter((t) => [t.from_entity_id, t.to_entity_id].includes(entityId))
						.reduce(
							(sum, t) =>
								t.from_entity_id === entityId ? sum - t.amount : sum + t.amount,
							0
						);
				case 'income':
					return txns
						.filter((t) => [t.from_entity_id, t.to_entity_id].includes(entityId))
						.reduce(
							(sum, t) =>
								t.from_entity_id === entityId ? sum + t.amount : sum - t.amount,
							0
						);
				case 'category':
					return txns
						.filter((t) => t.to_entity_id === entityId)
						.reduce((sum, t) => sum + t.amount, 0);
			}
		}

		const txActual = calcBalance(pastConfirmed, entity.id, entity.type);
		const upcoming = calcBalance(futureTxns, entity.id, entity.type);
		const unconfirmed = calcBalance(pastUnconfirmed, entity.id, entity.type);

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
				latestMarketValue = latest.amount;
			}
		}

		return {
			...entity,
			planned,
			actual: txActual,
			upcoming,
			unconfirmed,
			reserved,
			latestMarketValue,
			remaining: planned - txActual,
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
	const { entities, plans, transactions, currentPeriod, marketValueSnapshots } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
			transactions: state.transactions,
			currentPeriod: state.currentPeriod,
			marketValueSnapshots: state.marketValueSnapshots,
		}))
	);

	return useMemo(
		() =>
			getEntitiesWithBalance(
				entities,
				plans,
				transactions,
				currentPeriod,
				type,
				marketValueSnapshots
			),
		[entities, plans, transactions, currentPeriod, type, marketValueSnapshots]
	);
}
