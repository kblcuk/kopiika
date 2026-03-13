import React from 'react';
import { act, render } from '@testing-library/react-native';

import { SortableEntityGrid } from '../sortable-entity-grid';
import type { EntityWithBalance } from '@/src/types';

const mockReorderEntitiesByIds = jest.fn();
const mockFindDropTarget = jest.fn();
let mockStoreEntities: EntityWithBalance[] = [];
let latestGridProps: {
	onDragStart: (event: { key: string }) => void;
	onDragMove: (event: { touchData: { absoluteX: number; absoluteY: number } }) => void;
	onDragEnd: (event: { data: EntityWithBalance[] }) => void;
} | null = null;

jest.mock('react-native-sortables', () => {
	const { View } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			Grid: (props: typeof latestGridProps & { data: EntityWithBalance[] }) => {
				latestGridProps = props;
				return <View testID="sortable-grid" />;
			},
			Handle: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
			Touchable: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
		},
	};
});

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { ScrollView: 'ScrollView' },
	useAnimatedRef: () => ({ current: null }),
	makeMutable: (value: string) => ({ value }),
}));

jest.mock('@/src/utils/drop-zone', () => ({
	findDropTarget: (...args: Parameters<typeof mockFindDropTarget>) => mockFindDropTarget(...args),
	registerDropZone: jest.fn(),
	unregisterDropZone: jest.fn(),
	registerRemeasureCallback: jest.fn(),
	unregisterRemeasureCallback: jest.fn(),
}));

jest.mock('@/src/utils/drag-bounds', () => ({
	shouldUseFixedOrderMode: jest.fn(() => false),
}));

jest.mock('@/src/store', () => {
	const useStore = Object.assign(
		jest.fn(
			(
				selector: (state: {
					reorderEntitiesByIds: typeof mockReorderEntitiesByIds;
				}) => unknown
			) => selector({ reorderEntitiesByIds: mockReorderEntitiesByIds })
		),
		{
			getState: jest.fn(() => ({ entities: mockStoreEntities })),
		}
	);

	return { useStore };
});

jest.mock('../add-entity-bubble', () => ({
	AddEntityBubble: () => null,
}));

jest.mock('../sortable-entity-bubble', () => {
	const React = jest.requireActual('react');
	const { View, Text } = jest.requireActual('react-native');
	return {
		SortableEntityBubble: ({ entity }: { entity: EntityWithBalance }) => (
			<View>
				<Text>{entity.name}</Text>
			</View>
		),
		HoveredIdContext: React.createContext(null),
		FixedOrderContext: React.createContext(null),
	};
});

describe('SortableEntityGrid', () => {
	const accountA: EntityWithBalance = {
		id: 'acc-1',
		type: 'account',
		name: 'Checking',
		currency: 'EUR',
		icon: 'wallet',
		order: 0,
		row: 0,
		position: 0,
		actual: 1200,
		planned: 0,
		remaining: 0,
		upcoming: 0,
		reserved: 0,
	};
	const accountB: EntityWithBalance = {
		...accountA,
		id: 'acc-2',
		name: 'Savings Buffer',
		position: 1,
	};
	const category: EntityWithBalance = {
		id: 'cat-1',
		type: 'category',
		name: 'Groceries',
		currency: 'EUR',
		icon: 'shopping-cart',
		order: 0,
		row: 0,
		position: 0,
		actual: 50,
		planned: 300,
		remaining: 250,
		upcoming: 0,
	};

	const renderGrid = (props: Partial<React.ComponentProps<typeof SortableEntityGrid>> = {}) => {
		const onDragEnd = jest.fn();
		const onDragStart = jest.fn();

		render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[accountA, accountB]}
				maxRows={1}
				dropZonesDisabled={true}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				{...props}
			/>
		);

		if (!latestGridProps) {
			throw new Error('Sortable.Grid props were not captured');
		}

		return { onDragEnd, onDragStart };
	};

	beforeEach(() => {
		jest.clearAllMocks();
		latestGridProps = null;
		mockStoreEntities = [accountA, accountB, category];
		mockFindDropTarget.mockReturnValue(null);
	});

	it('does not persist same-section reorder while in transaction mode', () => {
		const { onDragEnd } = renderGrid({ dragBehavior: 'transaction' });

		act(() => {
			latestGridProps?.onDragStart({ key: accountA.id });
			latestGridProps?.onDragEnd({ data: [accountB, accountA] });
		});

		expect(mockReorderEntitiesByIds).not.toHaveBeenCalled();
		expect(onDragEnd).toHaveBeenCalledWith(accountA, null);
	});

	it('reorders entities when edit mode enables reorder dragging', () => {
		const { onDragEnd } = renderGrid({ dragBehavior: 'reorder' });

		act(() => {
			latestGridProps?.onDragStart({ key: accountA.id });
			latestGridProps?.onDragEnd({ data: [accountB, accountA] });
		});

		expect(mockReorderEntitiesByIds).toHaveBeenCalledWith('account', ['acc-2', 'acc-1'], 1);
		expect(onDragEnd).toHaveBeenCalledWith(accountA, null);
	});

	it('keeps edit-mode drags local instead of creating cross-section transactions', () => {
		const { onDragEnd } = renderGrid({ dragBehavior: 'reorder' });
		mockFindDropTarget.mockReturnValue(category.id);

		act(() => {
			latestGridProps?.onDragStart({ key: accountA.id });
			latestGridProps?.onDragMove({ touchData: { absoluteX: 20, absoluteY: 30 } });
			latestGridProps?.onDragEnd({ data: [accountB, accountA] });
		});

		expect(mockReorderEntitiesByIds).toHaveBeenCalledWith('account', ['acc-2', 'acc-1'], 1);
		expect(onDragEnd).toHaveBeenCalledWith(accountA, null);
		expect(onDragEnd).not.toHaveBeenCalledWith(accountA, category.id);
	});
});
