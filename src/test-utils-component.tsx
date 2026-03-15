import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from '@/src/store';
import type { Entity, Plan, Transaction } from '@/src/types';

/**
 * Setup store state for component tests
 */
export function setupStoreForTest({
	entities = [],
	plans = [],
	transactions = [],
	currentPeriod = '2026-01',
}: {
	entities?: Entity[];
	plans?: Plan[];
	transactions?: Transaction[];
	currentPeriod?: string;
} = {}) {
	useStore.setState({
		entities,
		plans,
		transactions,
		currentPeriod,
		isLoading: false,
		draggedEntity: null,
		incomeVisible: false,
	});
}

/**
 * Custom render function that sets up the store with optional initial data
 */
export function renderWithStore(
	ui: React.ReactElement,
	storeState?: Parameters<typeof setupStoreForTest>[0],
	renderOptions?: Omit<RenderOptions, 'wrapper'>
) {
	if (storeState) {
		setupStoreForTest(storeState);
	}
	return render(<SafeAreaProvider>{ui}</SafeAreaProvider>, renderOptions);
}

/**
 * Factory function to create mock entities
 */
export function createMockEntity(
	overrides: Partial<Entity> & { id: string; type: Entity['type'] }
): Entity {
	return {
		name: `Test ${overrides.type}`,
		currency: 'USD',
		order: 0,
		row: 0,
		position: 0,
		...overrides,
	};
}

/**
 * Factory function to create mock plans
 */
export function createMockPlan(overrides: Partial<Plan> & { id: string; entity_id: string }): Plan {
	return {
		period: 'all-time',
		period_start: '2026-01',
		planned_amount: 1000,
		...overrides,
	};
}

/**
 * Factory function to create mock transactions
 */
export function createMockTransaction(
	overrides: Partial<Transaction> & { id: string; from_entity_id: string; to_entity_id: string }
): Transaction {
	return {
		amount: 100,
		currency: 'USD',
		timestamp: Date.now(),
		...overrides,
	};
}
