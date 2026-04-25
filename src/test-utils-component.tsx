import { useStore } from '@/src/store';
import type { Entity, Plan, Transaction, MarketValueSnapshot } from '@/src/types';

/**
 * Setup store state for component tests
 */
export function setupStoreForTest({
	entities = [],
	plans = [],
	transactions = [],
	marketValueSnapshots = [],
	currentPeriod = '2026-01',
}: {
	entities?: Entity[];
	plans?: Plan[];
	transactions?: Transaction[];
	marketValueSnapshots?: MarketValueSnapshot[];
	currentPeriod?: string;
} = {}) {
	useStore.setState({
		entities,
		plans,
		transactions,
		marketValueSnapshots,
		currentPeriod,
		isLoading: false,
		draggedEntity: null,
		incomeVisible: false,
	});
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
