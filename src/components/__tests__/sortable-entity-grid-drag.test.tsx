import React from 'react';
import { render, act } from '@testing-library/react-native';

import { SortableEntityGrid } from '../sortable-entity-grid';
import type { EntityWithBalance } from '@/src/types';

// Capture Sortable.Grid's callbacks so tests can invoke them directly
let capturedGridProps: Record<string, any> = {};

jest.mock('react-native-sortables', () => {
	const { View } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			Grid: (props: any) => {
				capturedGridProps = props;
				return <View />;
			},
			Handle: ({ children }: any) => <View>{children}</View>,
			Touchable: ({ children }: any) => <View>{children}</View>,
		},
	};
});

jest.mock('react-native-reanimated', () => {
	const { View, ScrollView } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: { View, ScrollView },
		useAnimatedRef: () => ({ current: null }),
		makeMutable: (val: any) => ({ value: val }),
		useSharedValue: (val: any) => ({ value: val }),
		useAnimatedReaction: jest.fn(),
		useAnimatedStyle: () => ({}),
		withTiming: (val: any) => val,
		withSpring: (val: any) => val,
	};
});

jest.mock('react-native-worklets', () => ({
	scheduleOnRN: jest.fn((fn) => fn()),
}));

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('@/src/utils/drop-zone', () => ({
	registerDropZone: jest.fn(),
	unregisterDropZone: jest.fn(),
	registerRemeasureCallback: jest.fn(),
	unregisterRemeasureCallback: jest.fn(),
	findDropTarget: jest.fn(),
	remeasureAllDropZones: jest.fn(),
}));

jest.mock('@/src/store', () => ({
	useStore: Object.assign(
		(selector: any) =>
			selector({
				reorderEntitiesByIds: jest.fn(),
			}),
		{
			getState: () => ({
				entities: [],
			}),
		}
	),
}));

jest.mock('@/src/constants/icon-registry', () => ({
	getIcon: () => () => null,
}));

jest.mock('../circular-progress', () => ({
	CircularProgress: () => null,
}));

describe('SortableEntityGrid drag lifecycle (KII-76)', () => {
	const entities: EntityWithBalance[] = [
		{
			id: 'acc-1',
			type: 'account',
			name: 'Checking',
			currency: 'EUR',
			icon: 'wallet',
			order: 0,
			row: 0,
			position: 0,
			actual: 1000,
			planned: 1000,
			remaining: 0,
			upcoming: 0,
		},
		{
			id: 'acc-2',
			type: 'account',
			name: 'Savings',
			currency: 'EUR',
			icon: 'piggy-bank',
			order: 1,
			row: 0,
			position: 1,
			actual: 5000,
			planned: 5000,
			remaining: 0,
			upcoming: 0,
		},
	];

	let rafCallbacks: (() => void)[];
	const onDragStart = jest.fn();
	const onDragEnd = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		rafCallbacks = [];
		jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
			rafCallbacks.push(cb as () => void);
			return rafCallbacks.length;
		});
		capturedGridProps = {};
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('defers onDragStart callback to next frame to avoid gesture cancellation', () => {
		render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={entities}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				dragBehavior="transaction"
				updateDragTouch={jest.fn()}
			/>
		);

		act(() => {
			capturedGridProps.onDragStart({ key: 'acc-1' });
		});

		// Parent callback must NOT fire synchronously — doing so re-renders all
		// grid children mid-gesture and causes react-native-sortables to drop it
		expect(onDragStart).not.toHaveBeenCalled();

		act(() => {
			rafCallbacks.forEach((cb) => cb());
		});

		expect(onDragStart).toHaveBeenCalledTimes(1);
	});

	it('skips deferred callback when drag ends before next frame', () => {
		render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={entities}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				dragBehavior="transaction"
				updateDragTouch={jest.fn()}
			/>
		);

		act(() => {
			capturedGridProps.onDragStart({ key: 'acc-1' });
		});

		// Drag cancelled by library before RAF fires
		act(() => {
			capturedGridProps.onDragEnd({ data: entities });
		});

		// RAF guard (draggedIdRef cleared) must prevent the stale callback
		act(() => {
			rafCallbacks.forEach((cb) => cb());
		});

		expect(onDragStart).not.toHaveBeenCalled();
	});
});
