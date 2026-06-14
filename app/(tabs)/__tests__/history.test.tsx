import React from 'react';
import { SectionList } from 'react-native';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import HistoryScreen from '../history';
import { useStore } from '@/src/store';
import {
	consumePendingHistoryFilter,
	setPendingHistoryFilter,
} from '@/src/utils/history-nav-signal';
import type { Entity, Transaction } from '@/src/types';

const fixedNow = new Date('2026-01-15T12:00:00Z').getTime();

// Stub expo-router so its JSX-laden internals don't load in the headless
// test environment. The screen no longer reads URL params anyway.
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => ({}),
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

	const mockAccount2: Entity = {
		id: 'account-2',
		type: 'account',
		name: 'Cash',
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

	const mockSaving: Entity = {
		id: 'saving-1',
		type: 'saving',
		name: 'Emergency fund',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
	};

	const mockSaving2: Entity = {
		id: 'saving-2',
		type: 'saving',
		name: 'Vacation',
		currency: 'USD',
		row: 0,
		position: 1,
		order: 1,
	};

	const mockTransaction: Transaction = {
		id: 'tx-1',
		from_entity_id: 'account-1',
		to_entity_id: 'category-1',
		amount_minor: 10000,
		currency: 'USD',
		timestamp: Date.now(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		consumePendingHistoryFilter();
		jest.useFakeTimers();
		jest.setSystemTime(fixedNow);

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [mockTransaction],
			recurrenceTemplates: [],
			currentPeriod: '2026-01',
			isLoading: false,
		});
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('applies the pending filter on mount when navigating from another screen', async () => {
		setPendingHistoryFilter({ period: '2025-12', entityId: 'category-1' });

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('period-picker').props.children).toBe('2025-12');
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});
	});

	it('uses default period when no pending filter is provided', async () => {
		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			// Should use current period (YYYY-MM format)
			expect(getByTestId('period-picker').props.children).toMatch(/^\d{4}-\d{2}$/);
			expect(getByTestId('entity-filter').props.children).toBe('all');
		});
	});

	it('resets to All Entities on every tab-bar focus (KII-111)', async () => {
		// Initial navigation from a Dashboard tap.
		setPendingHistoryFilter({ entityId: 'category-1' });
		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});

		// Tab-bar return: no pending signal, must reset.
		act(() => {
			triggerFocus?.();
		});

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('all');
		});

		// Another tab-bar return: stays reset (no alternation, the KII-111 bug).
		act(() => {
			triggerFocus?.();
		});

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('all');
		});
	});

	it('applies a freshly-set pending filter on subsequent focus', async () => {
		setPendingHistoryFilter({ entityId: 'category-1' });
		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});

		// Tab-bar return without a new signal: reset.
		act(() => {
			triggerFocus?.();
		});
		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('all');
		});

		// Producer sets a fresh signal, then focus fires (e.g., Dashboard tap).
		setPendingHistoryFilter({ entityId: 'account-1' });
		act(() => {
			triggerFocus?.();
		});

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('account-1');
		});
	});

	it('resets the period to current on tab-bar focus when no signal is pending', async () => {
		setPendingHistoryFilter({ period: '2025-12' });
		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('period-picker').props.children).toBe('2025-12');
		});

		act(() => {
			triggerFocus?.();
		});

		await waitFor(() => {
			// fixedNow is 2026-01-15, so current period is 2026-01
			expect(getByTestId('period-picker').props.children).toBe('2026-01');
		});
	});

	it('excludes upcoming transactions outside the selected period (KII-31 regression)', async () => {
		const pastTransaction: Transaction = {
			id: 'tx-past',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 10000,
			currency: 'USD',
			timestamp: new Date('2026-01-10T12:00:00Z').getTime(),
		};

		// Future tx within January
		const upcomingInPeriod: Transaction = {
			id: 'tx-upcoming-jan',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
			currency: 'USD',
			timestamp: new Date('2026-01-20T12:00:00Z').getTime(),
		};

		// Future tx in February — should NOT appear when period is January
		const upcomingOutOfPeriod: Transaction = {
			id: 'tx-upcoming-feb',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 30000,
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

		setPendingHistoryFilter({ period: '2026-01' });

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
			amount_minor: 50000,
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

		setPendingHistoryFilter({ period: '2025-12' });

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
			amount_minor: 10000,
			currency: 'USD',
			timestamp: new Date('2026-01-10T12:00:00Z').getTime(),
		};

		const upcomingTransaction: Transaction = {
			id: 'tx-upcoming',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
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

		setPendingHistoryFilter({ period: '2026-01' });

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

	it('sorts upcoming distant-to-near and confirmed transactions newest-to-oldest (KII-133)', async () => {
		const futureNear: Transaction = {
			id: 'tx-future-near',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
			currency: 'USD',
			timestamp: new Date('2026-01-20T12:00:00Z').getTime(),
		};
		const futureFar: Transaction = {
			id: 'tx-future-far',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 30000,
			currency: 'USD',
			timestamp: new Date('2026-01-30T12:00:00Z').getTime(),
		};
		const todayTransaction: Transaction = {
			id: 'tx-today',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 10000,
			currency: 'USD',
			timestamp: new Date('2026-01-15T10:00:00Z').getTime(),
		};
		const todayLaterTransaction: Transaction = {
			id: 'tx-today-later',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 12500,
			currency: 'USD',
			timestamp: new Date('2026-01-15T11:00:00Z').getTime(),
		};
		const pastTransaction: Transaction = {
			id: 'tx-past',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 5000,
			currency: 'USD',
			timestamp: new Date('2026-01-10T12:00:00Z').getTime(),
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [
				futureNear,
				todayLaterTransaction,
				pastTransaction,
				futureFar,
				todayTransaction,
			],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		setPendingHistoryFilter({ period: '2026-01' });

		const utils = render(<HistoryScreen />);

		await waitFor(() => {
			expect(utils.getByTestId('row-tx-future-far')).toBeTruthy();
			expect(utils.getByTestId('row-tx-past')).toBeTruthy();
		});

		const list = utils.UNSAFE_root.findByType(SectionList);
		const sections = list.props.sections as { data: Transaction[] }[];

		expect(sections.map((section) => section.data.map((tx) => tx.id))).toEqual([
			['tx-future-far', 'tx-future-near'],
			['tx-today-later', 'tx-today'],
			['tx-past'],
		]);
	});

	it('classifies a just-created transaction as past, not upcoming (KII-73)', async () => {
		// Transaction created at exactly "now" — the common case when a user
		// creates a transaction and immediately views History.
		const justCreated: Transaction = {
			id: 'tx-just-created',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 4200,
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

		setPendingHistoryFilter({ period: '2026-01' });

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
			amount_minor: 4200,
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
		setPendingHistoryFilter({ period: '2026-01', entityId: 'account-1' });

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('row-tx-just-created').props.children.join('')).toBe(
				'tx-just-created:past:editable'
			);
		});
	});

	it('shows a collapsible reservation summary when filtered to an account (KII-69)', async () => {
		const firstReservationTx: Transaction = {
			id: 'tx-reservation-1',
			from_entity_id: 'account-1',
			to_entity_id: 'saving-1',
			amount_minor: 30000,
			currency: 'USD',
			timestamp: new Date('2025-12-01T12:00:00Z').getTime(),
		};
		const releaseTx: Transaction = {
			id: 'tx-release',
			from_entity_id: 'saving-1',
			to_entity_id: 'account-1',
			amount_minor: 12500,
			currency: 'USD',
			timestamp: new Date('2025-12-05T12:00:00Z').getTime(),
		};
		const secondReservationTx: Transaction = {
			id: 'tx-reservation-2',
			from_entity_id: 'account-1',
			to_entity_id: 'saving-2',
			amount_minor: 7500,
			currency: 'USD',
			timestamp: new Date('2025-12-10T12:00:00Z').getTime(),
		};

		useStore.setState({
			entities: [mockAccount, mockCategory, mockSaving, mockSaving2],
			plans: [],
			transactions: [firstReservationTx, releaseTx, secondReservationTx],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		setPendingHistoryFilter({ period: '2026-01', entityId: 'account-1' });

		const { getByTestId, getByText, queryByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('reservation-summary')).toBeTruthy();
			expect(getByText('Emergency fund')).toBeTruthy();
			expect(getByText('Vacation')).toBeTruthy();
			expect(getByText('175.00')).toBeTruthy();
			expect(getByText('75.00')).toBeTruthy();
			expect(getByTestId('reservation-summary-total').props.children).toBe('250.00');
		});

		fireEvent.press(getByTestId('reservation-summary-toggle'));

		await waitFor(() => {
			expect(queryByTestId('reservation-summary-row-saving-1')).toBeNull();
		});
	});

	it('shows reservation sources when filtered to a saving (KII-69)', async () => {
		const firstReservationTx: Transaction = {
			id: 'tx-reservation-1',
			from_entity_id: 'account-1',
			to_entity_id: 'saving-1',
			amount_minor: 12500,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
		};
		const secondReservationTx: Transaction = {
			id: 'tx-reservation-2',
			from_entity_id: 'account-2',
			to_entity_id: 'saving-1',
			amount_minor: 8000,
			currency: 'USD',
			timestamp: fixedNow - 120_000,
		};
		const releaseTx: Transaction = {
			id: 'tx-release',
			from_entity_id: 'saving-1',
			to_entity_id: 'account-2',
			amount_minor: 3000,
			currency: 'USD',
			timestamp: fixedNow - 180_000,
		};

		useStore.setState({
			entities: [mockAccount, mockAccount2, mockCategory, mockSaving],
			plans: [],
			transactions: [firstReservationTx, secondReservationTx, releaseTx],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		setPendingHistoryFilter({ period: '2026-01', entityId: 'saving-1' });

		const { getByTestId, getByText } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('reservation-summary')).toBeTruthy();
			expect(getByText('Checking')).toBeTruthy();
			expect(getByText('Cash')).toBeTruthy();
			expect(getByTestId('reservation-summary-row-account-1')).toBeTruthy();
			expect(getByTestId('reservation-summary-row-account-2')).toBeTruthy();
			expect(getByText('50.00')).toBeTruthy();
			expect(getByTestId('reservation-summary-total').props.children).toBe('175.00');
		});
	});

	it('hides reservation summary when the filter is not an account or saving (KII-69)', async () => {
		useStore.setState({
			entities: [mockAccount, mockCategory, mockSaving],
			plans: [],
			transactions: [
				{
					id: 'tx-reservation',
					from_entity_id: 'account-1',
					to_entity_id: 'saving-1',
					amount_minor: 12500,
					currency: 'USD',
					timestamp: fixedNow - 60_000,
				},
			],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		setPendingHistoryFilter({ period: '2026-01', entityId: 'category-1' });

		const { queryByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(queryByTestId('reservation-summary')).toBeNull();
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
			amount_minor: 4431,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
			note: 'IKEA shelf',
		};

		const txWithoutNote: Transaction = {
			id: 'tx-plain',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 2000,
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

		setPendingHistoryFilter({ period: '2026-01' });

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
			amount_minor: 4431,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
		};

		const tx2: Transaction = {
			id: 'tx-b',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 2000,
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

		setPendingHistoryFilter({ period: '2026-01' });

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
			amount_minor: 5000,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
			note: 'rent',
		};

		const tx2: Transaction = {
			id: 'tx-b',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 2000,
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

		setPendingHistoryFilter({ period: '2026-01' });

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
			amount_minor: 5000,
			currency: 'USD',
			timestamp: fixedNow - 60_000,
			note: 'groceries at Lidl',
		};

		const txWrongEntity: Transaction = {
			id: 'tx-wrong-entity',
			from_entity_id: 'category-1',
			to_entity_id: 'account-1',
			amount_minor: 5000,
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
		setPendingHistoryFilter({ period: '2026-01', entityId: 'category-1' });

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
						amount_minor: 750000,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			setPendingHistoryFilter({ period: '2026-01', entityId: 'inv-account' });

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

			setPendingHistoryFilter({ period: '2026-01', entityId: 'inv-account' });

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
						amount_minor: 750000,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			setPendingHistoryFilter({ period: '2026-01', entityId: 'account-1' });

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
						amount_minor: 750000,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			setPendingHistoryFilter({ period: '2026-01' });

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
				amount_minor: 10000,
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
						amount_minor: 750000,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				currentPeriod: '2026-01',
				isLoading: false,
			});

			setPendingHistoryFilter({ period: '2026-01', entityId: 'inv-account' });

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
						amount_minor: 750000,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				updateMarketValueSnapshot,
				currentPeriod: '2026-01',
				isLoading: false,
			});

			setPendingHistoryFilter({ period: '2026-01', entityId: 'inv-account' });

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
					amount_minor: 810000,
					date: new Date(2026, 0, 10).setHours(0, 0, 0, 0),
				});
			});
		});
	});

	it('shows a derived future occurrence in the Upcoming section (KII-136)', async () => {
		// Template has no materialized rows — the Upcoming section can ONLY appear
		// if deriveVirtualOccurrences is wired into the screen.
		const templateStart = new Date('2026-01-20T12:00:00Z').getTime();
		useStore.setState({
			entities: [mockAccount, mockCategory],
			transactions: [],
			recurrenceTemplates: [
				{
					id: 'tpl-daily',
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount_minor: 4242,
					currency: 'USD',
					rule: JSON.stringify({ type: 'daily' }),
					start_date: templateStart,
					end_date: null,
					end_count: null,
					horizon: 90,
					exclusions: [],
					note: undefined,
					created_at: templateStart,
					is_deleted: false,
				},
			],
			plans: [],
			currentPeriod: '2026-01',
			isLoading: false,
		});

		setPendingHistoryFilter({ period: '2026-01' });

		const { getByText } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByText('Upcoming')).toBeTruthy();
		});
	});

	describe('Initial scroll position (KII-105)', () => {
		let scrollSpy: jest.SpyInstance;

		beforeEach(() => {
			scrollSpy = jest
				.spyOn(SectionList.prototype, 'scrollToLocation')
				.mockImplementation(() => {});
		});

		afterEach(() => {
			scrollSpy.mockRestore();
		});

		const pastTx: Transaction = {
			id: 'tx-past',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 10000,
			currency: 'USD',
			timestamp: new Date('2026-01-10T12:00:00Z').getTime(),
		};

		const upcomingTx: Transaction = {
			id: 'tx-upcoming',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
			currency: 'USD',
			timestamp: new Date('2026-01-20T12:00:00Z').getTime(),
		};

		const unconfirmedTx: Transaction = {
			id: 'tx-unconfirmed',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 5000,
			currency: 'USD',
			timestamp: new Date('2026-01-12T12:00:00Z').getTime(),
			is_confirmed: false,
		};

		it('skips Upcoming and lands on the first past section when no Needs Confirmation', async () => {
			useStore.setState({
				entities: [mockAccount, mockCategory],
				plans: [],
				transactions: [pastTx, upcomingTx],
				currentPeriod: '2026-01',
				isLoading: false,
			});
			setPendingHistoryFilter({ period: '2026-01' });

			const { getByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('row-tx-past')).toBeTruthy();
			});

			await waitFor(() => {
				expect(scrollSpy).toHaveBeenCalledWith(
					expect.objectContaining({ sectionIndex: 1, itemIndex: 0 })
				);
			});
		});

		it('skips Upcoming and lands on Needs Confirmation when both present', async () => {
			useStore.setState({
				entities: [mockAccount, mockCategory],
				plans: [],
				transactions: [pastTx, upcomingTx, unconfirmedTx],
				currentPeriod: '2026-01',
				isLoading: false,
			});
			setPendingHistoryFilter({ period: '2026-01' });

			const { getByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('row-tx-unconfirmed')).toBeTruthy();
			});

			// Upcoming is at index 0, Needs Confirmation at index 1.
			await waitFor(() => {
				expect(scrollSpy).toHaveBeenCalledWith(
					expect.objectContaining({ sectionIndex: 1, itemIndex: 0 })
				);
			});
		});

		it('does not scroll when only past transactions are visible', async () => {
			useStore.setState({
				entities: [mockAccount, mockCategory],
				plans: [],
				transactions: [pastTx],
				currentPeriod: '2026-01',
				isLoading: false,
			});
			setPendingHistoryFilter({ period: '2026-01' });

			const { getByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('row-tx-past')).toBeTruthy();
			});

			expect(scrollSpy).not.toHaveBeenCalled();
		});

		it('does not scroll when only Upcoming is visible', async () => {
			useStore.setState({
				entities: [mockAccount, mockCategory],
				plans: [],
				transactions: [upcomingTx],
				currentPeriod: '2026-01',
				isLoading: false,
			});
			setPendingHistoryFilter({ period: '2026-01' });

			const { getByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('row-tx-upcoming')).toBeTruthy();
			});

			expect(scrollSpy).not.toHaveBeenCalled();
		});

		it('does not scroll to a stale sectionIndex when the retry fires after sections shrink', async () => {
			// Regression: tapping a Summary row for a category/month with no
			// transactions used to crash with "scrollToIndex out of range".
			// The buggy retry captured `sections` in a closure at failure
			// time; once the filter shrank `sections`, the retry still asked
			// for sectionIndex=1 — out of range for the now-tiny list.
			useStore.setState({
				entities: [mockAccount, mockCategory],
				plans: [],
				transactions: [pastTx, upcomingTx],
				currentPeriod: '2026-01',
				isLoading: false,
			});
			setPendingHistoryFilter({ period: '2026-01' });

			const utils = render(<HistoryScreen />);
			const { getByTestId } = utils;

			await waitFor(() => {
				expect(getByTestId('row-tx-past')).toBeTruthy();
			});
			await waitFor(() => {
				expect(scrollSpy).toHaveBeenCalledWith(
					expect.objectContaining({ sectionIndex: 1, itemIndex: 0 })
				);
			});

			// Grab the failure handler while sections is still [Upcoming, Day].
			const list = utils.UNSAFE_root.findByType(SectionList);
			const onFail = list.props.onScrollToIndexFailed as (info: {
				index: number;
				highestMeasuredFrameIndex: number;
				averageItemLength: number;
			}) => void;
			expect(onFail).toBeDefined();

			// Schedule the retry. Bug: setTimeout closes over the current
			// (large) sections list.
			act(() => {
				onFail({ index: 1, highestMeasuredFrameIndex: 0, averageItemLength: 50 });
			});

			// Now navigate to a (period, entity) that has no matches —
			// sections becomes empty.
			act(() => {
				setPendingHistoryFilter({ period: '2025-08', entityId: 'category-1' });
				triggerFocus?.();
			});

			await waitFor(() => {
				expect(getByTestId('period-picker').props.children).toBe('2025-08');
				expect(getByTestId('entity-filter').props.children).toBe('category-1');
			});

			scrollSpy.mockClear();

			// Fire the pending retry. With the bug, the stale closure still
			// calls scrollToLocation({ sectionIndex: 1 }) — which maps to an
			// out-of-range flat index on the now-empty list.
			act(() => {
				jest.advanceTimersByTime(150);
			});

			expect(scrollSpy).not.toHaveBeenCalled();
		});

		it('re-applies scroll when the search query changes', async () => {
			// Both past and upcoming match "rent", so the section composition
			// stays Upcoming + past — target stays 1 but the user-input key
			// changes, which should re-fire the scroll.
			const pastRent: Transaction = { ...pastTx, id: 'tx-rent-past', note: 'rent april' };
			const upcomingRent: Transaction = {
				...upcomingTx,
				id: 'tx-rent-future',
				note: 'rent may',
			};
			useStore.setState({
				entities: [mockAccount, mockCategory],
				plans: [],
				transactions: [pastRent, upcomingRent],
				currentPeriod: '2026-01',
				isLoading: false,
			});
			setPendingHistoryFilter({ period: '2026-01' });

			const { getByPlaceholderText, getByTestId } = render(<HistoryScreen />);

			await waitFor(() => {
				expect(getByTestId('row-tx-rent-past')).toBeTruthy();
			});
			scrollSpy.mockClear();

			fireEvent.changeText(getByPlaceholderText('Search by note or amount'), 'rent');

			await waitFor(() => {
				expect(scrollSpy).toHaveBeenCalledWith(
					expect.objectContaining({ sectionIndex: 1, itemIndex: 0 })
				);
			});
		});
	});
});
