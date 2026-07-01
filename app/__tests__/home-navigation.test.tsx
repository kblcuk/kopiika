import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import HomeScreen from '../(tabs)/index';
import { useStore, useEntitiesWithBalance } from '@/src/store';
import { consumePendingHistoryFilter } from '@/src/utils/history-nav-signal';
import type { EntityWithBalance, EntityType, Transaction } from '@/src/types';

const mockPush = jest.fn();

// Captured from the mocked SortableEntityGrid so drag-routing tests can fire a
// drop directly (the screen passes the same handlers to every section).
const mockDragHandlers: {
	onDragStart?: (entity: EntityWithBalance) => void;
	onDragEnd?: (entity: EntityWithBalance, targetId: string | null) => void;
} = {};
// Captured from the mocked RefundPickerModal to drive the refund→edit handoff.
let mockRefundOnSelect: ((transaction: Transaction) => void) | undefined;

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-sortables', () => {
	const { View, Pressable } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			PortalProvider: ({ children }: { children: React.ReactNode }) => (
				<View>{children}</View>
			),
			Grid: ({
				data,
				renderItem,
			}: {
				data: EntityWithBalance[];
				renderItem: (a: { item: EntityWithBalance }) => React.ReactNode;
			}) => (
				<View>
					{data
						.filter((item) => item.id !== '__add_button__')
						.map((item) => (
							<View key={item.id}>{renderItem({ item })}</View>
						))}
				</View>
			),
			Handle: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
			Touchable: ({
				children,
				onTap,
				onLongPress,
			}: {
				children: React.ReactNode;
				onTap?: () => void;
				onLongPress?: () => void;
			}) => (
				<Pressable testID="entity-touchable" onPress={onTap} onLongPress={onLongPress}>
					{children}
				</Pressable>
			),
		},
	};
});

jest.mock('react-native-reanimated', () => {
	const RN = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: { View: RN.View, ScrollView: RN.ScrollView },
		useAnimatedRef: () => ({ current: null }),
		useSharedValue: <T,>(val: T) => ({ value: val }),
		useScrollOffset: () => ({ value: 0 }),
		useAnimatedScrollHandler: () => jest.fn(),
		useFrameCallback: () => ({ setActive: jest.fn() }),
		scrollTo: jest.fn(),
		runOnJS: <T,>(fn: T) => fn,
		makeMutable: <T,>(val: T) => ({ value: val }),
		useAnimatedReaction: jest.fn(),
		useAnimatedStyle: () => ({}),
		withTiming: <T,>(val: T) => val,
		withSpring: <T,>(val: T) => val,
		Easing: { out: () => (x: number) => x, cubic: (x: number) => x },
	};
});

jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn((fn) => fn()) }));
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/src/utils/drop-zone', () => ({
	registerDropZone: jest.fn(),
	unregisterDropZone: jest.fn(),
	registerRemeasureCallback: jest.fn(),
	unregisterRemeasureCallback: jest.fn(),
	findDropTarget: jest.fn(),
	remeasureAllDropZones: jest.fn(),
}));

