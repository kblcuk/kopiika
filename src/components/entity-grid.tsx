import { View, Text } from 'react-native';
import type { EntityType, EntityWithBalance } from '@/src/types';
import { EntityBubble } from './entity-bubble';
import { DropZone } from './drop-zone';

interface EntityGridProps {
	title: string;
	type: EntityType;
	entities: EntityWithBalance[];
	onDragStart?: (entity: EntityWithBalance) => void;
	onDragEnd?: (entity: EntityWithBalance, targetId: string | null) => void;
	onTap?: (entity: EntityWithBalance) => void;
}

export function EntityGrid({ title, entities, onDragStart, onDragEnd, onTap }: EntityGridProps) {
	if (entities.length === 0) {
		return null;
	}

	return (
		<View className="mb-4">
			{/* Section title */}
			<View className="mb-2 px-4">
				<Text className="font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					{title}
				</Text>
			</View>

			{/* Grid of bubbles */}
			<View className="flex-row flex-wrap px-2">
				{entities.map((entity) => (
					<DropZone key={entity.id} entity={entity}>
						<EntityBubble
							entity={entity}
							onDragStart={onDragStart}
							onDragEnd={onDragEnd}
							onTap={onTap}
						/>
					</DropZone>
				))}
			</View>
		</View>
	);
}
