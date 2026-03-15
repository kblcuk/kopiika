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
			incomeVisible: false,
		});

		// Default mock implementation
		(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(new Map());
	});

	describe('Transaction reactivity', () => {
		it('updates rendered category amounts when transactions change', async () => {
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

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 100]])
			);

			const { getAllByText, queryByText, rerender } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getAllByText('100.00').length).toBeGreaterThan(0);
				expect(queryByText('250.00')).toBeNull();
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 250]])
			);

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

			await waitFor(() => {
				expect(getAllByText('250.00').length).toBeGreaterThan(0);
				expect(queryByText('100.00')).toBeNull();
			});
		});

		it('returns rendered totals to zero when transactions are removed', async () => {
			useStore.setState({
				entities: [mockCategory, mockAccount],
				plans: [mockPlan],
				transactions: [
					{
						id: 'tx-1',
						from_entity_id: 'account-1',
						to_entity_id: 'category-1',
						amount: 300,
						currency: 'USD',
						timestamp: Date.now(),
					},
				],
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 300]])
			);

			const { getAllByText, queryByText, rerender } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getAllByText('300.00').length).toBeGreaterThan(0);
				expect(queryByText('0.00')).toBeNull();
			});

			(transactionsDb.getBatchEntityActuals as jest.Mock).mockResolvedValue(
				new Map([['category-1', 0]])
			);

			await act(async () => {
				useStore.setState({
					transactions: [],
				});
			});

			rerender(<SummaryScreen />);

			await waitFor(() => {
				expect(getAllByText('0.00').length).toBeGreaterThan(0);
				expect(queryByText('300.00')).toBeNull();
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
