import { renderHook } from '@testing-library/react-native';
import { useSummary } from '../summary-header';
import { useStore } from '@/src/store';
import type { Entity, Plan, Transaction } from '@/src/types';

describe('useSummary', () => {
	const mockIncome: Entity = {
		id: 'income-1',
		type: 'income',
		name: 'Salary',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
	};

	const mockAccount: Entity = {
		id: 'account-1',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
	};

	const mockAccount2: Entity = {
		id: 'account-2',
		type: 'account',
		name: 'Savings',
		currency: 'USD',
		row: 0,
		position: 1,
		order: 1,
	};

	const mockCategory: Entity = {
		id: 'category-1',
		type: 'category',
		name: 'Groceries',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
	};

	const currentPeriod = '2026-01';
	const periodStart = new Date('2026-01-01T00:00:00').getTime();

	beforeEach(() => {
		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			currentPeriod,
			isLoading: false,
			draggedEntity: null,
			hoveredDropZoneId: null,
			incomeVisible: false,
			previewPositions: null,
		});
	});

	it('should include income-to-account transfers in balance', () => {
		// This is the bug we fixed: income → account should increase balance
		const incomeToAccount: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount: 5000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount],
			transactions: [incomeToAccount],
		});

		const { result } = renderHook(() => useSummary());

		// Balance should be 5000 (money received from income)
		expect(result.current.balance).toBe(5000);
	});

	it('should calculate balance as sum of all account actuals', () => {
		const incomeToAccount1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount: 3000,
			currency: 'USD',
			timestamp: periodStart,
		};

		const incomeToAccount2: Transaction = {
			id: 'tx-2',
			from_entity_id: 'income-1',
			to_entity_id: 'account-2',
			amount: 2000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount, mockAccount2],
			transactions: [incomeToAccount1, incomeToAccount2],
		});

		const { result } = renderHook(() => useSummary());

		// Balance should be 3000 + 2000 = 5000
		expect(result.current.balance).toBe(5000);
	});

	it('should subtract outgoing transactions from balance', () => {
		const incomeToAccount: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount: 5000,
			currency: 'USD',
			timestamp: periodStart,
		};

		const accountToCategory: Transaction = {
			id: 'tx-2',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 1500,
			currency: 'USD',
			timestamp: periodStart + 1000,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount, mockCategory],
			transactions: [incomeToAccount, accountToCategory],
		});

		const { result } = renderHook(() => useSummary());

		// Balance should be 5000 - 1500 = 3500
		expect(result.current.balance).toBe(3500);
		// Expenses should be 1500
		expect(result.current.expenses).toBe(1500);
	});

	it('should calculate expenses as sum of category actuals', () => {
		const mockCategory2: Entity = {
			id: 'category-2',
			type: 'category',
			name: 'Transport',
			currency: 'USD',
			row: 0,
			position: 1,
			order: 1,
		};

		const tx1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 200,
			currency: 'USD',
			timestamp: periodStart,
		};

		const tx2: Transaction = {
			id: 'tx-2',
			from_entity_id: 'account-1',
			to_entity_id: 'category-2',
			amount: 150,
			currency: 'USD',
			timestamp: periodStart + 1000,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory, mockCategory2],
			transactions: [tx1, tx2],
		});

		const { result } = renderHook(() => useSummary());

		// Expenses should be 200 + 150 = 350
		expect(result.current.expenses).toBe(350);
	});

	it('should calculate planned as sum of category plans', () => {
		const mockCategory2: Entity = {
			id: 'category-2',
			type: 'category',
			name: 'Transport',
			currency: 'USD',
			row: 0,
			position: 1,
			order: 1,
		};

		const plan1: Plan = {
			id: 'plan-1',
			entity_id: 'category-1',
			period: 'month',
			period_start: currentPeriod,
			planned_amount: 500,
		};

		const plan2: Plan = {
			id: 'plan-2',
			entity_id: 'category-2',
			period: 'month',
			period_start: currentPeriod,
			planned_amount: 300,
		};

		useStore.setState({
			entities: [mockCategory, mockCategory2],
			plans: [plan1, plan2],
		});

		const { result } = renderHook(() => useSummary());

		// Planned should be 500 + 300 = 800
		expect(result.current.planned).toBe(800);
	});

	it('should return zeros when no entities exist', () => {
		const { result } = renderHook(() => useSummary());

		expect(result.current.balance).toBe(0);
		expect(result.current.expenses).toBe(0);
		expect(result.current.planned).toBe(0);
	});
});
