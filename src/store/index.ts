import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo, useRef } from 'react';
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
import {
	civilDateToTimestamp,
	generateOccurrences,
	occurrenceId,
	occurrenceSlotCivilDate,
	toCivilDate,
} from '@/src/utils/recurrence';
import { deriveVirtualOccurrences } from '@/src/utils/recurrence-derivation';
import { endOfLocalDay, isDue } from '@/src/utils/due';
import { markPerf } from '@/src/utils/perf-marks';
import { buildBalanceSeed, isSameEntitiesWithBalance } from './hydration-seed';
import {
	BALANCE_ADJUSTMENT_ENTITY_ID,
	createBalanceAdjustmentEntity,
} from '@/src/constants/system-entities';
import { getTotalReservedForAccount } from '@/src/utils/savings-transactions';
import { validateTransaction } from '@/src/utils/transaction-validation';
import { buildRecurringTemplate, buildTransaction } from '@/src/utils/transaction-builder';
import { applyOperation } from '@/src/sync/apply-operation';
import { resolveAppCurrency } from '@/src/utils/app-currency';
import { DEFAULT_CURRENCY } from '@/src/utils/format';
import {
	requestPermission,
	cancelNotification,
	cancelAllNotifications,
	updateBadgeCount,
} from '@/src/services/notifications';
import { syncScheduledReminders } from '@/src/services/reminders';
import {
	getRemindersEnabled,
	getHasRequestedPermission,
	setRemindersEnabled,
	setHasRequestedPermission,
	setScheduledReminderKey,
	getDefaultCurrency,
	setDefaultCurrency,
} from '@/src/utils/app-prefs';

interface AppState {
	// Data
	entities: Entity[];
	plans: Plan[];
	transactions: Transaction[];
	recurrenceTemplates: RecurrenceTemplate[];
	marketValueSnapshots: MarketValueSnapshot[];
	/** Synthetic (from,to,currency) sums of pre-period confirmed history; only
	 * useEntitiesWithBalance may consume these. Empty once fully hydrated. */
	balanceSeed: Transaction[];

	// UI State
	currentPeriod: string;
	isLoading: boolean;
	/** False between gate-open (phase 1) and full-table hydration (phase 2). */
	isFullyHydrated: boolean;
	draggedEntity: Entity | null;
	incomeVisible: boolean;
	// The single app-wide currency (KII-155). Derived from row data at hydration;
	// `setAppCurrency` relabels every row through the chokepoint.
	appCurrency: string;

	// Actions
	initialize: () => Promise<void>;
	/** Resolves when phase 2 + startup backfill have finished (immediately if
	 * initialize has not run — callers treat that as "nothing pending"). */
	whenFullyHydrated: () => Promise<void>;
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

