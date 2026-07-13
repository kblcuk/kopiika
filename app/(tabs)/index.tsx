import {
	EmptyBoardNudge,
	EntityCreateModal,
	EntityDetailModal,
	EntitySectionSkeleton,
	RefundPickerModal,
	ReservationModal,
	SortableEntityGrid,
	SummaryHeader,
	TransactionModal,
} from '@/src/components';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { Text } from '@/src/components/text';
import { useDragAutoScroll } from '@/src/hooks/use-drag-auto-scroll';
import { useEntityCreateFlow } from '@/src/hooks/use-entity-create-flow';
import { useEntityDetailFlow } from '@/src/hooks/use-entity-detail-flow';
import { useHasOpened } from '@/src/hooks/use-has-opened';
import { useReservationFlow } from '@/src/hooks/use-reservation-flow';
import { useSectionEditModes } from '@/src/hooks/use-section-edit-modes';
import { useStaggeredReveal } from '@/src/hooks/use-staggered-reveal';
import { useTransactionFlow } from '@/src/hooks/use-transaction-flow';
import { useEntitiesWithBalance, useStore } from '@/src/store';
import type { EntityWithBalance } from '@/src/types';
import { SECTION_INDEX } from '@/src/utils/drag-auto-scroll';
import { resolveDropFlow } from '@/src/utils/drop-flow';
import { remeasureAllDropZones } from '@/src/utils/drop-zone';
import { setPendingHistoryFilter } from '@/src/utils/history-nav-signal';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';
import { scheduleOnRN } from 'react-native-worklets';
import { useShallow } from 'zustand/react/shallow';

