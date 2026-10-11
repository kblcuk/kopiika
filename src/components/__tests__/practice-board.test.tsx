import React from 'react';
import { Text } from 'react-native';
import * as ReactNative from 'react-native';
import { render } from '@testing-library/react-native';
import { PracticeBoard } from '../practice-board';
import { createPracticeSession, getPracticeEntities } from '@/src/onboarding/practice-session';
import { createDropZoneRegistry } from '@/src/utils/drop-zone';

jest.mock('react-native-sortables', () => {
	const { View } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			PortalProvider: ({ children }: { children: React.ReactNode }) => (
				<View testID="drag-portal">{children}</View>
			),
			Grid: () => null,
			Handle: ({ children }: { children: React.ReactNode }) => children,
		},
	};
});
jest.mock('react-native-reanimated', () => {
	const { View, ScrollView } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: { View, ScrollView },
		useAnimatedRef: () => ({ current: null }),
		useSharedValue: (value: unknown) => ({ value }),
		useAnimatedStyle: () => ({}),
		useReducedMotion: () => true,
		withTiming: (value: unknown) => value,
	};
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));
jest.mock('@/src/hooks/use-drag-auto-scroll', () => ({
	useDragAutoScroll: () => ({
		outerScrollRef: { current: null },
		sectionRefs: [],
		startAutoScroll: jest.fn(),
		stopAutoScroll: jest.fn(),
		setDragSourceIndex: jest.fn(),
		updateDragTouch: jest.fn(),
		updateSectionBounds: jest.fn(),
		updateSectionMaxOffset: jest.fn(),
		handleOuterLayout: jest.fn(),
		handleOuterContentSizeChange: jest.fn(),
	}),
}));
jest.mock('@/src/store', () => {
	throw new Error('Practice board must not import personal state');
});

test('practice uses the dashboard sections and shared drag portal', () => {
	const ui = render(
		<PracticeBoard
			entities={getPracticeEntities(createPracticeSession('EUR'))}
			highlightedIds={[]}
			dropZones={createDropZoneRegistry()}
			onTap={() => {}}
			onDrop={() => {}}
			guidance={<Text>Try this movement</Text>}
			guidanceType="income"
			lesson="receive"
			demo={0}
		/>
	);
	expect(ui.getByTestId('drag-portal')).toBeTruthy();
	for (const label of ['Income', 'Accounts', 'Categories', 'Savings'])
		expect(ui.getByText(label)).toBeTruthy();
	expect(ui.getByText('Try this movement')).toBeTruthy();
	expect(ui.getByTestId('practice-row-income').props.style).not.toEqual(
		expect.objectContaining({ width: '50%' })
	);
});

test('large text puts guidance inline and leaves its action reachable', () => {
	const dimensions = jest
		.spyOn(ReactNative, 'useWindowDimensions')
		.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.5 });
	try {
		const ui = render(
			<PracticeBoard
				entities={getPracticeEntities(createPracticeSession('EUR'))}
				highlightedIds={[]}
				dropZones={createDropZoneRegistry()}
				onTap={() => {}}
				onDrop={() => {}}
				guidance={<Text>Record instead</Text>}
				guidanceType="category"
				lesson="spend"
				demo={0}
			/>
		);
		expect(ui.getByTestId('practice-tooltip').props.style.position).toBeUndefined();
		expect(ui.getByText('Record instead')).toBeTruthy();
	} finally {
		dimensions.mockRestore();
	}
});
