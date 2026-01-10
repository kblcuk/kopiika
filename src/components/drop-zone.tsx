import { useCallback, useRef, useEffect } from 'react';
import { View, LayoutRectangle } from 'react-native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	interpolateColor,
} from 'react-native-reanimated';

import type { EntityWithBalance } from '@/src/types';
import { useStore } from '@/src/store';

interface DropZoneProps {
	entity: EntityWithBalance;
	children: React.ReactNode;
}

// Global registry for drop zones
const dropZoneRegistry = new Map<string, LayoutRectangle>();

export function registerDropZone(id: string, layout: LayoutRectangle) {
	dropZoneRegistry.set(id, layout);
}

export function unregisterDropZone(id: string) {
	dropZoneRegistry.delete(id);
}

export function findDropTarget(x: number, y: number, excludeId: string): string | null {
	for (const [id, layout] of dropZoneRegistry) {
		if (id === excludeId) continue;
		if (
			x >= layout.x &&
			x <= layout.x + layout.width &&
			y >= layout.y &&
			y <= layout.y + layout.height
		) {
			return id;
		}
	}
	return null;
}

export function DropZone({ entity, children }: DropZoneProps) {
	const viewRef = useRef<View>(null);
	const isHighlighted = useSharedValue(0);
	const isDragging = useSharedValue(0);

	const measureAndRegister = useCallback(() => {
		viewRef.current?.measureInWindow((x, y, width, height) => {
			registerDropZone(entity.id, { x, y, width, height });
		});
	}, [entity.id]);

	// Clean up on unmount
	useEffect(() => {
		return () => {
			unregisterDropZone(entity.id);
		};
	}, [entity.id]);

	// Subscribe to store changes without causing re-renders
	useEffect(() => {
		const unsubscribe = useStore.subscribe((state) => {
			// Update hover highlight
			const isHovered = state.hoveredDropZoneId === entity.id;
			isHighlighted.value = withTiming(isHovered ? 1 : 0, { duration: 150 });

			// Update dragging state for zIndex
			const isBeingDragged = state.draggedEntity?.id === entity.id;
			isDragging.value = isBeingDragged ? 1 : 0;
		});
		return unsubscribe;
	}, [entity.id, isHighlighted, isDragging]);

	const animatedStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(
			isHighlighted.value,
			[0, 1],
			['transparent', 'rgba(184, 92, 56, 0.15)']
		),
		borderRadius: 12,
		zIndex: isDragging.value ? 1000 : 0,
		// Width and padding to maintain grid layout
		width: '25%',
		paddingHorizontal: 4,
	}));

	return (
		<Animated.View ref={viewRef} style={animatedStyle} onLayout={measureAndRegister}>
			{children}
		</Animated.View>
	);
}
