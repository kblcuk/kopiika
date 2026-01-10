import { View, Text, FlatList } from 'react-native';
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
	onAdd?: (type: EntityType) => void;
	dropZonesDisabled?: boolean;
	horizontalScroll?: boolean;
	maxRows?: number;
}

export function EntityGrid({
	title,
	type,
	entities,
	onDragStart,
	onDragEnd,
	onTap,
	onAdd,
	dropZonesDisabled = false,
	horizontalScroll = false,
	maxRows,
}: EntityGridProps) {
	// Chunk entities into columns for maxRows layout
	const columns: EntityWithBalance[][] =
		!maxRows || entities.length === 0
			? []
			: entities.reduce((cols, entity, index) => {
					cols[Math.floor(index / maxRows)] ||= [];
					cols[Math.floor(index / maxRows)].push(entity);
					return cols;
				}, [] as EntityWithBalance[][]);

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
			{horizontalScroll ? (
				<FlatList
					horizontal
					showsHorizontalScrollIndicator={false}
					data={entities}
					keyExtractor={(item) => item.id}
					contentContainerStyle={{ paddingHorizontal: 16 }}
					renderItem={({ item: entity }) => (
						<DropZone entity={entity} disabled={dropZonesDisabled}>
							<EntityBubble
								entity={entity}
								onDragStart={onDragStart}
								onDragEnd={onDragEnd}
								onTap={onTap}
							/>
						</DropZone>
					)}
					ListFooterComponent={
						onAdd ? <AddEntityBubble type={type} onPress={onAdd} width={96} /> : null
					}
					ListEmptyComponent={
						<View className="w-full items-center py-4">
							<Text className="text-ink-faint font-sans text-sm">
								No {title.toLowerCase()} yet
							</Text>
						</View>
					}
				/>
			) : maxRows ? (
				<FlatList
					horizontal
					showsHorizontalScrollIndicator={false}
					data={columns}
					keyExtractor={(_, index) => `column-${index}`}
					contentContainerStyle={{ paddingHorizontal: 16 }}
					renderItem={({ item: column }) => (
						<View className="flex-col">
							{column.map((entity) => (
								<DropZone
									key={entity.id}
									entity={entity}
									disabled={dropZonesDisabled}
								>
									<EntityBubble
										entity={entity}
										onDragStart={onDragStart}
										onDragEnd={onDragEnd}
										onTap={onTap}
									/>
								</DropZone>
							))}
						</View>
					)}
					ListFooterComponent={
						onAdd ? (
							<View className="flex-col">
								<AddEntityBubble type={type} onPress={onAdd} width={96} />
							</View>
						) : null
					}
					ListEmptyComponent={
						<View className="w-full items-center py-4">
							<Text className="text-ink-faint font-sans text-sm">
								No {title.toLowerCase()} yet
							</Text>
						</View>
					}
				/>
			) : (
				<View className={`flex-row flex-wrap`}>
					{entities.map((entity) => (
						<DropZone key={entity.id} entity={entity} disabled={dropZonesDisabled}>
							<EntityBubble
								entity={entity}
								onDragStart={onDragStart}
								onDragEnd={onDragEnd}
								onTap={onTap}
							/>
						</DropZone>
					))}

					{/* Add entity bubble */}
					{onAdd && <AddEntityBubble type={type} onPress={onAdd} width={96} />}

					{/* Empty state */}
					{entities.length === 0 && (
						<View className="w-full items-center py-4">
							<Text className="text-ink-faint font-sans text-sm">
								No {title.toLowerCase()} yet
							</Text>
						</View>
					)}
				</View>
			)}
		</View>
	);
}