	setAppCurrency: (code: string) => Promise<void>;

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

// KII-144: retained background promise for phase 2 + the startup recurrence
// backfill. `whenFullyHydrated` exposes it to callers that must wait for full
// hydration (the provider's reminder sweep, tests) without blocking gate-open.
let fullHydrationPromise: Promise<void> | null = null;

// Tracks the civil day `backfillRecurrences` last ran on, so a foreground bounce
// doesn't thrash the DB. Civil-day rather than a 24h window: with due-ness
// defined per calendar day (KII-159), a duration throttle that last fired at
// 23:00 would block materialization of today's occurrence until 23:00 tonight,
// and `deriveVirtualOccurrences` no longer emits it — the occurrence would
// vanish from every surface for a full day.
let lastBackfillCivilDate: string | null = null;

// Serializes `backfillRecurringIfStale` runs (KII-159). See the action for why
// overlapping runs are reachable and what they break. `.catch` applies to the
// chain, never to the promise returned to the caller.
let backfillChain: Promise<void> = Promise.resolve();

// Test-only: lets the test file reset the throttle between cases.
export function _resetBackfillThrottleForTests(): void {
	lastBackfillCivilDate = null;
}

/**
 * Rebuild the pending reminder set from current state (KII-159). Called after
 * every action that can change which occurrences are unconfirmed and not yet
 * due; the sweep itself is fingerprint-guarded, so a call that changes nothing
 * costs one pure computation and touches neither the OS nor the DB.
 *
 * Reminders alone are only correct for actions that leave `transactions`
 * unchanged (an entity rename, a virtual-occurrence exclusion). Anything that
 * adds, removes or re-dates a row wants `syncNotificationSurfaces` (KII-163).
 */
async function syncReminders(get: () => AppState): Promise<void> {
	try {
		const state = get();
		await syncScheduledReminders(state.recurrenceTemplates, state.transactions, state.entities);
	} catch (e) {
		console.warn('Failed to sync reminders', e);
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

/**
 * The two notification surfaces that must agree after anything that changes
 * which occurrences are unconfirmed-and-due: the OS app-icon badge and the
 * pending reminder set (KII-159). They are refreshed together because they read
 * the same state — a caller that remembers one and forgets the other leaves the
 * badge stale until the next confirm, cold start, or hourly background task,
 * which is exactly how the midnight backfill lost its badge update.
 */
async function syncNotificationSurfaces(get: () => AppState): Promise<void> {
	await syncBadgeCount(get);
	await syncReminders(get);
}

/**
 * The timestamp to record a series exclusion under when a materialized
 * occurrence is deleted or split. Keyed to the occurrence's SLOT (read from its
 * deterministic id) rather than its current timestamp, so an occurrence whose
 * date the user edited still excludes the slot it was generated for. Without
 * this, deleting a date-edited occurrence records the exclusion against the
 * dragged date and `backfillRecurrences` resurrects the original slot on the
 * next launch. Legacy random-id rows fall back to their timestamp (their slot is
 * only knowable that way). Exclusions match by civil date, so the exact
 * time-of-day of the returned timestamp is irrelevant.
 */
function seriesExclusionTimestamp(transaction: Transaction): number {
	const seriesId = transaction.series_id;
	if (!seriesId) return transaction.timestamp;
	const slot = occurrenceSlotCivilDate(transaction.id, seriesId);
	return slot ? civilDateToTimestamp(slot) : transaction.timestamp;
}

async function backfillRecurrences(
	templates: RecurrenceTemplate[],
	existingTransactions: Transaction[],
	entities: Entity[],
	set: (fn: (state: AppState) => Partial<AppState>) => void
): Promise<void> {
	const now = Date.now();
	const newTransactions: Transaction[] = [];

	// Hard primary-key backstop: the materialized-row id is deterministic
	// (`${series}:${civil}`), so an id that already exists must never be
	// regenerated — the INSERT would fail on the PK. This catches the case the
	// per-series slot guard below cannot: a row whose id is `${series}:${C}` but
	// whose `series_id` was detached (so it no longer joins this series), yet
	// still carries that id.
	const existingIds = new Set(existingTransactions.map((t) => t.id));

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

		// Materialize every occurrence that is DUE — i.e. dated today or earlier
		// (KII-159). `generateOccurrences` is bounded by an instant, so pass the
		// last millisecond of today as `now`; `horizonDays: 0` keeps the bound
		// exactly there. Occurrences not yet due stay virtual.
		const dueTimestamps = generateOccurrences({
			rule,
			startDate: template.start_date,
			horizonDays: 0,
			now: endOfLocalDay(now),
			endDate: template.end_date,
			endCount: template.end_count,
			exclusions: template.exclusions,
		});

		// Which occurrence SLOTS this series already occupies. A materialized row's
		// slot is read from its deterministic id (stable under date edits), falling
		// back to `toCivilDate(timestamp)` for legacy random-id rows whose slot is
		// only knowable that way. Keying on the slot (not the row's current civil
		// date) stops an edited row from either resurrecting its original slot or
		// shadowing a different slot it happened to be dragged onto.
		const existingSlots = new Set(
			existingTransactions
				.filter((t) => t.series_id === template.id)
				.map((t) => occurrenceSlotCivilDate(t.id, template.id) ?? toCivilDate(t.timestamp))
		);

		for (const ts of dueTimestamps) {
			const civil = toCivilDate(ts);
			const id = occurrenceId(template.id, civil);
			if (existingSlots.has(civil) || existingIds.has(id)) continue;
			newTransactions.push(
				buildTransaction(
					{
						id,
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
		// No reminder sweep here: this helper has no access to `get`, and every
		// caller sweeps after it — `addRecurringTransaction` and
		// `backfillRecurringIfStale` directly, `initialize` via the provider's
		// startup sweep (KII-159).
	}
}

/**
 * Phase 2 of hydration (KII-144): replace the phase-1 partial rows + seed
 * with the full transaction table, then run the startup recurrence backfill
 * through the shared `backfillChain` (it must see full history — its slot
 * dedup would otherwise regenerate pre-period occurrences; and it must
 * serialize with `backfillRecurringIfStale`, since the gate is already open
 * by the time this runs — see the comment at the `backfillChain` assignment
 * below). Never throws: if the full-table swap fails twice, phase-1 state
 * (correct, current-period-scoped) is kept and the error is logged; if the
 * swap succeeds but the backfill fails, that failure is logged separately —
 * "keeping phase-1 state" would be wrong once `isFullyHydrated` is true.
 *
 * Legacy materialized future occurrences are removed by migration 0021 (runs
 * before hydration), so the rows loaded here are already free of phantom
 * future rows.
 */
async function completePhase2(
	set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
	get: () => AppState
): Promise<void> {
	const swapInFullTable = async (): Promise<void> => {
		for (;;) {
			// Every transaction mutation replaces the array, so its identity is a
			// free mutation epoch: if it changed while the read was in flight, a
			// write landed (all writers hit the DB before set) — re-read.
			const snapshot = get().transactions;
			const full = await db.getAllTransactions();
			if (get().transactions === snapshot) {
				markPerf('hydrate:phase2', `${full.length} rows`);
				set({ transactions: full, balanceSeed: [], isFullyHydrated: true });
				return;
			}
		}
	};

	try {
		await swapInFullTable();
	} catch (firstError) {
		console.warn('Phase-2 hydration failed, retrying once:', firstError);
		try {
			await swapInFullTable();
		} catch (secondError) {
			// The swap never landed — phase-1 state (correct, current-period-scoped)
			// stays in place. Distinct from the backfill's error log below: once the
			// swap has succeeded, "keeping phase-1 state" would be a lie.
			console.error('Phase-2 hydration failed; keeping phase-1 state:', secondError);
			return;
		}
	}

	// The swap landed (isFullyHydrated is true). Route the startup backfill
	// through `backfillChain` — the same serialization `backfillRecurringIfStale`
	// uses (KII-159) — because the gate is already open at this point (phase 1
	// resolved `initialize()`), so the foreground listener can invoke
	// `backfillRecurringIfStale` concurrently with this backfill. Without a
	// shared chain both would compute the same deterministic occurrence ids
	// independently and collide on insert (the exact PK-collision failure
	// `backfillChain` exists to prevent). `.catch` applies to the chain, never
	// to this function.
	backfillChain = backfillChain
		.catch(() => {})
		.then(async () => {
			try {
				await backfillRecurrences(
					get().recurrenceTemplates,
					get().transactions,
					get().entities,
					set
				);
				lastBackfillCivilDate = toCivilDate(Date.now());
			} catch (error) {
				console.error('Startup recurrence backfill failed:', error);
			}
		});
	await backfillChain;
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
		balanceSeed: [],
		currentPeriod: getCurrentPeriod(),
		isLoading: true,
		isFullyHydrated: false,
		draggedEntity: null,
		incomeVisible: false,
		appCurrency: DEFAULT_CURRENCY,

		// Initialize from database
		initialize: async () => {
			if (initializePromise) {
				return initializePromise;
			}

			initializePromise = (async () => {
				// KII-144: clear both synchronously, before the first await, so a
				// re-initialize (e.g. replaceAllData's reset-then-rehydrate flow)
				// never leaves `isFullyHydrated`/`whenFullyHydrated()` pointing at the
				// PREVIOUS run between now and phase 1's `set` below — a caller that
				// reads either in that window must see "hydration is in progress",
				// not stale prior-run state.
				fullHydrationPromise = null;
				set({ isLoading: true, isFullyHydrated: false });
				try {
					console.info('Hydrating store from database');
					// KII-144: phase 1 loads everything derivation inspects row-by-row
					// (current period, unconfirmed, series rows) plus (from,to,currency)
					// sums of the confirmed pre-period rest. The gate opens on this —
					// balances are exact by linearity — and phase 2 streams the full
					// table in the background.
					const periodStart = getPeriodRange(get().currentPeriod).start;
					const [
						entities,
						plans,
						recentTransactions,
						seedGroups,
						rawTemplates,
						marketValueSnapshots,
						exclusionsByTemplate,
						currencyPref,
					] = await Promise.all([
						db.getAllEntities(),
						db.getAllPlans(),
						db.getTransactionsSince(periodStart),
						db.getBalanceSeedGroups(periodStart),
						db.getAllRecurrenceTemplates(),
						db.getAllMarketValueSnapshots(),
						db.getAllExclusionsByTemplate(),
						getDefaultCurrency(),
					]);
					markPerf(
						'hydrate:phase1',
						`${recentTransactions.length} rows + ${seedGroups.length} seed groups`
					);
					// KII-123: attach exclusions from the normalized table. Templates
					// without any exclusions get an empty array so consumers never
					// need to null-check.
					const recurrenceTemplates: RecurrenceTemplate[] = rawTemplates.map((t) => ({
						...t,
						exclusions: exclusionsByTemplate.get(t.id) ?? [],
					}));

					// The app currency comes from the row data; the pref only seeds the
					// window before any user entity exists (KII-155). Resolve it before
					// creating the system entity so a post-reset re-create doesn't
					// reintroduce EUR into a non-EUR board.
					const appCurrency = resolveAppCurrency(entities, currencyPref);

					// Ensure balance adjustment system entity exists (may be missing after data reset)
					if (!entities.some((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID)) {
						const systemEntity = createBalanceAdjustmentEntity(appCurrency);
						await db.createEntity(systemEntity);
						entities.push(systemEntity);
					}

					// Filter out orphaned plans that reference non-existent entities
					const entityIds = new Set(entities.map((e) => e.id));
					const validPlans = plans.filter((p) => entityIds.has(p.entity_id));

					set({
						entities,
						plans: validPlans,
						transactions: recentTransactions,
						balanceSeed: buildBalanceSeed(seedGroups, periodStart),
						recurrenceTemplates,
						marketValueSnapshots,
						appCurrency,
						isLoading: false,
						isFullyHydrated: false,
					});

					// Phase 2 + startup backfill continue past the gate; whenFullyHydrated
					// exposes completion to the provider's reminder sweep and tests.
					fullHydrationPromise = completePhase2(set, get);
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

		whenFullyHydrated: () => fullHydrationPromise ?? Promise.resolve(),

		// Replace all data atomically — used by CSV import.
		replaceAllData: async (
			newEntities,
			newPlans,
			newTransactions,
			newRecurrenceTemplates,
			newMarketValueSnapshots = []
		) => {
			// Cancel all scheduled notifications before replacing data —
			// side effect, local only by construction. Clearing the reminder
			// fingerprint first is what makes the sweep below unconditional: the OS
			// schedule is about to be emptied, so a re-import of the same data
			// (identical fingerprint) must not short-circuit and leave it empty
			// (KII-159).
			try {
				await setScheduledReminderKey(null);
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
			// The imported CSV replaces every currency-carrying row, so the
			// app-wide currency must be recomputed here — `initialize()` only
			// runs at cold start or after a data reset, neither of which this
			// path triggers. Leaving `appCurrency` stale would misrender
			// aggregate amounts and let `EntityCreateModal` create the next
			// entity in the old currency, which `transaction-validation.ts`
			// would then reject as a CURRENCY_MISMATCH (KII-155).
			const importedCurrency = resolveAppCurrency(result.entities, get().appCurrency);
			set({
				entities: result.entities,
				plans: result.plans,
				transactions: result.transactions,
				recurrenceTemplates: result.recurrenceTemplates,
				marketValueSnapshots: result.marketValueSnapshots,
				appCurrency: importedCurrency,
				balanceSeed: [],
				isFullyHydrated: true,
			});
			await setDefaultCurrency(importedCurrency);
			// Materialize the imported templates' due occurrences, exactly as
			// `initialize` does after hydration (KII-159). Without this the import is
			// the one path that leaves them nowhere: derivation skips occurrences that
			// are due, no row exists for them yet, and the civil-day throttle is
			// already stamped with today by `initialize`, so the next
			// `backfillRecurringIfStale()` short-circuits and the gap survives until a
			// cold start. Re-stamping the throttle keeps the invariant that it names
			// the civil day the last backfill actually ran on.
			try {
				await backfillRecurrences(
					result.recurrenceTemplates,
					result.transactions,
					result.entities,
					set
				);
				lastBackfillCivilDate = toCivilDate(Date.now());
			} catch (e) {
				// The import itself already committed; reporting it as failed would be
				// a lie ("your previous data should be intact"). Clear the throttle
				// instead so the next foreground or midnight run retries.
				console.warn('Failed to backfill imported recurrences', e);
				lastBackfillCivilDate = null;
			}
			// Badge included: the pre-import `updateBadgeCount(0)` describes the wiped
			// database, not the imported one, which can carry due unconfirmed rows.
			await syncNotificationSurfaces(get);
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
			// A rename changes the body of every reminder that names this entity
			// (`${fromName} → ${toName}: ${amount}`), so the sweep has to run even
			// though the set of occurrences is unchanged (KII-159).
			await syncReminders(get);
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
			// Same `entity.update` op as `updateEntity`, so a rename can arrive
			// through here too.
			await syncReminders(get);
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
			// Badge included (KII-163): `buildTransaction` defaults a future
			// timestamp to unconfirmed, and "later today" is future yet already due,
			// so a plain add can raise the unconfirmed-and-due count.
			await syncNotificationSurfaces(get);
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
			// No reminder sweep: the real row carries the virtual occurrence's own
			// deterministic id and timestamp, and derivation dedups on that slot, so
			// the reminder set is identical before and after — within
			// `reminder-schedule.ts`'s derivation horizon, which is the only range
			// virtual occurrences come from (real unconfirmed rows are unbounded,
			// so a narrower horizon would make materialization additive). The action
			// that follows materialization (edit/delete/confirm) sweeps (KII-159).
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
			// The excluded occurrence was (by definition) still upcoming, so it was
			// in the pending reminder set — drop its reminder (KII-159). Reminders
			// only: the badge counts real rows, and a virtual occurrence has none, so
			// `transactions` — and therefore the count — is untouched here (KII-163).
			await syncReminders(get);
		},

		createTransactionBatch: async (transactions) => {
			if (transactions.length === 0) return;

			const result = await applyOperation(
				{ kind: 'transaction.batch_create', transactions },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'transaction.batch_create') return;
			set((state) => ({ transactions: [...result.created, ...state.transactions] }));

			// Side effect — local only by construction (inbound ops call applyOperation
			// directly and never reach this store action). Badge included (KII-163):
			// a batch can carry unconfirmed rows that are already due (later today,
			// or an import row with `is_confirmed: false` in the past).
			await syncNotificationSurfaces(get);
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
			// A date edit moves the occurrence's reminder instant (KII-159) and can
			// carry it across the due boundary in either direction — as can an
			// `is_confirmed` edit — so the badge moves with it (KII-163).
			await syncNotificationSurfaces(get);
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
			// Deleting a due unconfirmed row lowers the count (KII-163).
			await syncNotificationSurfaces(get);
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
				? {
						templateId: original.series_id,
						timestamp: seriesExclusionTimestamp(original),
					}
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

			// One due unconfirmed row leaves and N rows arrive, each with its own
			// date and confirmation state — the count rarely survives a split (KII-163).
			await syncNotificationSurfaces(get);
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

			// After the contextual ask, not before: on the very first recurring
			// transaction the sweep would otherwise schedule without permission,
			// then persist a fingerprint claiming those reminders exist (KII-159).
			// Badge included (KII-163): the backfill above materializes every
			// past-due occurrence of the new series as an unconfirmed due row.
			await syncNotificationSurfaces(get);
		},

		// Materialize past-due occurrences since the last run. Because
		// backfillRecurrences bounds generateOccurrences at end-of-today
		// (KII-159), no future phantom rows are written (future occurrences are
		// derived on demand). Throttled to once per civil day (the shortest
		// recurrence period) so an app foreground bounce doesn't thrash the DB.
		backfillRecurringIfStale: async () => {
			// KII-144: phase-1 state lacks pre-period occurrence rows; running the
			// slot-dedup against it would regenerate them. Startup backfill is owned
			// by completePhase2; this staleness path waits for full hydration.
			if (!get().isFullyHydrated) return;

			// Serialized (KII-159): both call sites dispatch with `void` — the
			// foreground listener and the midnight timer — and the civil-date guard
			// below is only set AFTER the await, so two overlapping entries both pass
			// it, both generate the same deterministic occurrence ids, and the second
			// batch-create dies on the primary key with nobody to catch it.
			backfillChain = backfillChain
				.catch(() => {})
				.then(async () => {
					const today = toCivilDate(Date.now());
					if (lastBackfillCivilDate === today) return;
					const state = get();
					await backfillRecurrences(
						state.recurrenceTemplates,
						state.transactions,
						state.entities,
						set
					);
					lastBackfillCivilDate = today;
					// The civil day rolled over: yesterday's upcoming occurrences are
					// now due and materialized, so they must drop out of the pending
					// reminder set — and, being unconfirmed and due, they also raise
					// the badge count.
					await syncNotificationSurfaces(get);
				});
			return backfillChain;
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
			// Single scope returned above, having synced via `updateTransaction`. A
			// scoped date edit crosses the due boundary the same way (KII-163).
			await syncNotificationSurfaces(get);
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
					? {
							templateId: transaction.series_id,
							timestamp: seriesExclusionTimestamp(transaction),
						}
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
				// Deleting a due unconfirmed occurrence lowers the count (KII-163).
				await syncNotificationSurfaces(get);
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
			// "Future" is anchored on the tapped row, which can itself be past-due —
			// so this can drop several unconfirmed due rows at once (KII-163).
			await syncNotificationSurfaces(get);
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
			// Rows from `now` onward go, and anything left today is still due, so the
			// count can drop even though nothing strictly in the past is touched (KII-163).
			await syncNotificationSurfaces(get);
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
			// Confirming an occurrence EARLY (before its due day) takes it out of the
			// pending set, so its reminder has to go with it (KII-159).
			await syncNotificationSurfaces(get);
		},

		confirmAllDueTransactions: async () => {
			const now = Date.now();
			const dueTxs = get().transactions.filter(
				(t) => t.is_confirmed === false && isDue(t.timestamp, now)
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
			await syncNotificationSurfaces(get);
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

		// KII-155: single app-wide currency. Relabels every row through the
		// chokepoint (currency is a shared field, so this must not bypass
		// applyOperation) and records the choice in prefs so a later data reset
		// starts from the user's currency rather than EUR.
		setAppCurrency: async (code) => {
			const result = await applyOperation(
				{ kind: 'currency.set_all', currency: code },
				'local',
				buildApplyContext()
			);
			if (result.kind !== 'currency.set_all') return;
			set({
				appCurrency: code,
				entities: result.entities,
				transactions: result.transactions,
				recurrenceTemplates: result.recurrenceTemplates,
				marketValueSnapshots: result.marketValueSnapshots,
			});
			await setDefaultCurrency(code);
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
		if (!isDue(t.timestamp, now)) {
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
	return transactions.filter((t) => t.is_confirmed === false && isDue(t.timestamp, now)).length;
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
		balanceSeed,
		currentPeriod,
		marketValueSnapshots,
		recurrenceTemplates,
	} = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
			transactions: state.transactions,
			balanceSeed: state.balanceSeed,
			currentPeriod: state.currentPeriod,
			marketValueSnapshots: state.marketValueSnapshots,
			recurrenceTemplates: state.recurrenceTemplates,
		}))
	);

	const derived = useMemo(() => {
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
			[...transactions, ...balanceSeed, ...virtual],
			currentPeriod,
			type,
			marketValueSnapshots
		);
	}, [
		entities,
		plans,
		transactions,
		balanceSeed,
		currentPeriod,
		type,
		marketValueSnapshots,
		recurrenceTemplates,
	]);

	// KII-144: the phase-2 swap replaces the seed with real rows deriving the
	// same values; returning the previous identity keeps the memoized bubbles
	// (and Sortable.Grid) from recommitting the whole board post-paint.
	const prevRef = useRef<EntityWithBalance[] | null>(null);
	if (prevRef.current !== null && isSameEntitiesWithBalance(prevRef.current, derived)) {
		return prevRef.current;
	}
	prevRef.current = derived;
	return derived;
}
