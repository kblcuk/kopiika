import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../(tabs)/index';
import { useStore } from '@/src/store';
import type { Entity, EntityWithBalance } from '@/src/types';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
}));

// Mock sortables - expose tap/longPress as press/longPress events
jest.mock('react-native-sortables', () => {
	const React = require('react');
	const { View, Pressable, Text } = require('react-native');
	return {
		__esModule: true,
		default: {
			PortalProvider: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
			Grid: ({ data, renderItem }: { data: any[]; renderItem: (args: { item: any }) => React.ReactNode }) => (
				<View>
					{data.filter((item: any) => item.id !== '__add_button__').map((item: any) => (
						<View key={item.id}>{renderItem({ item })}</View>
					))}
				</View>
			),
			Handle: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
			Touchable: ({ children, onTap, onLongPress }: { children: React.ReactNode; onTap?: () => void; onLongPress?: () => void }) => (
				<Pressable testID="entity-touchable" onPress={onTap} onLongPress={onLongPress}>{children}</Pressable>
			),
		},
	};
});

jest.mock('react-native-reanimated', () => {
	const React = require('react');
	const { View, ScrollView } = require('react-native');
	return {
		__esModule: true,
		default: { View, ScrollView: React.forwardRef((props: any, ref: any) => <ScrollView {...props} ref={ref} />) },
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
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/src/utils/drop-zone', () => ({
	registerDropZone: jest.fn(), unregisterDropZone: jest.fn(),
	registerRemeasureCallback: jest.fn(), unregisterRemeasureCallback: jest.fn(),
	findDropTarget: jest.fn(), remeasureAllDropZones: jest.fn(),
}));

// Mock components - SortableEntityGrid wires onTap/onLongPress to Sortable.Touchable
jest.mock('@/src/components', () => {
	const React = require('react');
	const { View, Pressable, Text } = require('react-native');
	const Sortable = require('react-native-sortables').default;

	return {
		SortableEntityGrid: ({ title, entities, onTap, onLongPress }: any) => (
			<View>
				<Text>{title}</Text>
				<Sortable.Grid
					data={entities}
					renderItem={({ item }: { item: any }) => (
						<Sortable.Touchable onTap={() => onTap?.(item)} onLongPress={() => onLongPress?.(item)}>
							<Text testID={`entity-${item.id}`}>{item.name}</Text>
						</Sortable.Touchable>
					)}
				/>
			</View>
		),
		SummaryHeader: () => null,
		TransactionModal: () => null,
		EntityDetailModal: ({ visible, entity }: { visible: boolean; entity: { name: string } | null }) =>
			visible ? <View testID="entity-detail-modal"><Text>{entity?.name}</Text></View> : null,
		EntityCreateModal: () => null,
	};
});

jest.mock('@/src/store', () => {
	const actual = jest.requireActual('@/src/store');
	return { ...actual, useEntitiesWithBalance: jest.fn() };
});

describe('HomeScreen entity interactions', () => {
	const mockCategory: EntityWithBalance = {
		id: 'cat-1', type: 'category', name: 'Groceries', currency: 'UAH',
		icon: 'shopping-cart', order: 0, row: 0, position: 0,
		actual: 100, planned: 500, remaining: 400,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		useStore.setState({
			entities: [mockCategory], plans: [], transactions: [],
			currentPeriod: '2026-01', isLoading: false, draggedEntity: null,
			hoveredDropZoneId: null, incomeVisible: false,
			initialize: jest.fn(), addEntity: jest.fn(), setPlan: jest.fn(),
			setDraggedEntity: jest.fn(), toggleIncomeVisible: jest.fn(),
		});
		const { useEntitiesWithBalance } = require('@/src/store');
		useEntitiesWithBalance.mockImplementation((type: string) =>
			type === 'category' ? [mockCategory] : []
		);
	});

	it('navigates to history screen when tapping a category', async () => {
		const { getByTestId } = render(<HomeScreen />);

		const entity = getByTestId('entity-cat-1');
		fireEvent.press(entity.parent!);

		await waitFor(() => {
			expect(mockPush).toHaveBeenCalledWith(
				expect.stringMatching(/\/history\?period=\d{4}-\d{2}&entityId=cat-1/)
			);
		});
	});

	it('opens edit modal when long-pressing a category', async () => {
		const { getByTestId, queryByTestId } = render(<HomeScreen />);

		expect(queryByTestId('entity-detail-modal')).toBeNull();

		const entity = getByTestId('entity-cat-1');
		fireEvent(entity.parent!, 'longPress');

		await waitFor(() => {
			expect(queryByTestId('entity-detail-modal')).toBeTruthy();
			expect(mockPush).not.toHaveBeenCalled();
		});
	});
});
