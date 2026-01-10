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
	disabled?: boolean;
}

// Global registry for drop zones
const dropZoneRegistry = new Map<string, LayoutRectangle>();

// Registry for remeasure callbacks
const remeasureCallbacks = new Map<string, () => void>();

export function registerDropZone(id: string, layout: LayoutRectangle) {
	dropZoneRegistry.set(id, layout);
}

export function unregisterDropZone(id: string) {
	dropZoneRegistry.delete(id);
	remeasureCallbacks.delete(id);
}

export function registerRemeasureCallback(id: string, callback: () => void) {
	remeasureCallbacks.set(id, callback);
}

// Call this when scroll position changes to update all drop zone positions
export function remeasureAllDropZones() {
	remeasureCallbacks.forEach((callback) => callback());
}

// Optimized drop target detection with early exit
export function findDropTarget(x: number, y: number, excludeId: string): string | null {
	for (const [id, layout] of dropZoneRegistry) {
		if (id === excludeId) continue;
		// Early exit optimizations: check simple conditions first
		if (x < layout.x || x > layout.x + layout.width) continue;
		if (y < layout.y || y > layout.y + layout.height) continue;
		return id;
	}
	return null;
}

export function DropZone({ entity, children, disabled = false }: DropZoneProps) {
	const viewRef = useRef<View>(null);
	const isHighlighted = useSharedValue(0);
	const isDragging = useSharedValue(0);
	const isReorderMode = useSharedValue(0);

	// Debounce measure calls to avoid excessive measurements during rapid layout changes
	const measureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const measureAndRegister = useCallback(() => {
		if (disabled) {
			// Unregister when disabled
			unregisterDropZone(entity.id);
		} else {
			// Clear any pending measurement
			if (measureTimeoutRef.current) {
				clearTimeout(measureTimeoutRef.current);
			}
			// Debounce to avoid excessive measurements
			measureTimeoutRef.current = setTimeout(() => {
				viewRef.current?.measureInWindow((x, y, width, height) => {
					registerDropZone(entity.id, { x, y, width, height });
				});
			}, 16); // ~1 frame at 60fps
		}
	}, [entity.id, disabled]);

	// Register remeasure callback and clean up on unmount
	useEffect(() => {
		registerRemeasureCallback(entity.id, measureAndRegister);
		// Initial measurement
		measureAndRegister();
		return () => {
			// Cleanup: clear any pending measurements and unregister
			if (measureTimeoutRef.current) {
				clearTimeout(measureTimeoutRef.current);
			}
			unregisterDropZone(entity.id);
		};
	}, [entity.id, measureAndRegister]);

	// Subscribe to store changes without causing React re-renders
	// Track previous values to implement custom equality check
	useEffect(() => {
		let prevHoveredId: string | null = null;
		let prevDraggedId: string | undefined = undefined;
		let prevDraggedType: string | undefined = undefined;

		const unsubscribe = useStore.subscribe((state) => {
			const hoveredId = state.hoveredDropZoneId;
			const draggedId = state.draggedEntity?.id;
			const draggedType = state.draggedEntity?.type;

			// Only update if relevant state has changed
			if (
				hoveredId === prevHoveredId &&
				draggedId === prevDraggedId &&
				draggedType === prevDraggedType
			) {
				return;
			}

			prevHoveredId = hoveredId;
			prevDraggedId = draggedId;
			prevDraggedType = draggedType;

			const isHovered = hoveredId === entity.id;
			const isBeingDragged = draggedId === entity.id;
			const isSameType = draggedType === entity.type;

			isHighlighted.value = withTiming(isHovered ? 1 : 0, { duration: 150 });
			isDragging.value = isBeingDragged ? 1 : 0;
			isReorderMode.value = isSameType && isHovered ? 1 : 0;
		});
		return unsubscribe;
	}, [entity.id, entity.type, isHighlighted, isDragging, isReorderMode]);

	const animatedStyle = useAnimatedStyle(() => {
		// Pre-define colors to avoid string concatenation in worklet
		const REORDER_COLOR = 'rgba(96, 165, 250, 0.2)'; // Blue tint for reordering
		const TRANSACTION_COLOR = 'rgba(184, 92, 56, 0.15)'; // Orange tint for transaction
		const TRANSPARENT = 'rgba(0, 0, 0, 0)';

		// Choose target color based on mode
		const targetColor = isReorderMode.value ? REORDER_COLOR : TRANSACTION_COLOR;

		return {
			backgroundColor: interpolateColor(
				isHighlighted.value,
				[0, 1],
				[TRANSPARENT, targetColor]
			),
			borderRadius: 12,
			zIndex: isDragging.value ? 1000 : 0,
			elevation: isDragging.value ? 1000 : 0,
			// Width and padding to maintain grid layout
			width: '25%',
		};
	});

	return (
		<Animated.View ref={viewRef} style={animatedStyle} onLayout={measureAndRegister}>
			{children}
		</Animated.View>
	);
}
