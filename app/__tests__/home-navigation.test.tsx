import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import HomeScreen from '../(tabs)/index';
import { useStore, useEntitiesWithBalance } from '@/src/store';
import type { EntityWithBalance } from '@/src/types';

const mockPush = jest.fn();

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
				data: any[];
				renderItem: (a: { item: any }) => React.ReactNode;
			}) => (
				<View>
					{data
						.filter((item: any) => item.id !== '__add_button__')
						.map((item: any) => (
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
		useSharedValue: (val: any) => ({ value: val }),
		makeMutable: (val: any) => ({ value: val }),
		useAnimatedReaction: jest.fn(),
		useAnimatedStyle: () => ({}),
		withTiming: (val: any) => val,
		withSpring: (val: any) => val,
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
	const { View, Text } = jest.requireActual('react-native');
	const Sortable = jest.requireMock('react-native-sortables').default;
	return {
		SortableEntityGrid: ({ entities, onTap, onLongPress }: any) => (
			<View>
				<Sortable.Grid
					data={entities}
					renderItem={({ item }: { item: any }) => (
						<Sortable.Touchable
							onTap={() => onTap?.(item)}
							onLongPress={() => onLongPress?.(item)}
						>
							<Text testID={`entity-${item.id}`}>{item.name}</Text>
						</Sortable.Touchable>
					)}
				/>
			</View>
		),
		SummaryHeader: () => null,
		TransactionModal: () => null,
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
	};
});

jest.mock('@/src/store', () => ({
	...jest.requireActual('@/src/store'),
	useEntitiesWithBalance: jest.fn(),
}));

describe('HomeScreen entity interactions', () => {
	const mockCategory: EntityWithBalance = {
		id: 'cat-1',
		type: 'category',
		name: 'Groceries',
		currency: 'EUR',
		icon: 'shopping-cart',
		order: 0,
		row: 0,
		position: 0,
		actual: 100,
		planned: 500,
		remaining: 400,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		useStore.setState({
			entities: [mockCategory],
			plans: [],
			transactions: [],
			currentPeriod: '2026-01',
			isLoading: false,
			draggedEntity: null,
			hoveredDropZoneId: null,
			incomeVisible: false,
			initialize: jest.fn(),
			addEntity: jest.fn(),
			setPlan: jest.fn(),
			setDraggedEntity: jest.fn(),
			toggleIncomeVisible: jest.fn(),
		});
		jest.mocked(useEntitiesWithBalance).mockImplementation((type) =>
			type === 'category' ? [mockCategory] : []
		);
	});

	it('navigates to history screen when tapping a category', async () => {
		const { getByTestId } = render(<HomeScreen />);

		fireEvent.press(getByTestId('entity-cat-1').parent!);

		await waitFor(() => {
			expect(mockPush).toHaveBeenCalledWith(
				expect.stringMatching(/\/history\?period=\d{4}-\d{2}&entityId=cat-1/)
			);
		});
	});

	it('opens edit modal when long-pressing a category', async () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		expect(queryByTestId('entity-detail-modal')).toBeNull();

		fireEvent(getByTestId('entity-cat-1').parent!, 'longPress');

		await waitFor(() => {
			expect(queryByTestId('entity-detail-modal')).toBeTruthy();
			expect(mockPush).not.toHaveBeenCalled();
		});
	});
});
