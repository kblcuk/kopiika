import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import type { Entity, EntityType, EntityWithBalance, Plan, Transaction } from '@/src/types';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import * as db from '@/src/db';
import * as schema from '@/src/db/drizzle-schema';
import { generateId } from '@/src/utils/ids';
import {
	BALANCE_ADJUSTMENT_ENTITY_ID,
	createBalanceAdjustmentEntity,
} from '@/src/constants/system-entities';
import { isEntityActive } from '@/src/utils/entity-display';
import {
	getReservationForPair,
	getTotalReservedForAccount,
} from '@/src/utils/savings-transactions';

interface AppState {
	// Data
	entities: Entity[];
	plans: Plan[];
	transactions: Transaction[];

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
		transactions: Transaction[]
	) => Promise<void>;
	setCurrentPeriod: (period: string) => void;
	setDraggedEntity: (entity: Entity | null) => void;
	toggleIncomeVisible: () => void;

	// Entity actions
	addEntity: (entity: Entity) => Promise<void>;
	updateEntity: (entity: Entity) => Promise<void>;
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
	updateTransaction: (id: string, updates: Omit<Partial<Transaction>, 'id'>) => Promise<void>;
	deleteTransaction: (id: string) => Promise<void>;

	// Default account — toggle the default flag; only one account at a time
	setDefaultAccount: (accountId: string | null) => Promise<void>;

	// Savings reservation action — creates account↔saving transactions to reach desiredTotal
	reserveToSaving: (
		accountEntityId: string,
		savingEntityId: string,
		desiredTotal: number
	) => Promise<void>;
}

let initializePromise: Promise<void> | null = null;

function getActiveEntities(entities: Entity[]): Entity[] {
	return entities.filter(isEntityActive);
}

function hasActiveEntity(entities: Entity[], id: string): boolean {
	return getActiveEntities(entities).some((entity) => entity.id === id);
}

