import { renderHook, act } from '@testing-library/react-native';
import type { Entity, Transaction } from '@/src/types';
import { useStore, useEntitiesWithBalance } from '@/src/store';
import { buildBalanceSeed } from '@/src/store/hydration-seed';

const account: Entity = {
	id: 'acc-1',
	type: 'account',
	name: 'Checking',
	currency: 'EUR',
	row: 0,
	position: 0,
};
const category: Entity = {
	id: 'cat-1',
	type: 'category',
	name: 'Food',
	currency: 'EUR',
	row: 0,
	position: 0,
};

const recentRow: Transaction = {
	id: 'recent-1',
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount_minor: 50,
	currency: 'EUR',
	timestamp: Date.now() - 1000,
	note: null,
	is_confirmed: true,
};

// The full-history rows phase 2 would swap in: two old rows summing to the
// same 500 the seed group carries.
const oldRows: Transaction[] = [300, 200].map((amount, i) => ({
	id: `old-${i}`,
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount_minor: amount,
	currency: 'EUR',
	timestamp: Date.now() - 90 * 86_400_000,
	note: null,
	is_confirmed: true,
}));

const seed = buildBalanceSeed(
	[{ from_entity_id: 'acc-1', to_entity_id: 'cat-1', currency: 'EUR', total_minor: 500 }],
	Date.now() - 30 * 86_400_000
);

describe('useEntitiesWithBalance with a balance seed (KII-144)', () => {
	beforeEach(() => {
		useStore.setState({
			entities: [account, category],
			plans: [],
			transactions: [recentRow],
			balanceSeed: seed,
			recurrenceTemplates: [],
			marketValueSnapshots: [],
			isFullyHydrated: false,
		});
	});

	it('includes seed rows in derived balances', () => {
		const { result } = renderHook(() => useEntitiesWithBalance('account'));
		const checking = result.current.find((e) => e.id === 'acc-1');
		expect(checking?.actual).toBe(-550); // -500 seeded - 50 recent outflow
	});

	it('keeps the previous array identity across a value-equal phase-2 swap', () => {
		const { result, rerender } = renderHook(() => useEntitiesWithBalance('account'));
		const before = result.current;
		act(() => {
			useStore.setState({
				transactions: [recentRow, ...oldRows],
				balanceSeed: [],
				isFullyHydrated: true,
			});
		});
		rerender(undefined);
		expect(result.current).toBe(before);
	});

	it('returns a new result when the swap changes values', () => {
		const { result, rerender } = renderHook(() => useEntitiesWithBalance('account'));
		const before = result.current;
		act(() => {
			useStore.setState({
				transactions: [
					recentRow,
					...oldRows,
					{ ...recentRow, id: 'extra', amount_minor: 5 },
				],
				balanceSeed: [],
				isFullyHydrated: true,
			});
		});
		rerender(undefined);
		expect(result.current).not.toBe(before);
		expect(result.current.find((e) => e.id === 'acc-1')?.actual).toBe(-555);
	});
});
