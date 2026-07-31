import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SortableEntityGrid } from '../sortable-entity-grid';
import { registerRemeasureCallback } from '@/src/utils/drop-zone';
import { TestIDs } from '@/e2e/support/test-ids';
import type { EntityWithBalance } from '@/src/types';

jest.mock('react-native-sortables', () => {
	const { View } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			Grid: ({
				data,
				renderItem,
			}: {
				data: EntityWithBalance[];
				renderItem: (a: { item: EntityWithBalance }) => React.ReactNode;
			}) => (
				<View>
					{data.map((item) => (
						<View key={item.id}>{renderItem({ item })}</View>
					))}
				</View>
			),
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
		useAnimatedStyle: (fn: () => unknown) => fn(),
		withTiming: <T,>(val: T) => val,
		withSpring: <T,>(val: T) => val,
		Easing: { out: () => (x: number) => x, cubic: (x: number) => x },
	};
});

jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn((fn) => fn()) }));

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
			selector({ reorderEntitiesByIds: jest.fn() }),
		{ getState: () => ({ entities: [] }) }
	),
}));

const account: EntityWithBalance = {
	id: 'acc-1',
	type: 'account',
	name: 'Main Card',
	currency: 'USD',
	row: 0,
	position: 0,
	planned: 0,
	actual: 0,
	remaining: 0,
	upcoming: 0,
};

describe('SortableEntityGrid collapse', () => {
	beforeEach(() => jest.clearAllMocks());

	it('toggles when the header row is tapped', () => {
		const onToggleCollapsed = jest.fn();
		const { getByTestId } = render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[account]}
				collapsed={false}
				onToggleCollapsed={onToggleCollapsed}
			/>
		);

		fireEvent.press(getByTestId(TestIDs.sectionCollapseToggle('account')));

		expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
	});

	it('does not toggle collapse when the edit pencil is tapped', () => {
		const onToggleCollapsed = jest.fn();
		const onToggleEditMode = jest.fn();
		const { getByTestId } = render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[account]}
				collapsed={false}
				onToggleCollapsed={onToggleCollapsed}
				onToggleEditMode={onToggleEditMode}
			/>
		);

		fireEvent.press(getByTestId(TestIDs.sectionEditToggle('account')));

		expect(onToggleEditMode).toHaveBeenCalledTimes(1);
		expect(onToggleCollapsed).not.toHaveBeenCalled();
	});

	// `registerDropZone` itself is unreachable here — it fires from a
	// measureInWindow callback the test renderer never invokes — so these assert
	// on the registration the effect performs synchronously.
	it('registers no drop-zone machinery while collapsed', () => {
		render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[account]}
				collapsed={true}
				onToggleCollapsed={jest.fn()}
			/>
		);

		expect(registerRemeasureCallback).not.toHaveBeenCalled();
	});

	it('registers drop-zone machinery while expanded', () => {
		render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[account]}
				collapsed={false}
				onToggleCollapsed={jest.fn()}
			/>
		);

		expect(registerRemeasureCallback).toHaveBeenCalledWith(
			'grid-account',
			expect.any(Function)
		);
	});

	it('makes collapsed content non-interactive', () => {
		const { getByTestId } = render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[account]}
				collapsed={true}
				onToggleCollapsed={jest.fn()}
			/>
		);

		expect(getByTestId('section-content-account').props.pointerEvents).toBe('none');
	});

	it('keeps content interactive while expanded', () => {
		const { getByTestId } = render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[account]}
				collapsed={false}
				onToggleCollapsed={jest.fn()}
			/>
		);

		expect(getByTestId('section-content-account').props.pointerEvents).toBe('auto');
	});

	// The header row always exists — it is the section's divider. What marks a
	// section as collapsible is the action its header announces.
	it('announces the action the header performs', () => {
		const { getByLabelText, rerender } = render(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[account]}
				collapsed={false}
				onToggleCollapsed={jest.fn()}
			/>
		);

		expect(getByLabelText('Collapse Accounts')).toBeTruthy();

		rerender(
			<SortableEntityGrid
				title="Accounts"
				type="account"
				entities={[account]}
				collapsed={true}
				onToggleCollapsed={jest.fn()}
			/>
		);

		expect(getByLabelText('Expand Accounts')).toBeTruthy();
	});

	it('renders a static header when the section is not collapsible', () => {
		const { queryByLabelText } = render(
			<SortableEntityGrid title="Accounts" type="account" entities={[account]} />
		);

		expect(queryByLabelText(/^(Collapse|Expand) Accounts$/)).toBeNull();
	});
});
