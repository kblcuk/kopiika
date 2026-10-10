import React from 'react';
import { act, render } from '@testing-library/react-native';
import { EntityBoardGrid } from '../entity-board-grid';
import { createDropZoneRegistry } from '@/src/utils/drop-zone';
import { createPracticeSession, getPracticeEntities } from '@/src/onboarding/practice-session';
interface GridProps {
	onDragStart: (data: { key: string }) => void;
	onDragMove: (data: { touchData: { absoluteX: number; absoluteY: number } }) => void;
	onDragEnd: (data: { data: ReturnType<typeof getPracticeEntities> }) => void;
}
let gridProps: GridProps;
jest.mock('react-native-sortables', () => ({
	__esModule: true,
	default: {
		Grid: (props: GridProps) => {
			gridProps = props;
			return null;
		},
		Handle: ({ children }: { children: React.ReactNode }) => children,
		Touchable: ({ children }: { children: React.ReactNode }) => children,
	},
}));
jest.mock('react-native-reanimated', () => {
	const { View, ScrollView } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: { View, ScrollView },
		useAnimatedRef: () => ({ current: null }),
	};
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));
jest.mock('@/src/store', () => {
	throw new Error('The practice grid must not import personal state');
});

test('uses practice lookup and private drop targets during the native drag lifecycle', () => {
	const entities = getPracticeEntities(createPracticeSession('EUR'));
	const source = entities.find((e) => e.type === 'income')!;
	const target = entities.find((e) => e.type === 'account')!;
	const dropZones = createDropZoneRegistry();
	dropZones.registerDropZone(target.id, { x: 0, y: 0, width: 100, height: 100 });
	const onDragEnd = jest.fn();
	const { unmount } = render(
		<EntityBoardGrid
			title="Income"
			type="income"
			entities={[source]}
			lookupEntity={(id) => entities.find((e) => e.id === id)}
			dropZones={dropZones}
			hoveredId={{ value: '' } as import('react-native-reanimated').SharedValue<string>}
			onDragEnd={onDragEnd}
		/>
	);
	act(() => {
		gridProps.onDragStart({ key: source.id });
		gridProps.onDragMove({ touchData: { absoluteX: 50, absoluteY: 50 } });
		gridProps.onDragEnd({ data: [source] });
	});
	expect(onDragEnd).toHaveBeenCalledWith(source, target.id);
	unmount();
});
