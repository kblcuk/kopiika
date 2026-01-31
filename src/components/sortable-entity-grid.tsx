import { useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Sortable from 'react-native-sortables';
import type { TouchData } from 'react-native-gesture-handler';
import Animated, { useAnimatedRef, makeMutable, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowUpDown, Check } from 'lucide-react-native';

import type { EntityType, EntityWithBalance } from '@/src/types';
import {
	findDropTarget,
	unregisterDropZone,
	registerDropZone,
	registerRemeasureCallback,
	unregisterRemeasureCallback,
} from '@/src/utils/drop-zone';
import { useStore } from '@/src/store';
import { AddEntityBubble } from './add-entity-bubble';
import {
	SortableEntityBubble,
	HoveredIdContext,
	FixedOrderContext,
	type FixedOrderContextType,
} from './sortable-entity-bubble';

// Grid layout constants
const BUBBLE_WIDTH = 96;
const COLUMN_GAP = 4;
const ROW_GAP = 4;
const BUBBLE_HEIGHT = 128;

// Module-level shared value for hovered drop zone - shared across all grids
// Using makeMutable for a global shared value that can be modified from JS thread
let globalHoveredId: SharedValue<string> | null = null;

function getGlobalHoveredId(): SharedValue<string> {
	if (!globalHoveredId) {
		globalHoveredId = makeMutable('');
	}
	return globalHoveredId;
}

interface SortableEntityGridProps {
	title: string;
	type: EntityType;
	entities: EntityWithBalance[];
	onDragStart?: (entity: EntityWithBalance) => void;
	onDragEnd?: (entity: EntityWithBalance, targetId: string | null) => void;
	onTap?: (entity: EntityWithBalance) => void;
	onLongPress?: (entity: EntityWithBalance) => void;
	onAdd?: (type: EntityType) => void;
	dropZonesDisabled?: boolean;
	maxRows?: number;
	/** When true, same-type drags reorder items. When false, same-type account drags create transactions. */
	reorderMode?: boolean;
	/** Callback to toggle reorder mode (renders edit button if provided) */
	onToggleReorderMode?: () => void;
}

export function SortableEntityGrid({
	title,
	type,
	entities,
	onDragStart,
	onDragEnd,
	onTap,
	onLongPress,
	onAdd,
	dropZonesDisabled = false,
	maxRows = 1,
	reorderMode = true,
	onToggleReorderMode,
}: SortableEntityGridProps) {
	const reorderEntitiesByIds = useStore((state) => state.reorderEntitiesByIds);

	// Get the global shared value for hovered drop zone - shared across all grids
	const hoveredIdShared = useMemo(() => getGlobalHoveredId(), []);

	// Pub/sub system for fixed order mode - allows bubbles to subscribe without Grid re-rendering
	const isFixedRef = useRef(false);
	const subscribersRef = useRef<Set<(isFixed: boolean) => void>>(new Set());
	const draggedIdRef = useRef<string | null>(null);

	const fixedOrderContextValue = useMemo<FixedOrderContextType>(
		() => ({
			subscribe: (callback) => {
				subscribersRef.current.add(callback);
				return () => subscribersRef.current.delete(callback);
			},
			getIsFixed: () => isFixedRef.current,
			getDraggedId: () => draggedIdRef.current,
		}),
		[]
	);

	const setIsFixed = useCallback((isFixed: boolean) => {
		if (isFixedRef.current !== isFixed) {
			isFixedRef.current = isFixed;
			subscribersRef.current.forEach((callback) => callback(isFixed));
		}
	}, []);

	// Store grid bounds for checking if touch is inside during drag
	const gridBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(
		null
	);

	// Ref for horizontal ScrollView to enable auto-scroll during drag
	const scrollViewRef = useAnimatedRef<Animated.ScrollView>();

	// Track current touch position for cross-type drop detection
	const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
	const draggedEntityRef = useRef<EntityWithBalance | null>(null);
	const lastDropCheckTimeRef = useRef<number>(0);
	const DROP_CHECK_THROTTLE_MS = 50;

	// Sort entities for horizontal layout: position (column) first, then row
	const sortedEntities = useMemo(
		() =>
			[...entities].sort((a, b) => {
				if (a.position !== b.position) return a.position - b.position;
				return a.row - b.row;
			}),
		[entities]
	);

	const entityIdsKey = useMemo(() => sortedEntities.map((e) => e.id).join(','), [sortedEntities]);

	const gridRef = useRef<View>(null);

	// Measure grid position and register all drop zones based on horizontal grid layout
	const registerGridDropZones = useCallback(() => {
		if (dropZonesDisabled) return;

		gridRef.current?.measureInWindow((gridX, gridY, gridWidth, gridHeight) => {
			if (gridWidth === 0 || gridHeight === 0) return;

			gridBoundsRef.current = { x: gridX, y: gridY, width: gridWidth, height: gridHeight };

			// In horizontal layout: col = floor(index / maxRows), row = index % maxRows
			sortedEntities.forEach((entity, index) => {
				const col = Math.floor(index / maxRows);
				const row = index % maxRows;
				const x = gridX + col * (BUBBLE_WIDTH + COLUMN_GAP);
				const y = gridY + row * (BUBBLE_HEIGHT + ROW_GAP);
				registerDropZone(entity.id, {
					x,
					y,
					width: BUBBLE_WIDTH,
					height: BUBBLE_HEIGHT,
				});
			});
		});
	}, [sortedEntities, dropZonesDisabled, maxRows]);

	// Register drop zones and remeasure callback
	const gridCallbackId = `grid-${type}`;
	useEffect(() => {
		if (dropZonesDisabled) {
			sortedEntities.forEach((e) => unregisterDropZone(e.id));
			unregisterRemeasureCallback(gridCallbackId);
			return;
		}

		registerRemeasureCallback(gridCallbackId, registerGridDropZones);

		const timeout = setTimeout(registerGridDropZones, 100);
		return () => {
			clearTimeout(timeout);
			sortedEntities.forEach((e) => unregisterDropZone(e.id));
			unregisterRemeasureCallback(gridCallbackId);
		};
	}, [entityIdsKey, dropZonesDisabled, registerGridDropZones, sortedEntities, gridCallbackId]);

	const handleScrollEnd = useCallback(() => {
		if (!dropZonesDisabled) {
			setTimeout(registerGridDropZones, 50);
		}
	}, [dropZonesDisabled, registerGridDropZones]);

	const handleSortableDragStart = useCallback(
		({ key }: { key: string }) => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			const entity = entities.find((e) => e.id === key);
			draggedEntityRef.current = entity || null;
			// Set dragged ID in context ref BEFORE setIsFixed so bubbles can check it
			draggedIdRef.current = entity?.id || null;

			// When reorderMode is off for accounts, set fixed mode to prevent visual reordering
			// Other items will become fixed-order, but the dragged item stays draggable
			if (!reorderMode && type === 'account') {
				setIsFixed(true);
			}

			if (entity) {
				onDragStart?.(entity);
			}
		},
		[entities, onDragStart, reorderMode, type, setIsFixed]
	);

	const handleSortableDragMove = useCallback(
		({ touchData }: { touchData: TouchData }) => {
			lastTouchRef.current = { x: touchData.absoluteX, y: touchData.absoluteY };

			const draggedEntity = draggedEntityRef.current;
			if (!draggedEntity) return;

			// Check if touch is inside this grid's bounds - switch Handle mode when outside
			// This allows items to be dragged outside for cross-type drops
			const bounds = gridBoundsRef.current;
			if (bounds) {
				const isInsideBounds =
					touchData.absoluteX >= bounds.x &&
					touchData.absoluteX <= bounds.x + bounds.width &&
					touchData.absoluteY >= bounds.y &&
					touchData.absoluteY <= bounds.y + bounds.height;

				// When reorderMode is off for accounts, always keep fixed to prevent reordering
				// Otherwise, use bounds-based logic (fixed when outside for cross-type drops)
				if (!reorderMode && type === 'account') {
					setIsFixed(true);
				} else {
					setIsFixed(!isInsideBounds);
				}
			}

			// Throttle drop target detection
			const now = Date.now();
			if (now - lastDropCheckTimeRef.current < DROP_CHECK_THROTTLE_MS) return;
			lastDropCheckTimeRef.current = now;

			// Check for drop targets
			const targetId = findDropTarget(
				touchData.absoluteX,
				touchData.absoluteY,
				draggedEntity.id
			);
			if (targetId) {
				const targetEntity = useStore.getState().entities.find((e) => e.id === targetId);
				if (!targetEntity) {
					hoveredIdShared.value = '';
					return;
				}

				const isCrossType = targetEntity.type !== type;
				// In transfer mode (reorderMode=false), account-to-account also creates transactions
				const isSameTypeTransfer =
					!reorderMode && type === 'account' && targetEntity.type === 'account';

				if (isCrossType || isSameTypeTransfer) {
					hoveredIdShared.value = targetId;
				} else {
					hoveredIdShared.value = '';
				}
			} else {
				hoveredIdShared.value = '';
			}
		},
		[type, hoveredIdShared, setIsFixed, reorderMode]
	);

	const handleSortableDragEnd = useCallback(
		({ data }: { data: EntityWithBalance[] }) => {
			const touch = lastTouchRef.current;
			const draggedEntity = draggedEntityRef.current;

			hoveredIdShared.value = '';
			setIsFixed(false);
			draggedIdRef.current = null;
			lastTouchRef.current = null;
			draggedEntityRef.current = null;

			// Check for drop targets that should create transactions
			if (touch && draggedEntity) {
				const targetId = findDropTarget(touch.x, touch.y, draggedEntity.id);
				if (targetId) {
					const targetEntity = useStore
						.getState()
						.entities.find((e) => e.id === targetId);

					if (targetEntity) {
						const isCrossType = targetEntity.type !== type;
						// In transfer mode (reorderMode=false), account-to-account also creates transactions
						const isSameTypeTransfer =
							!reorderMode && type === 'account' && targetEntity.type === 'account';

						if (isCrossType || isSameTypeTransfer) {
							onDragEnd?.(draggedEntity, targetId);
							return;
						}
					}
				}
			}

			// Same-type reorder (or reorderMode=true for accounts)
			const newOrder = data.map((e) => e.id);
			reorderEntitiesByIds(type, newOrder, maxRows);

			if (draggedEntity) {
				onDragEnd?.(draggedEntity, null);
			}
		},
		[type, maxRows, onDragEnd, reorderEntitiesByIds, hoveredIdShared, setIsFixed, reorderMode]
	);

	const hasEntities = entities.length > 0;
	const displayedEntities = onAdd
		? sortedEntities.concat({ id: '__add_button__' } as EntityWithBalance)
		: sortedEntities;

	return (
		<View className="overflow-visible">
			{/* Inset divider with section title */}
			<View className="flex-row items-center px-4">
				<View className="h-px flex-1 bg-paper-300" />
				<Text className="px-3 font-sans text-xs uppercase tracking-wider text-ink-muted">
					{title}
				</Text>
				{onToggleReorderMode && (
					<Pressable
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onToggleReorderMode();
						}}
						className={`mx-1 rounded-full p-1.5 ${reorderMode ? 'bg-accent/20' : 'bg-transparent'}`}
						hitSlop={8}
					>
						{reorderMode ? (
							<Check size={14} color="#D4652F" strokeWidth={2.5} />
						) : (
							<ArrowUpDown size={14} color="#6B5D4A" strokeWidth={2} />
						)}
					</Pressable>
				)}
				<View className="h-px flex-1 bg-paper-300" />
			</View>

			<HoveredIdContext.Provider value={hoveredIdShared}>
				<FixedOrderContext.Provider value={fixedOrderContextValue}>
					{hasEntities ? (
						<Animated.ScrollView
							ref={scrollViewRef}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
							onScrollEndDrag={handleScrollEnd}
							onMomentumScrollEnd={handleScrollEnd}
						>
							<View ref={gridRef} className="relative flex-row">
								<Sortable.Grid
									data={displayedEntities}
									rows={maxRows}
									rowHeight={BUBBLE_HEIGHT}
									columnGap={COLUMN_GAP}
									rowGap={ROW_GAP}
									customHandle={true}
									renderItem={({ item }) =>
										item.id === '__add_button__' && onAdd ? (
											<Sortable.Handle mode="fixed-order">
												<AddEntityBubble type={type} onPress={onAdd} />
											</Sortable.Handle>
										) : (
											<SortableEntityBubble
												entity={item}
												onTap={onTap}
												onLongPress={onLongPress}
											/>
										)
									}
									keyExtractor={(item: EntityWithBalance) => item.id}
									onDragStart={handleSortableDragStart}
									onDragMove={handleSortableDragMove}
									onDragEnd={handleSortableDragEnd}
									scrollableRef={scrollViewRef}
									autoScrollDirection="horizontal"
									activeItemScale={1.1}
									activeItemOpacity={0.9}
									inactiveItemOpacity={1}
									dragActivationDelay={50}
									overflow="visible"
								/>
								{onAdd && <View style={{ width: BUBBLE_WIDTH + COLUMN_GAP }} />}
							</View>
						</Animated.ScrollView>
					) : (
						<View className="flex-row px-4">
							{onAdd && <AddEntityBubble type={type} onPress={onAdd} width={96} />}
						</View>
					)}
				</FixedOrderContext.Provider>
			</HoveredIdContext.Provider>
		</View>
	);
}
