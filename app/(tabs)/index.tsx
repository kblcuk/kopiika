import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	Easing,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Sortable from 'react-native-sortables';
import { useRouter } from 'expo-router';
import {
	SortableEntityGrid,
	SummaryHeader,
	TransactionModal,
	EntityDetailModal,
	EntityCreateModal,
	ReservationModal,
	RefundPickerModal,
} from '@/src/components';
import { remeasureAllDropZones } from '@/src/utils/drop-zone';
import { useDragAutoScroll } from '@/src/hooks/use-drag-auto-scroll';
import { SECTION_INDEX } from '@/src/utils/drag-auto-scroll';
import { useStore, useEntitiesWithBalance } from '@/src/store';
import type { EntityType, EntityWithBalance, Transaction } from '@/src/types';
import { getCurrentPeriod } from '@/src/types';
import { createDefaultEntities, createDefaultPlans } from '@/src/utils/seed';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';

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

	const {
		isLoading,
		entities,
		incomeVisible,
		draggedEntity,
		addEntity,
		setPlan,
		setDraggedEntity,
		toggleIncomeVisible,
	} = useStore();

	const income = useEntitiesWithBalance('income');
	const accounts = useEntitiesWithBalance('account');
	const categories = useEntitiesWithBalance('category');
	const savings = useEntitiesWithBalance('saving');

	// Transaction modal state
	const [modalVisible, setModalVisible] = useState(false);
	const [fromEntity, setFromEntity] = useState<EntityWithBalance | null>(null);
	const [toEntity, setToEntity] = useState<EntityWithBalance | null>(null);

	// Reservation modal state (account → saving)
	const [reservationModalVisible, setReservationModalVisible] = useState(false);
	const [reservationAccount, setReservationAccount] = useState<EntityWithBalance | null>(null);
	const [reservationSaving, setReservationSaving] = useState<EntityWithBalance | null>(null);

	// Refund picker state — originalFrom/originalTo reflect the direction of original transactions
	const [refundPickerVisible, setRefundPickerVisible] = useState(false);
	const [refundOriginalFrom, setRefundOriginalFrom] = useState<EntityWithBalance | null>(null);
	const [refundOriginalTo, setRefundOriginalTo] = useState<EntityWithBalance | null>(null);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

	// Detail modal state
	const [detailModalVisible, setDetailModalVisible] = useState(false);
	const [detailEntity, setDetailEntity] = useState<EntityWithBalance | null>(null);

	// Create modal state
	const [createModalVisible, setCreateModalVisible] = useState(false);
	const [createEntityType, setCreateEntityType] = useState<EntityType | null>(null);

	// Section edit modes - when true, taps open the detail modal and drags reorder locally.
	const [incomeEditMode, setIncomeEditMode] = useState(false);
	const [accountsEditMode, setAccountsEditMode] = useState(false);
	const [categoriesEditMode, setCategoriesEditMode] = useState(false);
	const [savingsEditMode, setSavingsEditMode] = useState(false);

	// Seed default data if empty (excluding system entities)
	useEffect(() => {
		async function seedData() {
			const userEntities = entities.filter((e) => e.id !== BALANCE_ADJUSTMENT_ENTITY_ID);
			if (!isLoading && userEntities.length === 0) {
				const defaultEntities = createDefaultEntities();
				const defaultPlans = createDefaultPlans(defaultEntities);

				for (const entity of defaultEntities) {
					await addEntity(entity);
				}
				for (const plan of defaultPlans) {
					await setPlan(plan);
				}
			}
		}
		seedData();
	}, [isLoading, entities, addEntity, setPlan]);

	// Reset initial layout flag when entities change (e.g., after seeding)
	useEffect(() => {
		setHasInitialLayout(false);
	}, [entities.length]);

	// Combine all entities for lookup by ID
	const allEntities = useMemo(
		() => [...income, ...accounts, ...categories, ...savings],
		[income, accounts, categories, savings]
	);

	const handleDragStart = useCallback(
		(entity: EntityWithBalance) => {
			setDraggedEntity(entity);
			setDragSourceIndex(SECTION_INDEX[entity.type]);
			startAutoScroll();
		},
		[setDraggedEntity, setDragSourceIndex, startAutoScroll]
	);

	const handleDragEnd = useCallback(
		(entity: EntityWithBalance, targetId: string | null) => {
			setDraggedEntity(null);
			stopAutoScroll();

			// If no target, drag was cancelled or same-type reorder was handled by grid
			if (!targetId) {
				return;
			}
			const targetEntity = allEntities.find((e) => e.id === targetId);
			if (!targetEntity) {
				return;
			}
			// Ignore if dropped on itself
			if (entity.id === targetId) {
				return;
			}

			// Category → Account: open refund picker (original: account → category)
			if (entity.type === 'category' && targetEntity.type === 'account') {
				setRefundOriginalFrom(targetEntity);
				setRefundOriginalTo(entity);
				setRefundPickerVisible(true);
				return;
			}

			// Account → Income: open refund picker (original: income → account)
			if (entity.type === 'account' && targetEntity.type === 'income') {
				setRefundOriginalFrom(targetEntity);
				setRefundOriginalTo(entity);
				setRefundPickerVisible(true);
				return;
			}

			// Account → Saving: open reservation modal instead of transaction
			if (entity.type === 'account' && targetEntity.type === 'saving') {
				setReservationAccount(entity);
				setReservationSaving(targetEntity);
				setReservationModalVisible(true);
				return;
			}

			// Grid passes targetId only when the drag should open a money-moving flow.
			// Local reorders are handled inside the grid and come back as null.
			setFromEntity(entity);
			setToEntity(targetEntity);
			setModalVisible(true);
		},
		[setDraggedEntity, stopAutoScroll, allEntities]
	);

	const handleCloseModal = useCallback(() => {
		setModalVisible(false);
		setFromEntity(null);
		setToEntity(null);
		setEditingTransaction(null);
		setRefundOriginalFrom(null);
		setRefundOriginalTo(null);
	}, []);

	const handleCloseReservationModal = useCallback(() => {
		setReservationModalVisible(false);
		setReservationAccount(null);
		setReservationSaving(null);
	}, []);

	const handleRefundSelect = useCallback(
		(transaction: Transaction) => {
			setRefundPickerVisible(false);
			// Open edit modal for the selected transaction
			const from = allEntities.find((e) => e.id === transaction.from_entity_id) ?? null;
			const to = allEntities.find((e) => e.id === transaction.to_entity_id) ?? null;
			setFromEntity(from);
			setToEntity(to);
			setEditingTransaction(transaction);
			setModalVisible(true);
		},
		[allEntities]
	);

	const handleCloseRefundPicker = useCallback(() => {
		setRefundPickerVisible(false);
		setRefundOriginalFrom(null);
		setRefundOriginalTo(null);
	}, []);

	const handleTap = useCallback(
		(entity: EntityWithBalance) => {
			const editModeByType = {
				income: incomeEditMode,
				account: accountsEditMode,
				category: categoriesEditMode,
				saving: savingsEditMode,
			};
			if (editModeByType[entity.type]) {
				setFromEntity(null);
				setToEntity(null);
				setDetailEntity(entity);
				setDetailModalVisible(true);
				return;
			}
			router.push(`/history?period=${getCurrentPeriod()}&entityId=${entity.id}`);
		},
		[router, incomeEditMode, accountsEditMode, categoriesEditMode, savingsEditMode]
	);

	const handleCloseDetailModal = useCallback(() => {
		setDetailModalVisible(false);
		setDetailEntity(null);
	}, []);

	const handleAdd = useCallback((type: EntityType) => {
		setCreateEntityType(type);
		setCreateModalVisible(true);
	}, []);

	const handleCloseCreateModal = useCallback(() => {
		setCreateModalVisible(false);
		setCreateEntityType(null);
	}, []);

	const handleToggleCategoriesEditMode = useCallback(() => {
		setCategoriesEditMode((prev) => !prev);
	}, []);
	const handleToggleIncomeEditMode = useCallback(() => {
		setIncomeEditMode((prev) => !prev);
	}, []);
	const handleToggleAccountsEditMode = useCallback(() => {
		setAccountsEditMode((prev) => !prev);
	}, []);
	const handleToggleSavingsEditMode = useCallback(() => {
		setSavingsEditMode((prev) => !prev);
	}, []);

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
		<SafeAreaView className="flex-1 overflow-visible bg-paper-50" edges={[]}>
			{/* Summary bar */}
			<SummaryHeader onToggleIncome={handleToggleIncome} />

			{/* PortalProvider ensures dragged items render above all other content */}
			<Sortable.PortalProvider>
				{/* Content */}
				<Animated.ScrollView
					ref={outerScrollRef}
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
									onAdd={handleAdd}
									dropZonesDisabled={!incomeVisible}
									dragBehavior={incomeEditMode ? 'reorder' : 'transaction'}
									editMode={incomeEditMode}
									onToggleEditMode={handleToggleIncomeEditMode}
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
							onAdd={handleAdd}
							dragBehavior={accountsEditMode ? 'reorder' : 'transaction'}
							editMode={accountsEditMode}
							onToggleEditMode={handleToggleAccountsEditMode}
							updateDragTouch={updateDragTouch}
							sectionScrollRef={sectionRefs[1]}
							sectionIndex={1}
							onSectionMaxOffset={updateSectionMaxOffset}
							onSectionBounds={updateSectionBounds}
						/>
						<SortableEntityGrid
							title="Categories"
							type="category"
							entities={categories}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onTap={handleTap}
							onAdd={handleAdd}
							maxRows={3}
							dragBehavior={categoriesEditMode ? 'reorder' : 'transaction'}
							editMode={categoriesEditMode}
							onToggleEditMode={handleToggleCategoriesEditMode}
							updateDragTouch={updateDragTouch}
							sectionScrollRef={sectionRefs[2]}
							sectionIndex={2}
							onSectionMaxOffset={updateSectionMaxOffset}
							onSectionBounds={updateSectionBounds}
						/>
						<SortableEntityGrid
							title="Savings · Goal"
							type="saving"
							entities={savings}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onTap={handleTap}
							onAdd={handleAdd}
							dragBehavior={savingsEditMode ? 'reorder' : 'transaction'}
							editMode={savingsEditMode}
							onToggleEditMode={handleToggleSavingsEditMode}
							updateDragTouch={updateDragTouch}
							sectionScrollRef={sectionRefs[3]}
							sectionIndex={3}
							onSectionMaxOffset={updateSectionMaxOffset}
							onSectionBounds={updateSectionBounds}
						/>

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
			<TransactionModal
				visible={modalVisible}
				fromEntity={fromEntity}
				toEntity={toEntity}
				onClose={handleCloseModal}
				existingTransaction={editingTransaction ?? undefined}
			/>

			{/* Refund Picker Modal (category → account, account → income) */}
			<RefundPickerModal
				visible={refundPickerVisible}
				originalFrom={refundOriginalFrom}
				originalTo={refundOriginalTo}
				onSelect={handleRefundSelect}
				onClose={handleCloseRefundPicker}
			/>

			{/* Reservation Modal (account → saving) */}
			<ReservationModal
				visible={reservationModalVisible}
				account={reservationAccount}
				saving={reservationSaving}
				onClose={handleCloseReservationModal}
			/>

			{/* Entity Detail Modal */}
			<EntityDetailModal
				visible={detailModalVisible}
				entity={detailEntity}
				onClose={handleCloseDetailModal}
			/>

			{/* Entity Create Modal */}
			<EntityCreateModal
				visible={createModalVisible}
				entityType={createEntityType}
				onClose={handleCloseCreateModal}
			/>
		</SafeAreaView>
	);
}
