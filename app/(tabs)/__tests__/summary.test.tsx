import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import SummaryScreen from '../summary';
import { useStore } from '@/src/store';
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

			useStore.setState({
				entities: [mockCategory, mockAccount],
				plans: [mockPlan],
				transactions: [existingTransaction],
			});

			const { getAllByText, queryByText, rerender } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getAllByText('100.00').length).toBeGreaterThan(0);
				expect(queryByText('250.00')).toBeNull();
			});

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

			const { getAllByText, queryByText, rerender } = render(<SummaryScreen />);

			await waitFor(() => {
				expect(getAllByText('300.00').length).toBeGreaterThan(0);
				expect(queryByText('0.00')).toBeNull();
			});

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
		it('should render categories section when category entities exist', () => {
			useStore.setState({
				entities: [mockCategory],
				plans: [mockPlan],
				transactions: [],
			});

			const { getByText } = render(<SummaryScreen />);

			expect(getByText('Categories')).toBeTruthy();
			expect(getByText('Groceries')).toBeTruthy();
		});

		it('should display planned values from all-time plans', () => {
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

			const { getByText, queryByText } = render(<SummaryScreen />);

			expect(getByText('/ 500.00')).toBeTruthy();
			expect(queryByText('/ 250.00')).toBeNull();
		});

		it('should render savings section when saving entities exist', () => {
			useStore.setState({
				entities: [mockSaving],
				plans: [],
				transactions: [],
				reservations: [],
			});

			const { getByText } = render(<SummaryScreen />);

			expect(getByText('Savings')).toBeTruthy();
			expect(getByText('Vacation')).toBeTruthy();
		});

		it('should use reservations for savings actuals', () => {
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

			const { getByText } = render(<SummaryScreen />);

			expect(getByText('Vacation')).toBeTruthy();
			expect(getByText('350.00')).toBeTruthy();
		});

		it('should show empty state when no entities exist', () => {
			useStore.setState({
				entities: [],
				plans: [],
				transactions: [],
				reservations: [],
			});

			const { getByText } = render(<SummaryScreen />);

			expect(getByText('No data this period')).toBeTruthy();
		});
	});

	describe('Canonical derivation rules', () => {
		it('should only include current-period transactions for categories', () => {
			const now = new Date();
			const currentMonthTs = now.getTime();
			const lastMonthTs = new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime();

			useStore.setState({
				entities: [mockCategory, mockAccount],
				plans: [mockPlan],
				transactions: [
					{
						id: 'tx-current',
						from_entity_id: 'account-1',
						to_entity_id: 'category-1',
						amount: 100,
						currency: 'USD',
						timestamp: currentMonthTs,
					},
					{
						id: 'tx-old',
						from_entity_id: 'account-1',
						to_entity_id: 'category-1',
						amount: 200,
						currency: 'USD',
						timestamp: lastMonthTs,
					},
				],
			});

			const { getAllByText, queryByText } = render(<SummaryScreen />);

			// Only current-month 100 should appear, not 300 (100+200)
			expect(getAllByText('100.00').length).toBeGreaterThan(0);
			expect(queryByText('300.00')).toBeNull();
		});

		it('should exclude soft-deleted entities', () => {
			useStore.setState({
				entities: [mockCategory, { ...mockSaving, is_deleted: true }],
				plans: [mockPlan],
				transactions: [],
				reservations: [
					{
						id: 'res-1',
						account_entity_id: 'account-1',
						saving_entity_id: 'saving-1',
						amount: 500,
					},
				],
			});

			const { getByText, queryByText } = render(<SummaryScreen />);

			expect(getByText('Groceries')).toBeTruthy();
			expect(queryByText('Vacation')).toBeNull();
			expect(queryByText('500.00')).toBeNull();
		});

		it('should not render income or account entities', () => {
			const mockIncome: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				order: 0,
			};

			useStore.setState({
				entities: [mockCategory, mockAccount, mockIncome],
				plans: [mockPlan],
				transactions: [],
				reservations: [],
			});

			const { getByText, queryByText } = render(<SummaryScreen />);

			expect(getByText('Groceries')).toBeTruthy();
			expect(queryByText('Checking')).toBeNull();
			expect(queryByText('Salary')).toBeNull();
		});
	});
});
