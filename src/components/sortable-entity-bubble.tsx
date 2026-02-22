import { useCallback, useEffect, useState, memo, createContext, useContext } from 'react';
import { View, Text } from 'react-native';
import Sortable from 'react-native-sortables';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	withSpring,
	useAnimatedReaction,
	type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';

import type { EntityWithBalance } from '@/src/types';
import { formatAmount, getProgressPercent, isOverspent } from '@/src/utils/format';
import { getEntityTypeColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { CircularProgress } from './circular-progress';
import { getIcon } from '@/src/constants/icon-registry';

// Context to pass hovered ID shared value to bubbles without prop drilling through Sortable
export const HoveredIdContext = createContext<SharedValue<string> | null>(null);

// Context to signal bubbles to use fixed-order mode (when drag is outside grid bounds)
// Using a ref-based pub/sub approach to avoid re-rendering the Grid when this changes
export type FixedOrderContextType = {
	subscribe: (callback: (isFixed: boolean) => void) => () => void;
	getIsFixed: () => boolean;
	getDraggedId: () => string | null;
};
export const FixedOrderContext = createContext<FixedOrderContextType | null>(null);

// Haptics helper that can be called from worklet via runOnJS
const triggerLightHaptic = () => {
	Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

interface SortableEntityBubbleProps {
	entity: EntityWithBalance;
	onTap?: (entity: EntityWithBalance) => void;
	onLongPress?: (entity: EntityWithBalance) => void;
}

// Individual entity bubble for the sortable grid - memoized to prevent re-renders during drag
export const SortableEntityBubble = memo(function SortableEntityBubble({
	entity,
	onTap,
	onLongPress,
}: SortableEntityBubbleProps) {
	const overspent = isOverspent(entity.actual, entity.planned);
	const progress = getProgressPercent(entity.actual, entity.planned);
	const IconComponent = getIcon(entity.icon || 'circle');
	const typeColors = getEntityTypeColors(entity.type);
	const mainAmount = formatAmount(entity.type === 'income' ? entity.remaining : entity.actual);

	// Get hovered ID shared value from context
	const hoveredIdShared = useContext(HoveredIdContext);

	// Subscribe to fixed order mode changes - this allows the mode to change mid-drag
	// without re-rendering the entire Grid (only this bubble re-renders)
	const fixedOrderContext = useContext(FixedOrderContext);
	const [mode, setMode] = useState<'draggable' | 'fixed-order'>('draggable');

	useEffect(() => {
		if (!fixedOrderContext) return;

		const newMode = fixedOrderContext.getIsFixed() ? 'fixed-order' : 'draggable';
		setMode(newMode);

		return fixedOrderContext.subscribe((isFixed) => {
			// Check if this bubble is the one being dragged (via context, not store)
			// This avoids timing issues - grid sets draggedId before calling setIsFixed
			const draggedId = fixedOrderContext.getDraggedId();
			if (entity.id === draggedId) {
				// Dragged item must stay 'draggable' so it can be moved
				return;
			}
			setMode(isFixed ? 'fixed-order' : 'draggable');
		});
	}, [entity.id, fixedOrderContext]);

	// Animation values for drop target highlight
	const highlightProgress = useSharedValue(0);
	const highlightScale = useSharedValue(1);

	// Store entity ID as a constant for use in worklet
	const entityId = entity.id;

	// React to hovered ID changes entirely on UI thread - no JS thread involvement
	useAnimatedReaction(
		() => hoveredIdShared?.value ?? '',
		(hoveredId, prevHoveredId) => {
			const isHovered = hoveredId === entityId;
			const wasHovered = prevHoveredId === entityId;

			// Only animate if hover state for THIS entity changed
			if (isHovered && !wasHovered) {
				highlightProgress.value = withTiming(1, { duration: 150 });
				highlightScale.value = withSpring(1.08, { damping: 15, stiffness: 300 });
				scheduleOnRN(triggerLightHaptic);
			} else if (!isHovered && wasHovered) {
				highlightProgress.value = withTiming(0, { duration: 150 });
				highlightScale.value = withSpring(1, { damping: 15, stiffness: 300 });
			}
		},
		[entityId]
	);

	const highlightStyle = useAnimatedStyle(() => ({
		transform: [{ scale: highlightScale.value }],
		opacity: 1 - highlightProgress.value * 0.1,
	}));

	const glowStyle = useAnimatedStyle(() => ({
		position: 'absolute' as const,
		top: -4,
		left: -4,
		right: -4,
		bottom: -4,
		borderRadius: 16,
		backgroundColor: colors.accent.glow,
		opacity: highlightProgress.value,
	}));

	const handleTap = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onTap?.(entity);
	}, [entity, onTap]);

	const handleLongPress = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		onLongPress?.(entity);
	}, [entity, onLongPress]);

	return (
		<Sortable.Touchable onTap={handleTap} onLongPress={handleLongPress}>
			<Sortable.Handle mode={mode}>
				<Animated.View className="w-24 items-center py-1" style={highlightStyle}>
					{/* Glow effect for drop target */}
					<Animated.View style={glowStyle} pointerEvents="none" />
					<Text
						className="mb-2.5 text-center font-sans text-xs text-ink"
						numberOfLines={1}
						ellipsizeMode="tail"
					>
						{entity.name}
					</Text>

					<View className="relative h-14 w-14 items-center justify-center">
						{entity.type === 'account' || entity.planned === 0 ? null : (
							<View className="absolute">
								<CircularProgress
									size={64}
									strokeWidth={3}
									progress={progress}
									planned={entity.planned}
									inverse={entity.type === 'saving'}
								/>
							</View>
						)}
						<View
							className={`h-14 w-14 items-center justify-center rounded-full ${typeColors.bg}`}
						>
							<IconComponent size={24} color={typeColors.iconColor} />
						</View>
					</View>

					<View className="mt-2.5 items-center">
						<Text
							className={`font-sans-semibold text-sm ${overspent ? 'text-negative' : 'text-ink'}`}
						>
							{mainAmount}
						</Text>
						<Text className="font-sans text-xs text-ink-muted">
							{formatAmount(entity.planned)}
						</Text>
					</View>
				</Animated.View>
			</Sortable.Handle>
		</Sortable.Touchable>
	);
});