jest.mock('@/src/components', () => {
	const { View, Text, Pressable } = jest.requireActual('react-native');
	const Sortable = jest.requireMock('react-native-sortables').default;
	return {
		SortableEntityGrid: ({
			entities,
			onTap,
			onDragStart,
			onDragEnd,
			onToggleEditMode,
			editMode,
			type,
			dragBehavior,
		}: {
			entities: EntityWithBalance[];
			onTap?: (entity: EntityWithBalance) => void;
			onDragStart?: (entity: EntityWithBalance) => void;
			onDragEnd?: (entity: EntityWithBalance, targetId: string | null) => void;
			onToggleEditMode?: () => void;
			editMode?: boolean;
			type: EntityType;
			dragBehavior?: 'transaction' | 'reorder';
		}) => {
			// Every section receives the same screen-level handlers; capture them
			// so tests can simulate a drop without a real gesture.
			mockDragHandlers.onDragStart = onDragStart;
			mockDragHandlers.onDragEnd = onDragEnd;
			return (
				<View>
					{onToggleEditMode ? (
						<Pressable testID={`${type}-edit-toggle`} onPress={onToggleEditMode}>
							<Text>{editMode ? 'edit-on' : 'edit-off'}</Text>
						</Pressable>
					) : null}
					<Text testID={`${type}-drag-behavior`}>{dragBehavior}</Text>
					<Sortable.Grid
						data={entities}
						renderItem={({ item }: { item: EntityWithBalance }) => (
							<Sortable.Touchable onTap={() => onTap?.(item)}>
								<Text testID={`entity-${item.id}`}>{item.name}</Text>
							</Sortable.Touchable>
						)}
					/>
				</View>
			);
		},
		SummaryHeader: () => null,
		TransactionModal: ({
			visible,
			fromEntity,
			toEntity,
			existingTransaction,
		}: {
			visible: boolean;
			fromEntity: { id: string } | null;
			toEntity: { id: string } | null;
			existingTransaction?: { id: string };
		}) =>
			visible ? (
				<View testID="transaction-modal">
					<Text testID="transaction-modal-from">{fromEntity?.id ?? ''}</Text>
					<Text testID="transaction-modal-to">{toEntity?.id ?? ''}</Text>
					<Text testID="transaction-modal-existing">{existingTransaction?.id ?? ''}</Text>
				</View>
			) : null,
		EntityDetailModal: ({
			visible,
			entity,
		}: {
			visible: boolean;
			entity: { name: string } | null;
		}) =>
			visible ? (
				<View testID="entity-detail-modal">
					<Text>{entity?.name}</Text>
				</View>
			) : null,
		EntityCreateModal: () => null,
		EmptyBoardNudge: () => null,
		ReservationModal: ({
			visible,
			account,
			saving,
		}: {
			visible: boolean;
			account: { id: string } | null;
			saving: { id: string } | null;
		}) =>
			visible ? (
				<View testID="reservation-modal">
					<Text testID="reservation-account">{account?.id ?? ''}</Text>
					<Text testID="reservation-saving">{saving?.id ?? ''}</Text>
				</View>
			) : null,
		RefundPickerModal: ({
			visible,
			originalFrom,
			originalTo,
			onSelect,
		}: {
			visible: boolean;
			originalFrom: { id: string } | null;
			originalTo: { id: string } | null;
			onSelect: (transaction: Transaction) => void;
		}) => {
			mockRefundOnSelect = onSelect;
			return visible ? (
				<View testID="refund-picker">
					<Text testID="refund-original-from">{originalFrom?.id ?? ''}</Text>
					<Text testID="refund-original-to">{originalTo?.id ?? ''}</Text>
				</View>
			) : null;
		},
	};
});

jest.mock('@/src/store', () => ({
	...jest.requireActual('@/src/store'),
	useEntitiesWithBalance: jest.fn(),
}));

