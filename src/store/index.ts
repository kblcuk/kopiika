import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import type { Entity, EntityType, EntityWithBalance, Plan, Transaction } from '@/src/types';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import * as db from '@/src/db';

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

	// Actions
	initialize: () => Promise<void>;
	setCurrentPeriod: (period: string) => void;
	setDraggedEntity: (entity: Entity | null) => void;
	setHoveredDropZoneId: (id: string | null) => void;
	toggleIncomeVisible: () => void;

	// Entity actions
	addEntity: (entity: Entity) => Promise<void>;
	updateEntity: (entity: Entity) => Promise<void>;
	deleteEntity: (id: string) => Promise<void>;
	reorderEntity: (sourceId: string, targetId: string) => Promise<void>;

	// Plan actions
	setPlan: (plan: Plan) => Promise<void>;

	// Transaction actions
	addTransaction: (transaction: Transaction) => Promise<void>;
	updateTransaction: (
		id: string,
		updates: { amount?: number; note?: string; timestamp?: number }
	) => Promise<void>;
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

	// Initialize from database
	initialize: async () => {
		set({ isLoading: true });
		try {
			// Run migration for savings plans (idempotent - safe to run multiple times)
			await db.migrateSavingsPlansToAllTime();

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
		await db.deleteEntity(id);
		set((state) => ({
			entities: state.entities.filter((e) => e.id !== id),
			plans: state.plans.filter((p) => p.entity_id !== id),
		}));
	},

	reorderEntity: async (sourceId, targetId) => {
		const state = get();
		const sourceEntity = state.entities.find((e) => e.id === sourceId);
		const targetEntity = state.entities.find((e) => e.id === targetId);

		if (!sourceEntity || !targetEntity || sourceEntity.type !== targetEntity.type) {
			return;
		}

		// Get all entities of the same type, sorted by current order
		const sameTypeEntities = state.entities
			.filter((e) => e.type === sourceEntity.type)
			.sort((a, b) => a.order - b.order);

		// Remove source from current position
		const filtered = sameTypeEntities.filter((e) => e.id !== sourceId);

		// Find target index and insert source after it
		const targetIndex = filtered.findIndex((e) => e.id === targetId);
		const reordered = [
			...filtered.slice(0, targetIndex + 1),
			sourceEntity,
			...filtered.slice(targetIndex + 1),
		];

		// Calculate new order values and prepare updates
		const updates = reordered.map((entity, index) => ({
			id: entity.id,
			order: index,
		}));

		// Update database
		await db.updateEntityOrders(updates);

		// Update state
		set((state) => ({
			entities: state.entities.map((e) => {
				const update = updates.find((u) => u.id === e.id);
				return update ? { ...e, order: update.order } : e;
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
	const filteredEntities = entities
		.filter((e) => e.type === type)
		.sort((a, b) => a.order - b.order);

	return filteredEntities.map((entity) => {
		// Savings use 'all-time' period for plans, others use 'month' period with current period_start
		const plan =
			entity.type === 'saving'
				? plans.find((p) => p.entity_id === entity.id && p.period === 'all-time')
				: plans.find(
						(p) =>
							p.entity_id === entity.id &&
							p.period === 'month' &&
							p.period_start === currentPeriod
					);
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
