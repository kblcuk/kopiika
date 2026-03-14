import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import SummaryScreen from '../summary';
import { useStore } from '@/src/store';
import * as transactionsDb from '@/src/db/transactions';
import type { Entity, Plan, Transaction } from '@/src/types';

// Mock dependencies
jest.mock('expo-router', () => ({
	useRouter: () => ({
		push: jest.fn(),
	}),
}));

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/db/transactions', () => ({
	getBatchEntityActuals: jest.fn(),
}));

jest.mock('@/src/components/period-picker', () => ({
	PeriodPicker: () => null,
}));

jest.mock('@/src/components/progress-bar', () => ({
	ProgressBar: () => null,
}));

describe('SummaryScreen', () => {
	const mockCategory: Entity = {
		id: 'category-1',
		type: 'category',
		name: 'Groceries',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
	};

	const mockSaving: Entity = {
		id: 'saving-1',
		type: 'saving',
		name: 'Vacation',
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

	const mockPlan: Plan = {
		id: 'plan-1',
		entity_id: 'category-1',
		period: 'all-time',
		period_start: '2026-01',
		planned_amount: 500,
	};

	beforeEach(() => {
		jest.clearAllMocks();

		// Reset store state
		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			reservations: [],
			currentPeriod: '2026-01',
			isLoading: false,
			draggedEntity: null,
			hoveredDropZoneId: null,
			incomeVisible: false,
			previewPositions: null,
		});

		// Default mock implementation
		(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(new Map());
	});

	describe('Transaction reactivity', () => {
		it('should refetch actuals when a new transaction is added to store', async () => {
			// Set up initial store state with entities
			useStore.setState({
				entities: [mockCategory, mockAccount],
				plans: [mockPlan],
				transactions: [],
			});

			// Initial actuals: category has 0 spent
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 0]])
			);

			const { rerender } = render(<SummaryScreen />);

			// Wait for initial fetch
			await waitFor(() => {
				expect(transactionsDb.getBatchEntityActuals).toHaveBeenCalledTimes(4);
			});

			// Clear mock to track new calls
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockClear();

			// Update mock to return new actuals after transaction
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 150]])
			);

			// Simulate adding a transaction to the store
			const newTransaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 150,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await act(async () => {
				useStore.setState({
					transactions: [newTransaction],
				});
			});

			// Rerender to trigger the effect
			rerender(<SummaryScreen />);

			// Should refetch actuals due to transactions change
			await waitFor(() => {
				expect(transactionsDb.getBatchEntityActuals).toHaveBeenCalled();
			});
		});

		it('should refetch actuals when a transaction is deleted from store', async () => {
			const existingTransaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 200,
				currency: 'USD',
				timestamp: Date.now(),
			};

			// Set up initial store state with a transaction
			useStore.setState({
				entities: [mockCategory, mockAccount],
				plans: [mockPlan],
				transactions: [existingTransaction],
			});

			// Initial actuals: category has 200 spent
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 200]])
			);

			const { rerender } = render(<SummaryScreen />);

			// Wait for initial fetch
			await waitFor(() => {
				expect(transactionsDb.getBatchEntityActuals).toHaveBeenCalledTimes(4);
			});

			// Clear mock to track new calls
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockClear();

			// Update mock to return 0 after deletion
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 0]])
			);

			// Simulate deleting the transaction
			await act(async () => {
				useStore.setState({
					transactions: [],
				});
			});

			rerender(<SummaryScreen />);

			// Should refetch actuals due to transactions change
			await waitFor(() => {
				expect(transactionsDb.getBatchEntityActuals).toHaveBeenCalled();
			});
		});

		it('should refetch actuals when a transaction amount is updated', async () => {
			const existingTransaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 100,
				currency: 'USD',
				timestamp: Date.now(),
			};

			// Set up initial store state
			useStore.setState({
				entities: [mockCategory, mockAccount],
				plans: [mockPlan],
				transactions: [existingTransaction],
			});

			// Initial actuals
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 100]])
			);

			const { rerender } = render(<SummaryScreen />);

			// Wait for initial fetch
			await waitFor(() => {
				expect(transactionsDb.getBatchEntityActuals).toHaveBeenCalledTimes(4);
			});

			// Clear mock to track new calls
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockClear();

			// Update mock to return new amount
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 250]])
			);

			// Simulate updating the transaction amount
			const updatedTransaction: Transaction = {
				...existingTransaction,
				amount: 250,
			};

			await act(async () => {
				useStore.setState({
					transactions: [updatedTransaction],
				});
			});

			rerender(<SummaryScreen />);

			// Should refetch actuals due to transactions change
			await waitFor(() => {
				expect(transactionsDb.getBatchEntityActuals).toHaveBeenCalled();
			});
		});

		it('should display updated amounts after transactions change', async () => {
			// Set up initial store state
			useStore.setState({
				entities: [mockCategory, mockAccount],
				plans: [mockPlan],
				transactions: [],
			});

			// Initial: no spending
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 0]])
			);

			const { getAllByText, rerender } = render(<SummaryScreen />);

			// Wait for initial render with 0 actual (formatAmount returns "0.00")
			await waitFor(() => {
				expect(getAllByText('0.00').length).toBeGreaterThan(0);
			});

			// Update mock for after transaction
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 300]])
			);

			// Add transaction
			const newTransaction: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 300,
				currency: 'USD',
				timestamp: Date.now(),
			};

			await act(async () => {
				useStore.setState({
					transactions: [newTransaction],
				});
			});

			rerender(<SummaryScreen />);

			// Should show updated amount (formatAmount returns "300.00")
			await waitFor(() => {
				expect(getAllByText('300.00').length).toBeGreaterThan(0);
			});
		});

		it('should handle multiple rapid transaction changes', async () => {
			useStore.setState({
				entities: [mockCategory, mockAccount],
				plans: [mockPlan],
				transactions: [],
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 0]])
			);

			const { rerender } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(transactionsDb.getBatchEntityActuals).toHaveBeenCalled();
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockClear();

			// Rapidly add multiple transactions
			const tx1: Transaction = {
				id: 'tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const tx2: Transaction = {
				id: 'tx-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 75,
				currency: 'USD',
				timestamp: Date.now() + 1000,
			};

			const tx3: Transaction = {
				id: 'tx-3',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 25,
				currency: 'USD',
				timestamp: Date.now() + 2000,
			};

			// Final state should reflect all transactions
			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 150]])
			);

			await act(async () => {
				useStore.setState({
					transactions: [tx1, tx2, tx3],
				});
			});

			rerender(<SummaryScreen />);

			// Should eventually fetch with all transactions
			await waitFor(() => {
				expect(transactionsDb.getBatchEntityActuals).toHaveBeenCalled();
			});
		});
	});

	describe('Section rendering', () => {
		it('should render categories section when category entities exist', async () => {
			useStore.setState({
				entities: [mockCategory],
				plans: [mockPlan],
				transactions: [],
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 100]])
			);

			const { getByText } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getByText('Categories')).toBeTruthy();
				expect(getByText('Groceries')).toBeTruthy();
			});
		});

		it('should display planned values from all-time plans', async () => {
			useStore.setState({
				entities: [mockCategory],
				plans: [
					{
						id: 'legacy-month-plan',
						entity_id: 'category-1',
						period: 'month',
						period_start: '2026-01',
						planned_amount: 250,
					},
					mockPlan,
				],
				transactions: [],
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 100]])
			);

			const { getByText, queryByText } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getByText('/ 500.00')).toBeTruthy();
			});

			expect(queryByText('/ 250.00')).toBeNull();
		});

		it('should render savings section when saving entities exist', async () => {
			useStore.setState({
				entities: [mockSaving],
				plans: [],
				transactions: [],
				reservations: [],
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['saving-1', 500]])
			);

			const { getByText } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getByText('Savings')).toBeTruthy();
				expect(getByText('Vacation')).toBeTruthy();
			});
		});

		it('should use reservations for savings actuals', async () => {
			useStore.setState({
				entities: [mockSaving],
				plans: [],
				transactions: [],
				reservations: [
					{
						id: 'res-1',
						account_entity_id: 'account-1',
						saving_entity_id: 'saving-1',
						amount: 350,
					},
				],
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['saving-1', 999]])
			);

			const { getByText } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getByText('Vacation')).toBeTruthy();
				expect(getByText('350.00')).toBeTruthy();
			});
		});

		it('should show empty state when no entities exist', async () => {
			useStore.setState({
				entities: [],
				plans: [],
				transactions: [],
				reservations: [],
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(new Map());

			const { getByText } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getByText('No data this period')).toBeTruthy();
			});
		});
	});
});
