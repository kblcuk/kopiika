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

test('a late native measurement cannot restore targets after disabling a grid', () => {
	const entities = getPracticeEntities(createPracticeSession('EUR'));
	const source = entities.find((e) => e.type === 'income')!;
	const registry = createDropZoneRegistry();
	const measurements: ((x: number, y: number, w: number, h: number) => void)[] = [];
	const props = {
		title: 'Income',
		type: 'income' as const,
		entities: [source],
		lookupEntity: (id: string) => entities.find((e) => e.id === id),
		dropZones: registry,
		hoveredId: { value: '' } as import('react-native-reanimated').SharedValue<string>,
	};
	const methods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
		'react-native/jest/mockNativeMethods'
	).default;
	methods.measureInWindow.mockImplementation(
		(callback: (x: number, y: number, w: number, h: number) => void) =>
			measurements.push(callback)
	);
	const ui = render(<EntityBoardGrid {...props} />);
	expect(measurements.length).toBeGreaterThan(0);
	ui.rerender(<EntityBoardGrid {...props} dropZonesDisabled />);
	act(() => {
		measurements.forEach((fn) => fn(0, 0, 100, 100));
	});
	expect(registry.findDropTarget(50, 50, 'other')).toBeNull();
	methods.measureInWindow.mockReset();
});

test('reports dropping onto an unsupported bubble separately from dropping outside', () => {
	const entities = getPracticeEntities(createPracticeSession('EUR'));
	const source = entities.find((e) => e.type === 'income')!;
	const target = entities.find((e) => e.type === 'category')!;
	const registry = createDropZoneRegistry();
	registry.registerDropZone(target.id, { x: 0, y: 0, width: 100, height: 100 });
	const invalid = jest.fn();
	const dropped = jest.fn();
	render(
		<EntityBoardGrid
			title="Income"
			type="income"
			entities={[source]}
			lookupEntity={(id) => entities.find((e) => e.id === id)}
			dropZones={registry}
			hoveredId={{ value: '' } as import('react-native-reanimated').SharedValue<string>}
			onInvalidDrop={invalid}
			onDragEnd={dropped}
		/>
	);
	act(() => {
		gridProps.onDragStart({ key: source.id });
		gridProps.onDragMove({ touchData: { absoluteX: 50, absoluteY: 50 } });
		gridProps.onDragEnd({ data: [source] });
	});
	expect(invalid).toHaveBeenCalledWith(source, target.id);
	expect(dropped).toHaveBeenCalledWith(source, null);
});
