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

	// Actions
	initialize: () => Promise<void>;
	setCurrentPeriod: (period: string) => void;
	setDraggedEntity: (entity: Entity | null) => void;
	setHoveredDropZoneId: (id: string | null) => void;

	// Entity actions
	addEntity: (entity: Entity) => Promise<void>;
	updateEntity: (entity: Entity) => Promise<void>;
	deleteEntity: (id: string) => Promise<void>;

	// Plan actions
	setPlan: (plan: Plan) => Promise<void>;

	// Transaction actions
	addTransaction: (transaction: Transaction) => Promise<void>;
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

	// Initialize from database
	initialize: async () => {
		set({ isLoading: true });
		try {
			const [entities, plans, transactions] = await Promise.all([
				db.getAllEntities(),
				db.getAllPlans(),
				db.getAllTransactions(),
			]);
			set({ entities, plans, transactions, isLoading: false });
		} catch (error) {
			console.error('Failed to initialize store:', error);
			set({ isLoading: false });
		}
	},

	setCurrentPeriod: (period) => set({ currentPeriod: period }),
	setDraggedEntity: (entity) => set({ draggedEntity: entity }),
	setHoveredDropZoneId: (id) => set({ hoveredDropZoneId: id }),

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

	// Plan actions
	setPlan: async (plan) => {
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
		await db.createTransaction(transaction);
		set((state) => ({ transactions: [transaction, ...state.transactions] }));
	},

	deleteTransaction: async (id) => {
		await db.deleteTransaction(id);
		set((state) => ({
			transactions: state.transactions.filter((t) => t.id !== id),
		}));
	},
}));

// Selectors - using useShallow and useMemo to prevent infinite loops

export function useEntitiesWithBalance(type: EntityType): EntityWithBalance[] {
	const { entities, plans, transactions, currentPeriod } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
			transactions: state.transactions,
			currentPeriod: state.currentPeriod,
		}))
	);

	return useMemo(() => {
		const { start, end } = getPeriodRange(currentPeriod);
		const filteredEntities = entities
			.filter((e) => e.type === type)
			.sort((a, b) => a.order - b.order);

		return filteredEntities.map((entity) => {
			const plan = plans.find(
				(p) => p.entity_id === entity.id && p.period_start === currentPeriod
			);
			const planned = plan?.planned_amount ?? 0;

			const periodTransactions = transactions.filter(
				(t) => t.timestamp >= start && t.timestamp <= end
			);

			let actual = 0;
			switch (entity.type) {
				case 'account':
					actual = periodTransactions
						.filter((t) => [t.from_entity_id, t.to_entity_id].includes(entity.id))
						.reduce(
							(sum, t) =>
								t.from_entity_id === entity.id ? sum + t.amount : sum - t.amount,
							0
						);
					break;
				case 'income':
					actual = periodTransactions
						.filter((t) => [t.from_entity_id, t.to_entity_id].includes(entity.id))
						.reduce(
							(sum, t) =>
								t.from_entity_id === entity.id ? sum + t.amount : sum - t.amount,
							0
						);
					break;
				case 'category':
				case 'saving':
					actual = periodTransactions
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
	}, [entities, plans, transactions, currentPeriod, type]);
}

// Utility for generating IDs
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