describe('HomeScreen entity interactions', () => {
	const mockInitialize = jest.fn();
	const mockCategory: EntityWithBalance = {
		id: 'cat-1',
		type: 'category',
		name: 'Groceries',
		currency: 'EUR',
		icon: 'shopping-cart',
		row: 0,
		position: 0,
		actual: 100,
		planned: 500,
		remaining: 400,

		upcoming: 0,
	};
	const mockAccount: EntityWithBalance = {
		id: 'acc-1',
		type: 'account',
		name: 'Checking',
		currency: 'EUR',
		icon: 'wallet',
		row: 0,
		position: 1,
		actual: 1000,
		planned: 1000,
		remaining: 0,
		upcoming: 0,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockInitialize.mockReset();
		useStore.setState({
			entities: [mockCategory, mockAccount],
			plans: [],
			transactions: [],
			currentPeriod: '2026-01',
			isLoading: false,
			draggedEntity: null,
			incomeVisible: false,
			initialize: mockInitialize,
			addEntity: jest.fn(),
			setPlan: jest.fn(),
			setDraggedEntity: jest.fn(),
			toggleIncomeVisible: jest.fn(),
		});
		jest.mocked(useEntitiesWithBalance).mockImplementation((type) => {
			if (type === 'category') return [mockCategory];
			if (type === 'account') return [mockAccount];
			return [];
		});
	});

	it('does not re-initialize the store on mount', () => {
		render(<HomeScreen />);

		expect(mockInitialize).not.toHaveBeenCalled();
	});

	it('navigates to history screen when tapping a category', async () => {
		consumePendingHistoryFilter();
		const { getByTestId } = render(<HomeScreen />);

		fireEvent.press(getByTestId('entity-cat-1').parent!);

		await waitFor(() => {
			expect(mockPush).toHaveBeenCalledWith('/history');
		});
		expect(consumePendingHistoryFilter()).toEqual({ entityId: 'cat-1' });
	});

	it('opens edit modal when tapping category in categories edit mode', async () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		expect(queryByTestId('entity-detail-modal')).toBeNull();

		fireEvent.press(getByTestId('category-edit-toggle'));
		fireEvent.press(getByTestId('entity-cat-1').parent!);

		await waitFor(() => {
			expect(queryByTestId('entity-detail-modal')).toBeTruthy();
			expect(mockPush).not.toHaveBeenCalled();
		});
	});

	it('opens edit modal when tapping account in accounts edit mode', async () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		expect(queryByTestId('entity-detail-modal')).toBeNull();

		fireEvent.press(getByTestId('account-edit-toggle'));
		fireEvent.press(getByTestId('entity-acc-1').parent!);

		await waitFor(() => {
			expect(queryByTestId('entity-detail-modal')).toBeTruthy();
			expect(mockPush).not.toHaveBeenCalled();
		});
	});

	it('toggling a section edit mode flips its drag behavior to reorder', () => {
		const { getByTestId } = render(<HomeScreen />);

		expect(getByTestId('account-drag-behavior')).toHaveTextContent('transaction');

		fireEvent.press(getByTestId('account-edit-toggle'));

		expect(getByTestId('account-drag-behavior')).toHaveTextContent('reorder');
	});
});

