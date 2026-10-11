import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	useReducedMotion,
	withTiming,
} from 'react-native-reanimated';
import type { EntityType, EntityWithBalance } from '@/src/types';
import type { PracticeLesson } from '@/src/onboarding/practice-session';
import type { createDropZoneRegistry } from '@/src/utils/drop-zone';
import { useDragAutoScroll } from '@/src/hooks/use-drag-auto-scroll';
import { EntityBoardGrid } from './entity-board-grid';
import { BoardScrollSurface } from './board-scroll-surface';
import { Text } from './text';
import { TestIDs } from '@/e2e/support/test-ids';

const TYPES = ['income', 'account', 'category', 'saving'] as const;
const TITLES = { income: 'Income', account: 'Accounts', category: 'Categories', saving: 'Savings' };

export function PracticeBoard({
	entities,
	highlightedIds,
	dropZones,
	onTap,
	onDrop,
	guidance,
	guidanceType,
	lesson,
	demo,
	incomeVisible = true,
}: {
	entities: EntityWithBalance[];
	highlightedIds: string[];
	dropZones: ReturnType<typeof createDropZoneRegistry>;
	onTap: (entity: EntityWithBalance) => void;
	onDrop: (entity: EntityWithBalance, targetId: string | null) => void;
	guidance: ReactNode;
	guidanceType: EntityType;
	lesson: PracticeLesson;
	demo: number;
	incomeVisible?: boolean;
}) {
	const hoveredId = useSharedValue('');
	const [draggedType, setDraggedType] = useState<EntityType | null>(null);
	const { width, fontScale } = useWindowDimensions();
	const inline = width < 360 || fontScale > 1.25;
	const reducedMotion = useReducedMotion();
	const surfaceRef = useRef<View>(null);
	const rowOffsets = useRef<Partial<Record<EntityType, number>>>({});
	const [guidanceHeight, setGuidanceHeight] = useState(0);
	const [cue, setCue] = useState<{
		fromX: number;
		fromY: number;
		toX: number;
		toY: number;
		tap: boolean;
	} | null>(null);
	const motion = useSharedValue(0);
	const handledDemo = useRef(0);
	const auto = useDragAutoScroll(
		[incomeVisible, true, true, true],
		dropZones.remeasureAllDropZones
	);
	const { outerScrollRef, stopAutoScroll } = auto;
	useEffect(() => {
		const y = rowOffsets.current[guidanceType];
		if (y !== undefined)
			outerScrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: false });
		setCue(null);
		dropZones.remeasureAllDropZones();
	}, [guidanceType, lesson, dropZones, outerScrollRef]);
	useEffect(() => {
		if (!demo) {
			handledDemo.current = 0;
			return;
		}
		if (draggedType || handledDemo.current === demo) return;
		handledDemo.current = demo;
		let canceled = false;
		dropZones.remeasureAllDropZones();
		const timer = setTimeout(() => {
			const fromId =
				lesson === 'receive'
					? 'practice-income'
					: lesson === 'spend'
						? 'practice-category'
						: 'practice-account';
			const toId =
				lesson === 'receive'
					? 'practice-account'
					: lesson === 'spend'
						? fromId
						: 'practice-saving';
			const from = dropZones.getDropZone(fromId);
			const to = dropZones.getDropZone(toId);
			if (!from || !to) return;
			surfaceRef.current?.measureInWindow((x, y) => {
				if (canceled) return;
				setCue({
					fromX: from.x + from.width / 2 - x,
					fromY: from.y + from.height / 2 - y,
					toX: to.x + to.width / 2 - x,
					toY: to.y + to.height / 2 - y,
					tap: lesson === 'spend',
				});
				motion.value = 0;
				if (!reducedMotion) motion.value = withTiming(1, { duration: 1600 });
			});
		}, 100);
		const end = setTimeout(() => {
			if (!canceled) setCue(null);
		}, 2000);
		return () => {
			canceled = true;
			clearTimeout(timer);
			clearTimeout(end);
		};
	}, [demo, lesson, dropZones, motion, reducedMotion, draggedType]);
	useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);
	const cueStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: cue ? cue.fromX + (cue.toX - cue.fromX) * motion.value - 18 : 0 },
			{ translateY: cue ? cue.fromY + (cue.toY - cue.fromY) * motion.value - 18 : 0 },
			{ scale: cue?.tap ? 1 + motion.value * 0.4 : 1 },
		],
		opacity: cue ? 1 : 0,
	}));
	return (
		<View ref={surfaceRef} className="flex-1" testID="practice-board">
			<BoardScrollSurface
				ref={outerScrollRef}
				testID={TestIDs.onboarding.practiceScreen}
				onLayout={auto.handleOuterLayout}
				onContentSizeChange={(_w, h) => {
					auto.handleOuterContentSizeChange(_w, h);
					dropZones.remeasureAllDropZones();
				}}
				onScroll={auto.scrollHandler}
				onScrollBeginDrag={() => setCue(null)}
				onScrollEndDrag={dropZones.remeasureAllDropZones}
				onMomentumScrollEnd={dropZones.remeasureAllDropZones}
			>
				{TYPES.map((type, i) =>
					type === 'income' && !incomeVisible ? null : (
						<View
							key={type}
							testID={`practice-row-${type}`}
							style={{
								zIndex: draggedType === type ? 1000 : 0,
								elevation: draggedType === type ? 1000 : 0,
								minHeight:
									!inline && type === guidanceType
										? guidanceHeight + 38
										: undefined,
							}}
							onLayout={(e) => {
								rowOffsets.current[type] = e.nativeEvent.layout.y;
								if (type === guidanceType)
									outerScrollRef.current?.scrollTo({
										y: Math.max(0, e.nativeEvent.layout.y - 12),
										animated: false,
									});
								dropZones.remeasureAllDropZones();
							}}
						>
							<EntityBoardGrid
								title={TITLES[type]}
								type={type}
								entities={entities.filter((e) => e.type === type)}
								lookupEntity={(id) => entities.find((e) => e.id === id)}
								dropZones={dropZones}
								hoveredId={hoveredId}
								highlightedIds={highlightedIds}
								onTap={onTap}
								onDragStart={() => {
									setCue(null);
									setDraggedType(type);
									dropZones.remeasureAllDropZones();
									auto.setDragSourceIndex(i);
									auto.startAutoScroll();
								}}
								onDragEnd={(entity, target) => {
									setDraggedType(null);
									auto.stopAutoScroll();
									onDrop(entity, target);
								}}
								onInvalidDrop={onDrop}
								updateDragTouch={auto.updateDragTouch}
								sectionScrollRef={auto.sectionRefs[i]}
								sectionIndex={i}
								onSectionMaxOffset={auto.updateSectionMaxOffset}
								onSectionBounds={auto.updateSectionBounds}
							/>
							{type === guidanceType && (
								<View
									testID="practice-tooltip"
									onLayout={(e) => setGuidanceHeight(e.nativeEvent.layout.height)}
									style={
										inline
											? { marginHorizontal: 16, marginBottom: 12 }
											: {
													position: 'absolute',
													left: 140,
													right: 16,
													top: 28,
												}
									}
								>
									{!inline && (
										<Text
											pointerEvents="none"
											className="absolute -left-3 top-4 text-accent"
										>
											‹
										</Text>
									)}
									{guidance}
								</View>
							)}
						</View>
					)
				)}
			</BoardScrollSurface>
			{!!cue && (
				<Animated.View
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
					style={[
						{
							position: 'absolute',
							top: 0,
							left: 0,
							width: 36,
							height: 36,
							borderRadius: 18,
							borderWidth: 3,
							borderColor: '#6B5D4A',
							backgroundColor: '#F5F0E8',
							zIndex: 2000,
						},
						cueStyle,
					]}
				>
					<Text className="text-center">{cue.tap ? '·' : '↓'}</Text>
				</Animated.View>
			)}
		</View>
	);
}
