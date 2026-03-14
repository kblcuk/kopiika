import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import HistoryScreen from '../history';
import { useStore } from '@/src/store';
import type { Entity, Transaction } from '@/src/types';

const mockSetParams = jest.fn();
let mockParams: { period?: string; entityId?: string } = {};
const fixedNow = new Date('2026-01-15T12:00:00Z').getTime();

jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockParams,
	useRouter: () => ({ setParams: mockSetParams }),
}));

// Track blur callback for testing cleanup behavior
let capturedBlurCallback: (() => void) | null = null;

jest.mock('@react-navigation/native', () => ({
	useFocusEffect: (createCallback: () => (() => void) | void) => {
		// Use React.useEffect to properly handle the focus effect mock
		const React = jest.requireActual('react');
		React.useEffect(() => {
			const cleanup = createCallback();
			if (typeof cleanup === 'function') {
				capturedBlurCallback = cleanup;
			}
			return cleanup;
		}, [createCallback]);
	},
}));

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/components/period-picker', () => ({
	PeriodPicker: ({ period }: { period: string }) => {
		const { Text } = jest.requireActual('react-native');
		return <Text testID="period-picker">{period}</Text>;
	},
}));

jest.mock('@/src/components/entity-filter', () => ({
	EntityFilter: ({ selectedEntityId }: { selectedEntityId: string | null }) => {
		const { Text } = jest.requireActual('react-native');
		return <Text testID="entity-filter">{selectedEntityId || 'all'}</Text>;
	},
}));

jest.mock('@/src/components/transaction-row', () => ({
	TransactionRow: ({
		transaction,
		isUpcoming,
		editable = true,
	}: {
		transaction: { id: string };
		isUpcoming?: boolean;
		editable?: boolean;
	}) => {
		const { Text } = jest.requireActual('react-native');
		return (
			<Text testID={`row-${transaction.id}`}>
				{transaction.id}:{isUpcoming ? 'upcoming' : 'past'}:{editable ? 'editable' : 'readonly'}
			</Text>
		);
	},
}));

jest.mock('@/src/components/transaction-modal', () => ({
	TransactionModal: () => null,
}));

describe('HistoryScreen search params', () => {
	const mockAccount: Entity = {
		id: 'account-1',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
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

	const mockTransaction: Transaction = {
		id: 'tx-1',
		from_entity_id: 'account-1',
		to_entity_id: 'category-1',
		amount: 100,
		currency: 'USD',
		timestamp: Date.now(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockParams = {};
		capturedBlurCallback = null;
		jest.useFakeTimers();
		jest.setSystemTime(fixedNow);

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [mockTransaction],
			currentPeriod: '2026-01',
			isLoading: false,
		});
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('applies URL params on focus when navigating with params', async () => {
		mockParams = { period: '2025-12', entityId: 'category-1' };

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('period-picker').props.children).toBe('2025-12');
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});
	});

	it('uses default period when no params provided', async () => {
		mockParams = {};

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			// Should use current period (YYYY-MM format)
			expect(getByTestId('period-picker').props.children).toMatch(/^\d{4}-\d{2}$/);
			expect(getByTestId('entity-filter').props.children).toBe('all');
		});
	});

	it('clears search params when navigating away (blur)', async () => {
		mockParams = { period: '2025-12', entityId: 'category-1' };

		const { unmount } = render(<HistoryScreen />);

		// Wait for effect to run and capture blur callback
		await waitFor(() => {
			expect(capturedBlurCallback).not.toBeNull();
		});

		// Simulate unmount/blur - the cleanup function should be called
		unmount();

		expect(mockSetParams).toHaveBeenCalledWith({ period: '', entityId: '' });
	});

	it('resets to defaults on next focus after params were cleared', async () => {
		// First render with params
		mockParams = { period: '2025-12', entityId: 'category-1' };
		const { getByTestId, unmount } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});

		// Unmount triggers cleanup which clears params
		unmount();
		expect(mockSetParams).toHaveBeenCalledWith({ period: '', entityId: '' });

		// Simulate returning to history via tab bar (no params)
		mockParams = {};
		const { getByTestId: getByTestId2 } = render(<HistoryScreen />);

		// Should show defaults since params were cleared
		await waitFor(() => {
			expect(getByTestId2('entity-filter').props.children).toBe('all');
			expect(getByTestId2('period-picker').props.children).toMatch(/^\d{4}-\d{2}$/);
		});
	});

	it('excludes upcoming transactions outside the selected period (KII-31 regression)', async () => {
		const pastTransaction: Transaction = {
			id: 'tx-past',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 100,
			currency: 'USD',
			timestamp: new Date('2026-01-10T12:00:00Z').getTime(),
		};

		// Future tx within January
		const upcomingInPeriod: Transaction = {
			id: 'tx-upcoming-jan',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 200,
			currency: 'USD',
			timestamp: new Date('2026-01-20T12:00:00Z').getTime(),
		};

		// Future tx in February — should NOT appear when period is January
		const upcomingOutOfPeriod: Transaction = {
			id: 'tx-upcoming-feb',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 300,
			currency: 'USD',
			timestamp: new Date('2026-02-10T12:00:00Z').getTime(),
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [pastTransaction, upcomingInPeriod, upcomingOutOfPeriod],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		mockParams = { period: '2026-01' };

		const { getByTestId, queryByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('row-tx-upcoming-jan')).toBeTruthy();
			expect(queryByTestId('row-tx-upcoming-feb')).toBeNull();
		});
	});

	it('hides upcoming section when selected period is entirely in the past', async () => {
		// Future tx exists but period is December 2025 (fully past)
		const futureTransaction: Transaction = {
			id: 'tx-future',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 500,
			currency: 'USD',
			timestamp: new Date('2026-01-20T12:00:00Z').getTime(),
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [futureTransaction],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		mockParams = { period: '2025-12' };

		const { queryByText, queryByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(queryByText('Upcoming')).toBeNull();
			expect(queryByTestId('row-tx-future')).toBeNull();
		});
	});

	it('shows future transactions in an Upcoming section and keeps past rows in regular sections', async () => {
		const pastTransaction: Transaction = {
			id: 'tx-past',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 100,
			currency: 'USD',
			timestamp: new Date('2026-01-10T12:00:00Z').getTime(),
		};

		const upcomingTransaction: Transaction = {
			id: 'tx-upcoming',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 200,
			currency: 'USD',
			timestamp: new Date('2026-01-20T12:00:00Z').getTime(),
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [pastTransaction, upcomingTransaction],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		mockParams = { period: '2026-01' };

		const { getByText, getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByText('Upcoming')).toBeTruthy();
			expect(getByTestId('row-tx-upcoming').props.children.join('')).toBe(
				'tx-upcoming:upcoming:editable'
			);
			expect(getByTestId('row-tx-past').props.children.join('')).toBe(
				'tx-past:past:editable'
			);
			expect(getByText('1 transaction')).toBeTruthy();
		});
	});

	it('renders transactions with deleted entities as read-only', async () => {
		const deletedEntityTransaction: Transaction = {
			...mockTransaction,
			timestamp: fixedNow - 60_000,
		};

		useStore.setState({
			entities: [
				{ ...mockAccount, is_deleted: true },
				mockCategory,
			],
			plans: [],
			transactions: [deletedEntityTransaction],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('row-tx-1').props.children.join('')).toBe(
				'tx-1:past:readonly'
			);
		});
	});
});
