import { makeMutable, type SharedValue } from 'react-native-reanimated';
import { useStore } from '@/src/store';
import { globalDropZones } from '@/src/utils/drop-zone';
import { EntityBoardGrid, type EntityBoardGridProps } from './entity-board-grid';

let hoveredId: SharedValue<string> | null = null;
type SortableEntityGridProps = Omit<
	EntityBoardGridProps,
	'lookupEntity' | 'onReorder' | 'dropZones' | 'hoveredId' | 'highlightedIds'
>;
const lookupEntity = (id: string) => useStore.getState().entities.find((e) => e.id === id);

export function SortableEntityGrid(props: SortableEntityGridProps) {
	const reorder = useStore((s) => s.reorderEntitiesByIds);
	hoveredId ??= makeMutable('');
	return (
		<EntityBoardGrid
			{...props}
			lookupEntity={lookupEntity}
			onReorder={reorder}
			dropZones={globalDropZones}
			hoveredId={hoveredId}
		/>
	);
}