export const useStore = create<AppState>((set, get) => ({
	// Initial state
	entities: [],
	plans: [],
	transactions: [],
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
				const [entities, plans, transactions] = await Promise.all([
					db.getAllEntities(),
					db.getAllPlans(),
					db.getAllTransactions(),
				]);

				// Ensure balance adjustment system entity exists (may be missing after data reset)
				if (!entities.some((e) => e.id === BALANCE_ADJUSTMENT_ENTITY_ID)) {
					const systemEntity = createBalanceAdjustmentEntity();
					await db.createEntity(systemEntity);
					entities.push(systemEntity);
				}

				// Filter out orphaned plans that reference non-existent entities
				const entityIds = new Set(entities.map((e) => e.id));
				const validPlans = plans.filter((p) => entityIds.has(p.entity_id));

				set({ entities, plans: validPlans, transactions, isLoading: false });
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
	replaceAllData: async (newEntities, newPlans, newTransactions) => {
		const drizzleDb = await db.getDrizzleDb();

		// Wrap in transaction so a mid-import failure doesn't leave an empty DB
		drizzleDb.transaction((tx) => {
			// Delete in FK-safe order: transactions → plans → entities
			tx.delete(schema.transactions).run();
			tx.delete(schema.plans).run();
			tx.delete(schema.entities).run();

			// Insert in FK-safe order: entities → plans → transactions
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
					})
					.run();
			}
			for (const plan of newPlans) {
				tx.insert(schema.plans).values(plan).run();
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
					})
					.run();
			}
		});

		// Re-read all data from DB into store state
		const [entities, plans, transactions] = await Promise.all([
			db.getAllEntities(),
			db.getAllPlans(),
			db.getAllTransactions(),
		]);
		set({ entities, plans, transactions });
	},

	setCurrentPeriod: (period) => set({ currentPeriod: period }),
	setDraggedEntity: (entity) => set({ draggedEntity: entity }),
	toggleIncomeVisible: () => set((state) => ({ incomeVisible: !state.incomeVisible })),

	// Entity actions
	addEntity: async (entity) => {
		await db.createEntity(entity);
		set((state) => ({ entities: [...state.entities, entity] }));
	},

	updateEntity: async (entity) => {
		await db.updateEntity(entity);
		set((state) => ({
			entities: state.entities.map((e) => (e.id === entity.id ? entity : e)),
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

		// Reload entities to get updated positions
		const updatedEntities = await db.getAllEntities();
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

		for (let i = 0; i < orderedIds.length; i++) {
			const id = orderedIds[i];
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

		// Batch update all positions
		await db.updateEntityPositions(updates);

		// Optimistically update local state immediately (no DB reload)
		set((state) => ({
			entities: state.entities.map((e) => {
				const update = updates.find((u) => u.id === e.id);
				return update ? { ...e, row: update.row, position: update.position } : e;
			}),
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

		await db.upsertPlan(plan);
		set((state) => {
			const existingIndex = state.plans.findIndex((p) => p.id === plan.id);
			if (existingIndex >= 0) {
				const newPlans = [...state.plans];
				newPlans[existingIndex] = plan;
				return { plans: newPlans };
			}
			return { plans: [...state.plans, plan] };
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
		// Validate that both entities exist before creating transaction
		const state = get();
		const fromExists = hasActiveEntity(state.entities, transaction.from_entity_id);
		const toExists = hasActiveEntity(state.entities, transaction.to_entity_id);
		if (!fromExists || !toExists) {
			console.warn(
				`Cannot create transaction with non-existent entities: from=${transaction.from_entity_id}, to=${transaction.to_entity_id}`
			);
			return;
		}

		await db.createTransaction(transaction);
		set((state) => ({ transactions: [transaction, ...state.transactions] }));
	},

	updateTransaction: async (id, updates) => {
		const state = get();
		const transaction = state.transactions.find((t) => t.id === id);
		if (!transaction) {
			console.warn(`Cannot update non-existent transaction: ${id}`);
			return;
		}

		// Determine final from/to entity IDs after update
		const finalFromId = updates.from_entity_id ?? transaction.from_entity_id;
		const finalToId = updates.to_entity_id ?? transaction.to_entity_id;

		// Prevent same entity on both sides
		if (finalFromId === finalToId) {
			console.warn('Cannot update transaction: from and to entities cannot be the same');
			return;
		}

		// Validate entities exist (allow BALANCE_ADJUSTMENT as special case)
		const fromEntity = state.entities.find((e) => e.id === finalFromId);
		const toEntity = state.entities.find((e) => e.id === finalToId);

		const fromExists =
			finalFromId === BALANCE_ADJUSTMENT_ENTITY_ID ||
			(fromEntity
				? !fromEntity.is_deleted || finalFromId === transaction.from_entity_id
				: false);
		const toExists = toEntity
			? !toEntity.is_deleted || finalToId === transaction.to_entity_id
			: false;

		if (!fromExists || !toExists) {
			console.warn(
				`Cannot update transaction with non-existent entities: from=${finalFromId}, to=${finalToId}`
			);
			return;
		}

		await db.updateTransaction(id, updates);
		set((state) => ({
			transactions: state.transactions.map((t) => (t.id === id ? { ...t, ...updates } : t)),
		}));
	},

	deleteTransaction: async (id) => {
		await db.deleteTransaction(id);
		set((state) => ({
			transactions: state.transactions.filter((t) => t.id !== id),
		}));
	},

	// Default account — clear old default and optionally set a new one
	setDefaultAccount: async (accountId) => {
		await db.clearDefaultAccount(accountId ?? undefined);
		if (accountId) {
			const entity = get().entities.find((e) => e.id === accountId);
			if (entity) await db.updateEntity({ ...entity, is_default: true });
		}
		set((state) => ({
			entities: state.entities.map((e) =>
				e.type === 'account' ? { ...e, is_default: e.id === accountId } : e
			),
		}));
	},

	// Savings reservation — computes delta from current net and creates a transaction
	reserveToSaving: async (accountEntityId, savingEntityId, desiredTotal) => {
		const state = get();
		const account = state.entities.find((e) => e.id === accountEntityId && !e.is_deleted);
		const saving = state.entities.find((e) => e.id === savingEntityId && !e.is_deleted);
		if (!account || !saving) {
			console.warn(
				`Cannot reserve with non-existent entities: account=${accountEntityId}, saving=${savingEntityId}`
			);
			return;
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
			amount: Math.abs(delta),
			currency: account.currency,
			timestamp: Date.now(),
		};

		await db.createTransaction(transaction);
		set((s) => ({ transactions: [transaction, ...s.transactions] }));
	},
}));

// Selectors - using useShallow and useMemo to prevent infinite loops

// Pure function to calculate balances for entities (testable without React)
export function getEntitiesWithBalance(
	entities: Entity[],
	plans: Plan[],
	transactions: Transaction[],
	currentPeriod: string,
	type: EntityType
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

		// Split into past (actual) and future (upcoming) by wall-clock time
		const pastTxns = relevantTransactions.filter((t) => t.timestamp <= now);
		const futureTxns = relevantTransactions.filter((t) => t.timestamp > now);

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

		const txActual = calcBalance(pastTxns, entity.id, entity.type);
		const upcoming = calcBalance(futureTxns, entity.id, entity.type);

		// Track how much of the account's outflows went to savings (for funding-section breakdown)
		// Since KII-61 savings are real transactions already reflected in actual
		const reserved =
			entity.type === 'account'
				? getTotalReservedForAccount(transactions, entities, entity.id)
				: 0;

		return {
			...entity,
			planned,
			actual: txActual,
			upcoming,
			reserved,
			remaining: planned - txActual,
		};
	});
}

// React hook that wraps the pure function
export function useEntitiesWithBalance(type: EntityType): EntityWithBalance[] {
	const { entities, plans, transactions, currentPeriod } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
			transactions: state.transactions,
			currentPeriod: state.currentPeriod,
		}))
	);

	return useMemo(
		() => getEntitiesWithBalance(entities, plans, transactions, currentPeriod, type),
		[entities, plans, transactions, currentPeriod, type]
	);
}
