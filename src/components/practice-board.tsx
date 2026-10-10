import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { EntityWithBalance } from '@/src/types';
import type { createDropZoneRegistry } from '@/src/utils/drop-zone';
import { EntityBoardGrid } from './entity-board-grid';

export function PracticeBoard({
	entities,
	highlightedIds,
	dropZones,
	onTap,
	onDrop,
}: {
	entities: EntityWithBalance[];
	highlightedIds: string[];
	dropZones: ReturnType<typeof createDropZoneRegistry>;
	onTap: (entity: EntityWithBalance) => void;
	onDrop: (entity: EntityWithBalance, targetId: string | null) => void;
}) {
	const hoveredId = useSharedValue('');
	return (
		<View className="flex-row flex-wrap" testID="practice-board">
			{(['income', 'account', 'category', 'saving'] as const).map((type) => (
				<View key={type} style={{ width: '50%' }}>
					<EntityBoardGrid
						title={
							{
								income: 'Income',
								account: 'Accounts',
								category: 'Spending',
								saving: 'Savings',
							}[type]
						}
						type={type}
						entities={entities.filter((e) => e.type === type)}
						lookupEntity={(id) => entities.find((e) => e.id === id)}
						dropZones={dropZones}
						hoveredId={hoveredId}
						highlightedIds={highlightedIds}
						onTap={onTap}
						onDragEnd={onDrop}
						onInvalidDrop={onDrop}
						onDragStart={dropZones.remeasureAllDropZones}
					/>
				</View>
			))}
		</View>
	);
}