// Characterization tests for handleDragEnd's drop routing. These assert the
// observable outcome (which flow modal opens) for each entity-type pair, so they
// hold identically before and after the routing logic moves into use-board-flows.
describe('HomeScreen drag-drop routing', () => {
	const income: EntityWithBalance = {
		id: 'inc-1',
		type: 'income',
		name: 'Salary',
		currency: 'EUR',
		icon: 'banknote',
		row: 0,
		position: 0,
		actual: 0,
		planned: 0,
		remaining: 0,
		upcoming: 0,
	};
	const account: EntityWithBalance = {
		id: 'acc-1',
		type: 'account',
		name: 'Checking',
		currency: 'EUR',
		icon: 'wallet',
		row: 0,
		position: 0,
		actual: 1000,
		planned: 1000,
		remaining: 0,
		upcoming: 0,
	};
	const category: EntityWithBalance = {
		id: 'cat-1',
		type: 'category',
		name: 'Groceries',
		currency: 'EUR',
		icon: 'shopping-cart',
		row: 0,
		position: 0,
		actual: 100,
		planned: 500,
		remaining: 400,
		upcoming: 0,
	};
	const saving: EntityWithBalance = {
		id: 'sav-1',
		type: 'saving',
		name: 'Emergency',
		currency: 'EUR',
		icon: 'piggy-bank',
		row: 0,
		position: 0,
		actual: 0,
		planned: 2000,
		remaining: 2000,
		upcoming: 0,
	};

	const drop = (entity: EntityWithBalance, targetId: string | null) => {
		act(() => {
			mockDragHandlers.onDragEnd?.(entity, targetId);
		});
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockDragHandlers.onDragStart = undefined;
		mockDragHandlers.onDragEnd = undefined;
		mockRefundOnSelect = undefined;
		useStore.setState({
			entities: [income, account, category, saving],
			plans: [],
			transactions: [],
			currentPeriod: '2026-01',
			isLoading: false,
			draggedEntity: null,
			incomeVisible: true,
			initialize: jest.fn(),
			addEntity: jest.fn(),
			setPlan: jest.fn(),
			setDraggedEntity: jest.fn(),
			toggleIncomeVisible: jest.fn(),
		});
		jest.mocked(useEntitiesWithBalance).mockImplementation((type) => {
			if (type === 'income') return [income];
			if (type === 'account') return [account];
			if (type === 'category') return [category];
			if (type === 'saving') return [saving];
			return [];
		});
	});

	it('account → category: opens the transaction modal from account to category', () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		drop(account, category.id);

		expect(queryByTestId('transaction-modal')).toBeTruthy();
		expect(getByTestId('transaction-modal-from')).toHaveTextContent('acc-1');
		expect(getByTestId('transaction-modal-to')).toHaveTextContent('cat-1');
		expect(queryByTestId('refund-picker')).toBeNull();
		expect(queryByTestId('reservation-modal')).toBeNull();
	});

	it('category → account: opens the refund picker (reversed account → category)', () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		drop(category, account.id);

		expect(queryByTestId('refund-picker')).toBeTruthy();
		expect(getByTestId('refund-original-from')).toHaveTextContent('acc-1');
		expect(getByTestId('refund-original-to')).toHaveTextContent('cat-1');
		expect(queryByTestId('transaction-modal')).toBeNull();
	});

	it('account → income: opens the refund picker (reversed income → account)', () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		drop(account, income.id);

		expect(queryByTestId('refund-picker')).toBeTruthy();
		expect(getByTestId('refund-original-from')).toHaveTextContent('inc-1');
		expect(getByTestId('refund-original-to')).toHaveTextContent('acc-1');
		expect(queryByTestId('transaction-modal')).toBeNull();
	});

	it('account → saving: opens the reservation modal, not the transaction modal', () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		drop(account, saving.id);

		expect(queryByTestId('reservation-modal')).toBeTruthy();
		expect(getByTestId('reservation-account')).toHaveTextContent('acc-1');
		expect(getByTestId('reservation-saving')).toHaveTextContent('sav-1');
		expect(queryByTestId('transaction-modal')).toBeNull();
	});

	it('drop on itself: opens no flow modal', () => {
		const { queryByTestId } = render(<HomeScreen />);

		drop(account, account.id);

		expect(queryByTestId('transaction-modal')).toBeNull();
		expect(queryByTestId('refund-picker')).toBeNull();
		expect(queryByTestId('reservation-modal')).toBeNull();
	});

	it('drop with no target: opens no flow modal', () => {
		const { queryByTestId } = render(<HomeScreen />);

		drop(account, null);

		expect(queryByTestId('transaction-modal')).toBeNull();
		expect(queryByTestId('refund-picker')).toBeNull();
		expect(queryByTestId('reservation-modal')).toBeNull();
	});

	it('refund select: hands the chosen transaction off to the transaction modal', () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		// Open the refund picker via category → account.
		drop(category, account.id);
		expect(queryByTestId('refund-picker')).toBeTruthy();

		// Picking a transaction closes the picker and opens the edit modal carrying it.
		const chosen: Transaction = {
			id: 'txn-99',
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 4200,
			currency: 'EUR',
			timestamp: 1735689600000,
		};
		act(() => {
			mockRefundOnSelect?.(chosen);
		});

		expect(queryByTestId('refund-picker')).toBeNull();
		expect(queryByTestId('transaction-modal')).toBeTruthy();
		expect(getByTestId('transaction-modal-existing')).toHaveTextContent('txn-99');
		expect(getByTestId('transaction-modal-from')).toHaveTextContent('acc-1');
		expect(getByTestId('transaction-modal-to')).toHaveTextContent('cat-1');
	});
});
