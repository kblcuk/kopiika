import React from 'react';
import { render } from '@testing-library/react-native';

import { SortableEntityBubble } from '../sortable-entity-bubble';
import { ENTITY_BUBBLE_NAME_LINES } from '@/src/constants/entities';
import type { EntityWithBalance } from '@/src/types';

jest.mock('react-native-sortables', () => {
	const { Pressable, View } = jest.requireActual('react-native');

	return {
		__esModule: true,
		default: {
			Handle: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
			Touchable: ({ children, onTap }: { children: React.ReactNode; onTap?: () => void }) => (
				<Pressable onPress={onTap}>{children}</Pressable>
			),
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
	it('allows entity names to wrap to two lines on dashboard bubbles', () => {
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

		const { getByText } = render(<SortableEntityBubble entity={entity} />);
		const label = getByText(entity.name);

		expect(label.props.numberOfLines).toBe(ENTITY_BUBBLE_NAME_LINES);
		expect(label.props.ellipsizeMode).toBe('tail');
		expect(label.props.style).toEqual(expect.objectContaining({ lineHeight: 14 }));
	});
});