export default function HomeScreen() {
	const router = useRouter();
	const {
		outerScrollRef,
		scrollHandler,
		handleOuterLayout,
		handleOuterContentSizeChange,
		startAutoScroll,
		stopAutoScroll,
		updateDragTouch,
		sectionRefs,
		setDragSourceIndex,
		updateSectionBounds,
		updateSectionMaxOffset,
	} = useDragAutoScroll();

	// KII-132: bare `useStore()` subscribed to every store change, re-rendering
	// the home screen (and re-deriving all four balance hooks) on any unrelated
	// mutation — including the several fired during startup. Select only the
	// fields this screen reads via `useShallow` so it re-renders only when those
	// change. Actions are stable references, so including them is free.
	const {
		isLoading,
		entities,
		incomeVisible,
		draggedEntity,
		setDraggedEntity,
		toggleIncomeVisible,
	} = useStore(
		useShallow((s) => ({
			isLoading: s.isLoading,
			entities: s.entities,
			incomeVisible: s.incomeVisible,
			draggedEntity: s.draggedEntity,
			setDraggedEntity: s.setDraggedEntity,
			toggleIncomeVisible: s.toggleIncomeVisible,
		}))
	);

	const transactions = useStore((s) => s.transactions);

	const userEntityCount = useMemo(
		() => entities.filter((e) => e.id !== BALANCE_ADJUSTMENT_ENTITY_ID).length,
		[entities]
	);

	const income = useEntitiesWithBalance('income');
	const accounts = useEntitiesWithBalance('account');
	const categories = useEntitiesWithBalance('category');
	const savings = useEntitiesWithBalance('saving');

	// KII-144: categories + savings are the two heaviest sections (~73% of the
	// board's mount cost). Defer them one frame at a time so the first frame only
	// pays for income + accounts; skeletons hold their space meanwhile.
	const revealed = useStaggeredReveal(2);

	// Section edit modes - when true, taps open the detail modal and drags reorder locally.
	const editModes = useSectionEditModes();

	// Reset initial layout flag when entities change
	useEffect(() => {
		setHasInitialLayout(false);
	}, [entities.length]);

	// Combine all entities for lookup by ID
	const allEntities = useMemo(
		() => [...income, ...accounts, ...categories, ...savings],
		[income, accounts, categories, savings]
	);

	// Each board flow owns its own modal state; the drop dispatch below routes a
	// completed drag to the right one via the pure resolveDropFlow.
	const transactionFlow = useTransactionFlow({ allEntities });
	const reservationFlow = useReservationFlow();
	const detailFlow = useEntityDetailFlow();
	const createFlow = useEntityCreateFlow();

	// KII-144: keep each modal unmounted until first opened so its render +
	// native commit stay off cold start. The latch stays true afterwards, so the
	// slide open/close animation and all behavior are unchanged for the session.
	const transactionModalOpened = useHasOpened(transactionFlow.transactionModalProps.visible);
	const refundPickerOpened = useHasOpened(transactionFlow.refundPickerProps.visible);
	const reservationOpened = useHasOpened(reservationFlow.reservationModalProps.visible);
	const detailOpened = useHasOpened(detailFlow.detailModalProps.visible);
	const createOpened = useHasOpened(createFlow.createModalProps.visible);

	const handleDragStart = useCallback(
		(entity: EntityWithBalance) => {
			setDraggedEntity(entity);
			// Refresh drop-zone rects at the start of every drag. They're cached
			// from the grid's measured origin, but a full remeasure only fires
			// once at launch (guarded) or on scroll — so any layout shift since
			// (e.g. an entity added/removed collapsing sections) leaves them stale
			// and findDropTarget misses. Measuring here guarantees they're current
			// for the drop that's about to happen.
			remeasureAllDropZones();
			// Reorder-mode drags rely on Sortable.Grid's built-in auto-scroll;
			// activating the hook would race it on the source section's ScrollView.
			if (editModes.isEditing(entity.type)) return;
			setDragSourceIndex(SECTION_INDEX[entity.type]);
			startAutoScroll();
		},
		[setDraggedEntity, setDragSourceIndex, startAutoScroll, editModes]
	);

	const handleDragEnd = useCallback(
		(entity: EntityWithBalance, targetId: string | null) => {
			// Drag teardown (gesture/auto-scroll mechanics) stays here; the pure
			// resolveDropFlow decides what the drop *means* and we dispatch to the
			// owning flow. No-ops on null/self targets via the 'none' branch.
			setDraggedEntity(null);
			stopAutoScroll();

			const target = targetId ? (allEntities.find((e) => e.id === targetId) ?? null) : null;
			const flow = resolveDropFlow(entity, target);
			switch (flow.kind) {
				case 'none':
					return;
				case 'transaction':
					transactionFlow.open(flow.from, flow.to);
					return;
				case 'refund':
					transactionFlow.openRefund(flow.originalFrom, flow.originalTo);
					return;
				case 'reservation':
					reservationFlow.open(flow.account, flow.saving);
					return;
			}
		},
		[setDraggedEntity, stopAutoScroll, allEntities, transactionFlow, reservationFlow]
	);

	const handleTap = useCallback(
		(entity: EntityWithBalance) => {
			if (editModes.isEditing(entity.type)) {
				detailFlow.open(entity);
				return;
			}
			setPendingHistoryFilter({ entityId: entity.id });
			router.push('/history');
		},
		[router, detailFlow, editModes]
	);

	// Re-measure drop zones when scrolling ends to account for position changes
	const handleScrollEnd = useCallback(() => {
		remeasureAllDropZones();
	}, []);

	// Track if we've done the initial layout measurement
	const [hasInitialLayout, setHasInitialLayout] = useState(false);

	// Remeasure drop zones after initial content layout
	const handleContentLayout = useCallback(() => {
		if (!hasInitialLayout && !isLoading && entities.length > 0) {
			setHasInitialLayout(true);
			// Small delay to ensure all drop zones are mounted
			const t = setTimeout(() => {
				remeasureAllDropZones();
			}, 100);
			return () => clearTimeout(t);
		}
	}, [hasInitialLayout, isLoading, entities.length]);

	// Animation for income section
	const [incomeContentHeight, setIncomeContentHeight] = useState<number | null>(null);
	const animatedHeight = useSharedValue(0);

	// Measure content height only once
	const handleIncomeLayout = useCallback(
		(event: { nativeEvent: { layout: { height: number } } }) => {
			const height = event.nativeEvent.layout.height;
			if (height > 0 && incomeContentHeight === null) {
				setIncomeContentHeight(height);
				animatedHeight.value = incomeVisible ? height : 0;
				// Remeasure drop zones after initial layout to get correct positions
				setTimeout(() => remeasureAllDropZones(), 100);
			}
		},
		[incomeContentHeight, incomeVisible, animatedHeight]
	);

	// Once we have the content height, animate based on visibility
	useEffect(() => {
		if (incomeContentHeight !== null) {
			animatedHeight.value = withTiming(
				incomeVisible ? incomeContentHeight : 0,
				{
					duration: 250,
					easing: Easing.out(Easing.cubic),
				},
				(finished) => {
					// Remeasure drop zones after animation completes
					if (finished) {
						scheduleOnRN(remeasureAllDropZones);
					}
				}
			);
		}
	}, [incomeVisible, incomeContentHeight, animatedHeight]);

	// Check if we're dragging an income item to elevate the container
	const isDraggingIncome = draggedEntity?.type === 'income';

	// Convert to shared value for use in animated style
	const isDraggingIncomeShared = useSharedValue(isDraggingIncome);

	// Update shared value when dragging state changes
	useEffect(() => {
		isDraggingIncomeShared.value = isDraggingIncome;
	}, [isDraggingIncome, isDraggingIncomeShared]);

	const animatedStyle = useAnimatedStyle(() => {
		if (incomeContentHeight === null) {
			// During measurement phase, don't constrain height
			return { overflow: 'hidden' };
		}
		return {
			height: animatedHeight.value,
			// Allow overflow when dragging so item doesn't get clipped
			overflow: isDraggingIncomeShared.value ? 'visible' : 'hidden',
		};
	});

	const handleToggleIncome = useCallback(() => {
		toggleIncomeVisible();
	}, [toggleIncomeVisible]);

	if (isLoading) {
		return (
			<SafeAreaView className="flex-1 items-center justify-center bg-paper-100">
				<ActivityIndicator size="large" color="#6B5D4A" />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			testID="home-screen"
			className="flex-1 overflow-visible bg-paper-50"
			edges={[]}
		>
			{/* Summary bar */}
			<SummaryHeader onToggleIncome={handleToggleIncome} />

			{/* Empty-state nudge — renders null when not applicable */}
			<EmptyBoardNudge
				entityCount={userEntityCount}
				transactionCount={transactions.length}
				onAddEntity={() => createFlow.open('account')}
			/>

			{/* PortalProvider ensures dragged items render above all other content */}
			<Sortable.PortalProvider>
				{/* Content */}
				<Animated.ScrollView
					ref={outerScrollRef}
					testID="home-scroll-view"
					className="flex-1 overflow-visible"
					contentContainerClassName="overflow-visible"
					contentContainerStyle={{ paddingVertical: 12 }}
					onScroll={scrollHandler}
					scrollEventThrottle={16}
					onScrollEndDrag={handleScrollEnd}
					onMomentumScrollEnd={handleScrollEnd}
					onLayout={handleOuterLayout}
					onContentSizeChange={handleOuterContentSizeChange}
				>
					<View onLayout={handleContentLayout}>
						{/* Always render income section, control visibility with animation */}
						<Animated.View
							style={[
								animatedStyle,
								{
									zIndex: isDraggingIncome ? 1000 : 10,
									elevation: isDraggingIncome ? 1000 : 10,
								},
							]}
						>
							<View
								{...(incomeContentHeight === null && {
									onLayout: handleIncomeLayout,
								})}
								pointerEvents={incomeVisible ? 'auto' : 'none'}
							>
								<SortableEntityGrid
									title="Income"
									type="income"
									entities={income}
									onDragStart={handleDragStart}
									onDragEnd={handleDragEnd}
									onTap={handleTap}
									onAdd={createFlow.open}
									dropZonesDisabled={!incomeVisible}
									dragBehavior={
										editModes.modes.income ? 'reorder' : 'transaction'
									}
									editMode={editModes.modes.income}
									onToggleEditMode={editModes.toggle.income}
									updateDragTouch={updateDragTouch}
									sectionScrollRef={sectionRefs[0]}
									sectionIndex={0}
									onSectionMaxOffset={updateSectionMaxOffset}
									onSectionBounds={updateSectionBounds}
								/>
							</View>
						</Animated.View>
						<SortableEntityGrid
							title="Accounts"
							type="account"
							entities={accounts}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onTap={handleTap}
							onAdd={createFlow.open}
							dragBehavior={editModes.modes.account ? 'reorder' : 'transaction'}
							editMode={editModes.modes.account}
							onToggleEditMode={editModes.toggle.account}
							updateDragTouch={updateDragTouch}
							sectionScrollRef={sectionRefs[1]}
							sectionIndex={1}
							onSectionMaxOffset={updateSectionMaxOffset}
							onSectionBounds={updateSectionBounds}
						/>
						{revealed >= 1 ? (
							<SortableEntityGrid
								title="Categories"
								type="category"
								entities={categories}
								onDragStart={handleDragStart}
								onDragEnd={handleDragEnd}
								onTap={handleTap}
								onAdd={createFlow.open}
								maxRows={3}
								dragBehavior={editModes.modes.category ? 'reorder' : 'transaction'}
								editMode={editModes.modes.category}
								onToggleEditMode={editModes.toggle.category}
								updateDragTouch={updateDragTouch}
								sectionScrollRef={sectionRefs[2]}
								sectionIndex={2}
								onSectionMaxOffset={updateSectionMaxOffset}
								onSectionBounds={updateSectionBounds}
							/>
						) : (
							<EntitySectionSkeleton
								title="Categories"
								entityCount={categories.length}
								maxRows={3}
							/>
						)}
						{revealed >= 2 ? (
							<SortableEntityGrid
								title="Savings · Goal"
								type="saving"
								entities={savings}
								onDragStart={handleDragStart}
								onDragEnd={handleDragEnd}
								onTap={handleTap}
								onAdd={createFlow.open}
								dragBehavior={editModes.modes.saving ? 'reorder' : 'transaction'}
								editMode={editModes.modes.saving}
								onToggleEditMode={editModes.toggle.saving}
								updateDragTouch={updateDragTouch}
								sectionScrollRef={sectionRefs[3]}
								sectionIndex={3}
								onSectionMaxOffset={updateSectionMaxOffset}
								onSectionBounds={updateSectionBounds}
							/>
						) : (
							<EntitySectionSkeleton
								title="Savings · Goal"
								entityCount={savings.length}
							/>
						)}

						{entities.length === 0 && (
							<View className="items-center px-4 py-10">
								<Text className="text-center font-sans text-ink-muted">
									Setting up your dashboard...
								</Text>
							</View>
						)}
					</View>
				</Animated.ScrollView>
			</Sortable.PortalProvider>

			{/* Transaction Modal */}
			{transactionModalOpened && (
				<TransactionModal {...transactionFlow.transactionModalProps} />
			)}

			{/* Refund Picker Modal (category → account, account → income) */}
			{refundPickerOpened && <RefundPickerModal {...transactionFlow.refundPickerProps} />}

			{/* Reservation Modal (account → saving) */}
			{reservationOpened && <ReservationModal {...reservationFlow.reservationModalProps} />}

			{/* Entity Detail Modal */}
			{detailOpened && <EntityDetailModal {...detailFlow.detailModalProps} />}

			{/* Entity Create Modal */}
			{createOpened && <EntityCreateModal {...createFlow.createModalProps} />}
		</SafeAreaView>
	);
}
