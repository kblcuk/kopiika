import React from 'react';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import HistoryScreen from '../history';
import { useStore } from '@/src/store';
import type { Entity, Transaction } from '@/src/types';

let mockParams: { period?: string; entityId?: string } = {};
const fixedNow = new Date('2026-01-15T12:00:00Z').getTime();

jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockParams,
}));

// Expose a handle to re-trigger focus on the mounted component
let triggerFocus: (() => void) | null = null;

jest.mock('@react-navigation/native', () => ({
	useFocusEffect: (createCallback: () => (() => void) | void) => {
		const React = jest.requireActual('react');
		React.useEffect(() => {
			triggerFocus = () => createCallback();
			const cleanup = createCallback();
			return () => {
				triggerFocus = null;
				if (typeof cleanup === 'function') cleanup();
			};
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
				{transaction.id}:{isUpcoming ? 'upcoming' : 'past'}:
				{editable ? 'editable' : 'readonly'}
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

	it('resets to All Entities on second focus when URL params are stale', async () => {
		// Simulate navigation from entity tap: entityId is in params
		mockParams = { period: '2025-12', entityId: 'category-1' };
		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});

		// Simulate user going to another tab and returning (second focus, same stale params)
		act(() => {
			triggerFocus?.();
		});

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('all');
		});
	});

	it('reapplies entity filter when navigating from entity after a reset', async () => {
		mockParams = { entityId: 'category-1' };
		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});

		// Second focus (tab press) — resets
		act(() => {
			triggerFocus?.();
		});

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('all');
		});

		// Third focus — new navigation with same entityId (lastApplied was cleared)
		act(() => {
			triggerFocus?.();
		});

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
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

	it('classifies a just-created transaction as past, not upcoming (KII-73)', async () => {
		// Transaction created at exactly "now" — the common case when a user
		// creates a transaction and immediately views History.
		const justCreated: Transaction = {
			id: 'tx-just-created',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 42,
			currency: 'USD',
			timestamp: fixedNow,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [justCreated],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		mockParams = { period: '2026-01' };

		const { getByTestId, queryByText } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('row-tx-just-created').props.children.join('')).toBe(
				'tx-just-created:past:editable'
			);
			expect(queryByText('Upcoming')).toBeNull();
		});
	});

	it('shows a just-created transaction in entity-filtered history (KII-73)', async () => {
		const justCreated: Transaction = {
			id: 'tx-just-created',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 42,
			currency: 'USD',
			timestamp: fixedNow,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [justCreated],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		// Navigate with entity filter for the source account
		mockParams = { period: '2026-01', entityId: 'account-1' };

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('row-tx-just-created').props.children.join('')).toBe(
				'tx-just-created:past:editable'
			);
		});
	});

	it('renders transactions with deleted entities as read-only', async () => {
		const deletedEntityTransaction: Transaction = {
			...mockTransaction,
			timestamp: fixedNow - 60_000,
		};

		useStore.setState({
			entities: [{ ...mockAccount, is_deleted: true }, mockCategory],
			plans: [],
			transactions: [deletedEntityTransaction],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('row-tx-1').props.children.join('')).toBe('tx-1:past:readonly');
		});
	});

	it('filters transactions by note text (case-insensitive)', async () => {
		const txWithNote: Transaction = {
			id: 'tx-ikea',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 44.31,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
			note: 'IKEA shelf',
		};

		const txWithoutNote: Transaction = {
			id: 'tx-plain',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 20,
			currency: 'USD',
			timestamp: fixedNow - 120_000,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [txWithNote, txWithoutNote],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		mockParams = { period: '2026-01' };

		const { getByPlaceholderText, getByTestId, queryByTestId } = render(<HistoryScreen />);

		fireEvent.changeText(getByPlaceholderText('Search by note or amount'), 'ikea');

		await waitFor(() => {
			expect(getByTestId('row-tx-ikea')).toBeTruthy();
			expect(queryByTestId('row-tx-plain')).toBeNull();
		});
	});

	it('filters transactions by amount (partial match)', async () => {
		const tx1: Transaction = {
			id: 'tx-a',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 44.31,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
		};

		const tx2: Transaction = {
			id: 'tx-b',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 20,
			currency: 'USD',
			timestamp: fixedNow - 120_000,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [tx1, tx2],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		mockParams = { period: '2026-01' };

		const { getByPlaceholderText, getByTestId, queryByTestId } = render(<HistoryScreen />);

		fireEvent.changeText(getByPlaceholderText('Search by note or amount'), '44.3');

		await waitFor(() => {
			expect(getByTestId('row-tx-a')).toBeTruthy();
			expect(queryByTestId('row-tx-b')).toBeNull();
		});
	});

	it('shows all transactions when search is cleared', async () => {
		const tx1: Transaction = {
			id: 'tx-a',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 50,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
			note: 'rent',
		};

		const tx2: Transaction = {
			id: 'tx-b',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 20,
			currency: 'USD',
			timestamp: fixedNow - 120_000,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [tx1, tx2],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		mockParams = { period: '2026-01' };

		const { getByPlaceholderText, getByTestId, queryByTestId } = render(<HistoryScreen />);

		const searchInput = getByPlaceholderText('Search by note or amount');

		// Filter down
		fireEvent.changeText(searchInput, 'rent');

		await waitFor(() => {
			expect(getByTestId('row-tx-a')).toBeTruthy();
			expect(queryByTestId('row-tx-b')).toBeNull();
		});

		// Clear search
		fireEvent.changeText(searchInput, '');

		await waitFor(() => {
			expect(getByTestId('row-tx-a')).toBeTruthy();
			expect(getByTestId('row-tx-b')).toBeTruthy();
		});
	});

	it('combines search with entity filter', async () => {
		const txMatch: Transaction = {
			id: 'tx-match',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 50,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
			note: 'groceries at Lidl',
		};

		const txWrongEntity: Transaction = {
			id: 'tx-wrong-entity',
			from_entity_id: 'category-1',
			to_entity_id: 'account-1',
			amount: 50,
			currency: 'USD',
			timestamp: fixedNow - 120_000,
			note: 'groceries refund',
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [txMatch, txWrongEntity],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		// Filter by category-1 as destination only (txMatch has to=category-1)
		// Both transactions involve category-1, so entity filter alone won't
		// separate them — but search for "Lidl" will.
		mockParams = { period: '2026-01', entityId: 'category-1' };

		const { getByPlaceholderText, getByTestId, queryByTestId } = render(<HistoryScreen />);

		fireEvent.changeText(getByPlaceholderText('Search by note or amount'), 'Lidl');

		await waitFor(() => {
			expect(getByTestId('row-tx-match')).toBeTruthy();
			expect(queryByTestId('row-tx-wrong-entity')).toBeNull();
		});
	});

	describe('Investment account market value history', () => {
		const mockInvestmentAccount: Entity = {
			id: 'inv-account',
			type: 'account',
			name: 'Brokerage',
			currency: 'USD',
			row: 0,
			position: 0,
			order: 0,
			is_investment: true,
		};

		it('shows market value history when investment account is selected', async () => {
			useStore.setState({
				entities: [mockInvestmentAccount],
				plans: [],
				transactions: [],
				marketValueSnapshots: [
					{
						id: 'snap-1',
						entity_id: 'inv-account',
						amount: 7500,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			mockParams = { period: '2026-01', entityId: 'inv-account' };

			const { getByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('market-value-snapshots-section')).toBeTruthy();
				expect(getByTestId('market-value-snapshot-row-snap-1')).toBeTruthy();
			});
		});

		it('shows empty market value history state when investment account has no snapshots', async () => {
			useStore.setState({
				entities: [mockInvestmentAccount],
				plans: [],
				transactions: [],
				marketValueSnapshots: [],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			mockParams = { period: '2026-01', entityId: 'inv-account' };

			const { getByTestId, getByText } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('market-value-snapshots-section')).toBeTruthy();
				expect(
					getByText('No market value snapshots yet. Add one from the account editor.')
				).toBeTruthy();
			});
		});

		it('hides market value history for non-investment accounts', async () => {
			useStore.setState({
				entities: [mockAccount],
				plans: [],
				transactions: [],
				marketValueSnapshots: [
					{
						id: 'snap-1',
						entity_id: 'account-1',
						amount: 7500,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			mockParams = { period: '2026-01', entityId: 'account-1' };

			const { queryByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(queryByTestId('market-value-snapshots-section')).toBeNull();
			});
		});

		it('hides market value history when no entity is selected', async () => {
			useStore.setState({
				entities: [mockInvestmentAccount],
				plans: [],
				transactions: [],
				marketValueSnapshots: [
					{
						id: 'snap-1',
						entity_id: 'inv-account',
						amount: 7500,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			mockParams = { period: '2026-01' };

			const { queryByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(queryByTestId('market-value-snapshots-section')).toBeNull();
			});
		});

		it('shows market value history below transactions when both exist', async () => {
			const tx: Transaction = {
				id: 'tx-1',
				from_entity_id: 'inv-account',
				to_entity_id: 'category-1',
				amount: 100,
				currency: 'USD',
				timestamp: fixedNow - 60_000,
			};

			useStore.setState({
				entities: [mockInvestmentAccount, mockCategory],
				plans: [],
				transactions: [tx],
				marketValueSnapshots: [
					{
						id: 'snap-1',
						entity_id: 'inv-account',
						amount: 7500,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			mockParams = { period: '2026-01', entityId: 'inv-account' };

			const { getByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('row-tx-1')).toBeTruthy();
				expect(getByTestId('market-value-snapshots-section')).toBeTruthy();
			});
		});

		it('edits market value snapshot amount and date from history', async () => {
			const updateMarketValueSnapshot = jest.fn();
			useStore.setState({
				entities: [mockInvestmentAccount],
				plans: [],
				transactions: [],
				marketValueSnapshots: [
					{
						id: 'snap-1',
						entity_id: 'inv-account',
						amount: 7500,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				updateMarketValueSnapshot,
				currentPeriod: '2026-01',
				isLoading: false,
			});

			mockParams = { period: '2026-01', entityId: 'inv-account' };

			const { getByTestId, getByText } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('market-value-snapshot-row-snap-1')).toBeTruthy();
			});

			fireEvent.press(getByTestId('market-value-snapshot-row-snap-1'));
			fireEvent.changeText(getByTestId('snapshot-edit-amount-input'), '8100');
			fireEvent.changeText(getByTestId('snapshot-edit-date-input'), '2026-01-10');
			fireEvent.press(getByText('Save'));

			await waitFor(() => {
				expect(updateMarketValueSnapshot).toHaveBeenCalledWith('snap-1', {
					amount: 8100,
					date: new Date(2026, 0, 10).setHours(0, 0, 0, 0),
				});
			});
		});
	});
});
