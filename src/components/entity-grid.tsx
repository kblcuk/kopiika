import { View, Text, Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
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
		<View className="mb-4">
			{/* Section title with add button */}
			<View className="mb-2 flex-row items-center justify-between px-4">
				<Text className="font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					{title}
				</Text>
				{onAdd && (
					<Pressable
						onPress={() => onAdd(type)}
						hitSlop={12}
						className="h-6 w-6 items-center justify-center rounded-full bg-paper-200"
					>
						<Plus size={14} color="#6B5D4A" />
					</Pressable>
				)}
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
				{entities.length === 0 && (
					<View className="w-full items-center py-4">
						<Text className="font-sans text-sm text-ink-faint">
							No {title.toLowerCase()} yet
						</Text>
					</View>
				)}
			</View>
		</View>
	);
}
