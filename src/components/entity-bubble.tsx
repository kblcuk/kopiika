import { useCallback, useRef } from 'react';
import { View, Text } from 'react-native';
import { Pressable, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import * as Icons from 'lucide-react-native';

import type { EntityWithBalance } from '@/src/types';
import { formatAmount, getProgressPercent, isOverspent } from '@/src/utils/format';
import { CircularProgress } from './circular-progress';
import { findDropTarget } from './drop-zone';
import { useStore } from '@/src/store';

interface EntityBubbleProps {
	entity: EntityWithBalance;
	onDragStart?: (entity: EntityWithBalance) => void;
	onDragEnd?: (entity: EntityWithBalance, targetId: string | null) => void;
	onTap?: (entity: EntityWithBalance) => void;
}

// Convert kebab-case to PascalCase for lucide icon lookup
function toIconName(name: string): string {
	return name
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

// Get background and icon colors based on entity type
function getEntityTypeColors(type: EntityWithBalance['type']): {
	bg: string;
	iconColor: string;
} {
	switch (type) {
		case 'income':
			return {
				bg: 'bg-accent/10', // Soft terracotta tint
				iconColor: '#D4652F', // accent.DEFAULT
			};
		case 'account':
			return {
				bg: 'bg-paper-300', // Neutral beige
				iconColor: '#6B5D4A', // ink.muted
			};
		case 'category':
			return {
				bg: 'bg-positive/10', // Soft green tint
				iconColor: '#2F7D4A', // positive.DEFAULT
			};
		case 'saving':
			return {
				bg: 'bg-info/10', // Soft blue tint
				iconColor: '#2B5F8A', // info.DEFAULT
			};
	}
}

export function EntityBubble({ entity, onDragStart, onDragEnd, onTap }: EntityBubbleProps) {
	const setHoveredDropZoneId = useStore((state) => state.setHoveredDropZoneId);

	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const scale = useSharedValue(1);
	const zIndex = useSharedValue(0);
	const opacity = useSharedValue(1);

	const overspent = isOverspent(entity.actual, entity.planned);
	const progress = getProgressPercent(entity.actual, entity.planned);

	// Get the icon component dynamically
	const iconName = entity.icon ? toIconName(entity.icon) : 'Circle';
	const IconComponent =
		(Icons as unknown as Record<string, typeof Icons.Circle>)[iconName] || Icons.Circle;

	const handleDragStart = useCallback(() => {
		onDragStart?.(entity);
	}, [entity, onDragStart]);

	const lastTargetIdRef = useRef<string | null>(null);
	const isLongPressActiveRef = useRef(false);

	const handleDragUpdate = useCallback(
		(absoluteX: number, absoluteY: number) => {
			const targetId = findDropTarget(absoluteX, absoluteY, entity.id);
			// Only update store if target actually changed to avoid unnecessary re-renders
			if (targetId !== lastTargetIdRef.current) {
				lastTargetIdRef.current = targetId;
				setHoveredDropZoneId(targetId);
			}
		},
		[entity.id, setHoveredDropZoneId]
	);

	const handleDragEnd = useCallback(
		(absoluteX: number, absoluteY: number) => {
			const targetId = findDropTarget(absoluteX, absoluteY, entity.id);
			setHoveredDropZoneId(null);
			onDragEnd?.(entity, targetId);
		},
		[entity, onDragEnd, setHoveredDropZoneId]
	);

	const handleTap = useCallback(() => {
		onTap?.(entity);
	}, [entity, onTap]);

	const elevation = useSharedValue(0);

	// Long press gesture to enter drag mode
	const longPressGesture = Gesture.LongPress()
		.minDuration(500)
		.onStart(() => {
			isLongPressActiveRef.current = true;
			// Visual feedback: slight scale and haptic
			scale.value = withSpring(1.05);
		})
		.onFinalize(() => {
			// If long press completes without panning, reset
			if (!isLongPressActiveRef.current) {
				scale.value = withSpring(1);
			}
		});

	// Pan gesture - only activates after long press
	const panGesture = Gesture.Pan()
		.manualActivation(true)
		.onTouchesMove((event, state) => {
			// Only activate pan if long press is active
			if (isLongPressActiveRef.current) {
				state.activate();
			} else {
				state.fail();
			}
		})
		.onStart(() => {
			scale.value = withSpring(1.15);
			zIndex.value = 1000;
			elevation.value = 1000;
			opacity.value = 0.95;
			scheduleOnRN(handleDragStart);
		})
		.onUpdate((event) => {
			translateX.value = event.translationX;
			translateY.value = event.translationY;
			scheduleOnRN(handleDragUpdate, event.absoluteX, event.absoluteY);
		})
		.onEnd((event) => {
			translateX.value = withSpring(0);
			translateY.value = withSpring(0);
			scale.value = withSpring(1);
			zIndex.value = 0;
			elevation.value = 0;
			opacity.value = withTiming(1);
			isLongPressActiveRef.current = false;
			scheduleOnRN(handleDragEnd, event.absoluteX, event.absoluteY);
		})
		.onFinalize(() => {
			isLongPressActiveRef.current = false;
		});

	// Tap gesture - quick tap to open detail
	const tapGesture = Gesture.Tap()
		.maxDuration(250)
		.onEnd(() => {
			scheduleOnRN(handleTap);
		});

	// Compose gestures: tap is exclusive with long press, pan runs simultaneously
	const composedGesture = Gesture.Simultaneous(
		Gesture.Exclusive(tapGesture, longPressGesture),
		panGesture
	);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
		zIndex: zIndex.value,
		elevation: elevation.value,
		opacity: opacity.value,
	}));

	// Income shows remaining (how much left to receive), everything else shows actual
	const mainAmount = formatAmount(entity.type === 'income' ? entity.remaining : entity.actual);
	const typeColors = getEntityTypeColors(entity.type);

	return (
		<GestureDetector gesture={composedGesture}>
			<Pressable
				onPress={() => {
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
				}}
			>
				<Animated.View style={animatedStyle} className="items-center py-1.5">
					{/* Name */}
					<Text
						className="mb-1.5 text-center font-sans text-xs text-ink"
						numberOfLines={1}
						ellipsizeMode="tail"
					>
						{entity.name}
					</Text>

					{/* Icon circle with progress ring */}
					<View className="relative mb-1.5 h-14 w-14 items-center justify-center">
						{/* Progress ring */}
						{entity.type === 'account' || entity.planned === 0 ? null : (
							<View className="absolute">
								<CircularProgress
									size={64}
									strokeWidth={3}
									progress={progress}
									inverse={entity.type === 'saving'}
								/>
							</View>
						)}
						{/* Icon background */}
						<View
							className={`h-14 w-14 items-center justify-center rounded-full ${typeColors.bg}`}
						>
							<IconComponent size={24} color={typeColors.iconColor} />
						</View>
					</View>

					{/* Main amount */}
					<Text
						className={`font-sans-semibold text-sm ${
							overspent ? 'text-negative' : 'text-ink'
						}`}
					>
						{mainAmount}
					</Text>

					{/* Planned amount */}
					<Text className="font-sans text-xs text-ink-muted">
						{formatAmount(entity.planned)}
					</Text>
				</Animated.View>
			</Pressable>
		</GestureDetector>
	);
}
