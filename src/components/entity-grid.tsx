import { View, Text } from 'react-native';
import type { EntityType, EntityWithBalance } from '@/src/types';
import { EntityBubble } from './entity-bubble';
import { AddEntityBubble } from './add-entity-bubble';
import { DropZone } from './drop-zone';

interface EntityGridProps {
	title: string;
	type: EntityType;
	entities: EntityWithBalance[];
	onDragStart?: (entity: EntityWithBalance) => void;
	onDragEnd?: (entity: EntityWithBalance, targetId: string | null) => void;
	onTap?: (entity: EntityWithBalance) => void;
	onLongPress?: (entity: EntityWithBalance) => void;
	onAdd?: (type: EntityType) => void;
}

export function EntityGrid({
	title,
	type,
	entities,
	onDragStart,
	onDragEnd,
	onTap,
	onLongPress,
	onAdd,
}: EntityGridProps) {
	return (
		<View className="mb-3">
			{/* Inset divider with section title */}
			<View className="mb-2 flex-row items-center px-4">
				<View className="h-px flex-1 bg-paper-300" />
				<Text className="px-3 font-sans text-xs uppercase tracking-wider text-ink-muted">
					{title}
				</Text>
				<View className="h-px flex-1 bg-paper-300" />
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
							onLongPress={onLongPress}
						/>
					</DropZone>
				))}

				{/* Add entity bubble */}
				{onAdd && <AddEntityBubble type={type} onPress={onAdd} />}

				{/* Empty state */}
				{entities.length === 0 && (
					<View className="w-full items-center py-4">
						<Text className="text-ink-faint font-sans text-sm">
							No {title.toLowerCase()} yet
						</Text>
					</View>
				)}
			</View>
		</View>
	);
}
