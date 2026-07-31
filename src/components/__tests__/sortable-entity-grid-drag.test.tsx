import React from 'react';
import { render, act } from '@testing-library/react-native';

import { SortableEntityGrid } from '../sortable-entity-grid';
import type { EntityWithBalance } from '@/src/types';

// Capture Sortable.Grid's callbacks so tests can invoke them directly
type GridMockProps = {
	onDragStart: (e: { key: string }) => void;
	onDragMove: (e: { touchData: { absoluteX: number; absoluteY: number } }) => void;
	onDragEnd: (e: { data: EntityWithBalance[] }) => void;
};
let capturedGridProps = {} as GridMockProps;

jest.mock('react-native-sortables', () => {
	const { View } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			Grid: (props: GridMockProps) => {
				capturedGridProps = props;
				return <View />;
			},
			Handle: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
			Touchable: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
		},
	};
});

jest.mock('react-native-reanimated', () => {
	const { View, ScrollView } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: { View, ScrollView },
		useAnimatedRef: () => ({ current: null }),
		makeMutable: <T,>(val: T) => ({ value: val }),
		useSharedValue: <T,>(val: T) => ({ value: val }),
		useAnimatedReaction: jest.fn(),
		useAnimatedStyle: () => ({}),
		withTiming: <T,>(val: T) => val,
		withSpring: <T,>(val: T) => val,
		// useCollapseAnimation builds its timing config at module scope.
		Easing: { out: () => (x: number) => x, cubic: (x: number) => x },
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
		<T,>(selector: (state: { reorderEntitiesByIds: jest.Mock }) => T) =>
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
		capturedGridProps = {} as GridMockProps;
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

	describe('long-press detection (KII-154)', () => {
		const onLongPress = jest.fn();

		function renderGrid(dragBehavior: 'transaction' | 'reorder' = 'transaction') {
			return render(
				<SortableEntityGrid
					title="Accounts"
					type="account"
					entities={entities}
					onDragStart={onDragStart}
					onDragEnd={onDragEnd}
					onLongPress={onLongPress}
					dragBehavior={dragBehavior}
					updateDragTouch={jest.fn()}
				/>
			);
		}

		beforeEach(() => {
			onLongPress.mockClear();
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it('fires onLongPress when the finger is held in place and released', () => {
			renderGrid();

			act(() => {
				capturedGridProps.onDragStart({ key: 'acc-1' });
			});
			act(() => {
				capturedGridProps.onDragMove({ touchData: { absoluteX: 100, absoluteY: 200 } });
			});
			act(() => {
				jest.advanceTimersByTime(450);
			});
			act(() => {
				capturedGridProps.onDragEnd({ data: entities });
			});

			expect(onLongPress).toHaveBeenCalledTimes(1);
			expect(onLongPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }));
		});

		it('runs the onDragEnd teardown before navigating away', () => {
			renderGrid();

			act(() => {
				capturedGridProps.onDragStart({ key: 'acc-1' });
			});
			act(() => {
				jest.advanceTimersByTime(450);
			});
			act(() => {
				capturedGridProps.onDragEnd({ data: entities });
			});

			expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }), null);
			expect(onDragEnd.mock.invocationCallOrder[0]!).toBeLessThan(
				onLongPress.mock.invocationCallOrder[0]!
			);
		});

		it('does not fire onLongPress when released before the arm delay', () => {
			renderGrid();

			act(() => {
				capturedGridProps.onDragStart({ key: 'acc-1' });
			});
			act(() => {
				jest.advanceTimersByTime(449);
			});
			act(() => {
				capturedGridProps.onDragEnd({ data: entities });
			});

			expect(onLongPress).not.toHaveBeenCalled();
		});

		it('does not fire onLongPress when the finger moved past tolerance', () => {
			renderGrid();

			act(() => {
				capturedGridProps.onDragStart({ key: 'acc-1' });
			});
			act(() => {
				capturedGridProps.onDragMove({ touchData: { absoluteX: 100, absoluteY: 200 } });
				capturedGridProps.onDragMove({ touchData: { absoluteX: 180, absoluteY: 200 } });
			});
			act(() => {
				jest.advanceTimersByTime(450);
			});
			act(() => {
				capturedGridProps.onDragEnd({ data: entities });
			});

			expect(onLongPress).not.toHaveBeenCalled();
		});

		it('never arms in reorder (edit) mode', () => {
			renderGrid('reorder');

			act(() => {
				capturedGridProps.onDragStart({ key: 'acc-1' });
			});
			act(() => {
				jest.advanceTimersByTime(450);
			});
			act(() => {
				capturedGridProps.onDragEnd({ data: entities });
			});

			expect(onLongPress).not.toHaveBeenCalled();
		});
	});
});
