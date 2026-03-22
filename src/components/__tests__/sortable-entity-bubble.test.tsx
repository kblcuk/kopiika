import React from 'react';
import { render } from '@testing-library/react-native';

import { SortableEntityBubble } from '../sortable-entity-bubble';
import { ENTITY_BUBBLE_NAME_LINES } from '@/src/constants/entities';
import type { EntityWithBalance } from '@/src/types';

let latestHandleMode: 'draggable' | 'fixed-order' | 'non-draggable' | undefined;
let latestTouchableProps:
	| {
			onTap?: () => void;
			onTouchesDown?: () => void;
			onTouchesUp?: () => void;
	  }
	| undefined;

jest.mock('react-native-sortables', () => {
	const { Pressable, View } = jest.requireActual('react-native');

	return {
		__esModule: true,
		default: {
			Handle: ({
				children,
				mode,
			}: {
				children: React.ReactNode;
				mode?: 'draggable' | 'fixed-order' | 'non-draggable';
			}) => {
				latestHandleMode = mode;
				return <View>{children}</View>;
			},
			Touchable: ({
				children,
				onTap,
				onTouchesDown,
				onTouchesUp,
			}: {
				children: React.ReactNode;
				onTap?: () => void;
				onTouchesDown?: () => void;
				onTouchesUp?: () => void;
			}) => {
				latestTouchableProps = { onTap, onTouchesDown, onTouchesUp };
				return <Pressable onPress={onTap}>{children}</Pressable>;
			},
		},
	};
});

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-worklets', () => ({
	scheduleOnRN: jest.fn(),
}));

jest.mock('react-native-reanimated', () => {
	const { View } = jest.requireActual('react-native');

	return {
		__esModule: true,
		default: { View },
		useAnimatedStyle: () => ({}),
		useSharedValue: (value: number) => ({ value }),
		withTiming: (value: number) => value,
		withSpring: (value: number) => value,
		useAnimatedReaction: jest.fn(),
	};
});

jest.mock('../circular-progress', () => ({
	CircularProgress: () => null,
}));

jest.mock('@/src/constants/icon-registry', () => ({
	getIcon: () => () => null,
}));

describe('SortableEntityBubble', () => {
	const entity: EntityWithBalance = {
		id: 'saving-1',
		type: 'saving',
		name: 'Emergency fund buffer',
		currency: 'EUR',
		icon: 'shield',
		order: 0,
		row: 0,
		position: 0,
		actual: 1200,
		planned: 5000,
		remaining: 3800,
		upcoming: 0,
		reserved: 1200,
	};

	beforeEach(() => {
		latestHandleMode = undefined;
		latestTouchableProps = undefined;
	});

	it('allows entity names to wrap to two lines on dashboard bubbles', () => {
		const { getByText } = render(<SortableEntityBubble entity={entity} />);
		const label = getByText(entity.name);

		expect(label.props.numberOfLines).toBe(ENTITY_BUBBLE_NAME_LINES);
		expect(label.props.ellipsizeMode).toBe('tail');
		expect(label.props.style).toEqual(expect.objectContaining({ lineHeight: 14 }));
	});

	it('starts all bubbles as draggable (grid controls fixed-order via context)', () => {
		render(<SortableEntityBubble entity={entity} />);

		expect(latestHandleMode).toBe('draggable');
		// No touch-down/up mode flip — activation race eliminated
		expect(latestTouchableProps?.onTouchesDown).toBeUndefined();
		expect(latestTouchableProps?.onTouchesUp).toBeUndefined();
	});
});
