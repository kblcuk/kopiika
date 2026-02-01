import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import type { Entity, EntityType, EntityWithBalance, Plan, Transaction } from '@/src/types';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import * as db from '@/src/db';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';

interface AppState {
	// Data
	entities: Entity[];
	plans: Plan[];
	transactions: Transaction[];

	// UI State
	currentPeriod: string;
	isLoading: boolean;
	draggedEntity: Entity | null;
	hoveredDropZoneId: string | null;
	incomeVisible: boolean;
	previewPositions: Map<string, { row: number; position: number }> | null;

	// Actions
	initialize: () => Promise<void>;
	setCurrentPeriod: (period: string) => void;
	setDraggedEntity: (entity: Entity | null) => void;
	setHoveredDropZoneId: (id: string | null) => void;
	toggleIncomeVisible: () => void;
	setPreviewPositions: (positions: Map<string, { row: number; position: number }> | null) => void;
	clearPreviewPositions: () => void;

	// Entity actions
	addEntity: (entity: Entity) => Promise<void>;
	updateEntity: (entity: Entity) => Promise<void>;
	deleteEntity: (id: string) => Promise<void>;
	reorderEntity: (sourceId: string, targetId: string) => Promise<void>;
	reorderEntitiesByIds: (
		type: EntityType,
		orderedIds: string[],
		maxRows: number
	) => Promise<void>;

	// Plan actions
	setPlan: (plan: Plan) => Promise<void>;

	// Transaction actions
	addTransaction: (transaction: Transaction) => Promise<void>;
	updateTransaction: (id: string, updates: Omit<Partial<Transaction>, 'id'>) => Promise<void>;
	deleteTransaction: (id: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
	// Initial state
	entities: [],
	plans: [],
	transactions: [],
	currentPeriod: getCurrentPeriod(),
	isLoading: true,
	draggedEntity: null,
	hoveredDropZoneId: null,
	incomeVisible: false,
	previewPositions: null,

	// Initialize from database
	initialize: async () => {
		set({ isLoading: true });
		try {
			console.info('Initializing store from database');
			const [entities, plans, transactions] = await Promise.all([
				db.getAllEntities(),
				db.getAllPlans(),
				db.getAllTransactions(),
			]);

			// Filter out orphaned plans that reference non-existent entities
			const entityIds = new Set(entities.map((e) => e.id));
			const validPlans = plans.filter((p) => entityIds.has(p.entity_id));

			set({ entities, plans: validPlans, transactions, isLoading: false });
		} catch (error) {
			console.error('Failed to initialize store:', error);
			set({ isLoading: false });
		}
	},

	setCurrentPeriod: (period) => set({ currentPeriod: period }),
	setDraggedEntity: (entity) => set({ draggedEntity: entity }),
	setHoveredDropZoneId: (id) => set({ hoveredDropZoneId: id }),
	toggleIncomeVisible: () => set((state) => ({ incomeVisible: !state.incomeVisible })),

	setPreviewPositions: (positions) => set({ previewPositions: positions }),
	clearPreviewPositions: () => set({ previewPositions: null }),

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
		if (!entity) {
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

	reorderEntity: async (sourceId, targetId) => {
		const state = get();
		const sourceEntity = state.entities.find((e) => e.id === sourceId);
		const targetEntity = state.entities.find((e) => e.id === targetId);

		if (!sourceEntity || !targetEntity || sourceEntity.type !== targetEntity.type) {
			return;
		}

		// Use moveEntity to move source to target's position
		await db.moveEntity(sourceId, targetEntity.row, targetEntity.position);

		// Reload entities to get updated positions
		const updatedEntities = await db.getAllEntities();
		set({ entities: updatedEntities });
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
			const entity = state.entities.find((e) => e.id === id);
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
		const entityExists = state.entities.some((e) => e.id === plan.entity_id);
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

	// Transaction actions
	addTransaction: async (transaction) => {
		// Validate that both entities exist before creating transaction
		const state = get();
		const fromExists = state.entities.some((e) => e.id === transaction.from_entity_id);
		const toExists = state.entities.some((e) => e.id === transaction.to_entity_id);
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
		const fromExists =
			finalFromId === BALANCE_ADJUSTMENT_ENTITY_ID ||
			state.entities.some((e) => e.id === finalFromId);
		const toExists = state.entities.some((e) => e.id === finalToId);

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
		.filter((e) => e.type === type && e.id !== BALANCE_ADJUSTMENT_ENTITY_ID)
		.sort((a, b) => a.row - b.row || a.position - b.position);

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

		let actual = 0;
		switch (entity.type) {
			case 'account':
				actual = relevantTransactions
					.filter((t) => [t.from_entity_id, t.to_entity_id].includes(entity.id))
					.reduce(
						(sum, t) =>
							t.from_entity_id === entity.id ? sum - t.amount : sum + t.amount,
						0
					);
				break;
			case 'income':
				actual = relevantTransactions
					.filter((t) => [t.from_entity_id, t.to_entity_id].includes(entity.id))
					.reduce(
						(sum, t) =>
							t.from_entity_id === entity.id ? sum + t.amount : sum - t.amount,
						0
					);
				break;
			case 'category':
			case 'saving':
				actual = relevantTransactions
					.filter((t) => t.to_entity_id === entity.id)
					.reduce((sum, t) => sum + t.amount, 0);
				break;
		}

		return {
			...entity,
			planned,
			actual,
			remaining: planned - actual,
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
