import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	Easing,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
	EntityGrid,
	SummaryHeader,
	TransactionModal,
	EntityDetailModal,
	EntityCreateModal,
} from '@/src/components';
import { remeasureAllDropZones } from '@/src/components/drop-zone';
import { useStore, useEntitiesWithBalance } from '@/src/store';
import type { EntityType, EntityWithBalance } from '@/src/types';
import { createDefaultEntities, createDefaultPlans } from '@/src/utils/seed';

export default function HomeScreen() {
	const {
		isLoading,
		entities,
		incomeVisible,
		draggedEntity,
		initialize,
		addEntity,
		setPlan,
		setDraggedEntity,
		toggleIncomeVisible,
		reorderEntity,
	} = useStore();

	const income = useEntitiesWithBalance('income');
	const accounts = useEntitiesWithBalance('account');
	const categories = useEntitiesWithBalance('category');
	const savings = useEntitiesWithBalance('saving');

	// Transaction modal state
	const [modalVisible, setModalVisible] = useState(false);
	const [fromEntity, setFromEntity] = useState<EntityWithBalance | null>(null);
	const [toEntity, setToEntity] = useState<EntityWithBalance | null>(null);

	// Detail modal state
	const [detailModalVisible, setDetailModalVisible] = useState(false);
	const [detailEntity, setDetailEntity] = useState<EntityWithBalance | null>(null);

	// Create modal state
	const [createModalVisible, setCreateModalVisible] = useState(false);
	const [createEntityType, setCreateEntityType] = useState<EntityType | null>(null);

	useEffect(() => {
		initialize();
	}, [initialize]);

	// Seed default data if empty
	useEffect(() => {
		async function seedData() {
			if (!isLoading && entities.length === 0) {
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
	}, [isLoading, entities.length, addEntity, setPlan]);

	// Combine all entities for lookup by ID
	const allEntities = useMemo(
		() => [...income, ...accounts, ...categories, ...savings],
		[income, accounts, categories, savings]
	);

	const handleDragStart = useCallback(
		(entity: EntityWithBalance) => {
			setDraggedEntity(entity);
		},
		[setDraggedEntity]
	);

	const handleDragEnd = useCallback(
		(entity: EntityWithBalance, targetId: string | null) => {
			setDraggedEntity(null);

			// If dropped on a valid target
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

			// If same type, reorder instead of creating transaction
			if (entity.type === targetEntity.type) {
				reorderEntity(entity.id, targetId);
				return;
			}

			// Different types: open transaction modal
			setFromEntity(entity);
			setToEntity(targetEntity);
			setModalVisible(true);
		},
		[setDraggedEntity, allEntities, reorderEntity]
	);

	const handleCloseModal = useCallback(() => {
		setModalVisible(false);
		setFromEntity(null);
		setToEntity(null);
	}, []);

	// const handleLongPress = useCallback((entity: EntityWithBalance) => {
	const handleTap = useCallback((entity: EntityWithBalance) => {
		// Clear any transaction selection state
		setFromEntity(null);
		setToEntity(null);
		// Open detail modal
		setDetailEntity(entity);
		setDetailModalVisible(true);
	}, []);

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

	// Re-measure drop zones when scrolling ends to account for position changes
	const handleScrollEnd = useCallback(() => {
		remeasureAllDropZones();
	}, []);

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

			{/* Content */}
			<ScrollView
				className="flex-1 overflow-visible"
				contentContainerClassName="overflow-visible"
				contentContainerStyle={{ paddingVertical: 12 }}
				onScrollEndDrag={handleScrollEnd}
				onMomentumScrollEnd={handleScrollEnd}
			>
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
						{...(incomeContentHeight === null && { onLayout: handleIncomeLayout })}
						pointerEvents={incomeVisible ? 'auto' : 'none'}
					>
						<EntityGrid
							title="Income"
							type="income"
							entities={income}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onTap={handleTap}
							onAdd={handleAdd}
							dropZonesDisabled={!incomeVisible}
						/>
					</View>
				</Animated.View>
				<EntityGrid
					title="Accounts · Total"
					type="account"
					entities={accounts}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onTap={handleTap}
					onAdd={handleAdd}
					horizontalScroll
				/>
				<EntityGrid
					title="Categories"
					type="category"
					entities={categories}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onTap={handleTap}
					onAdd={handleAdd}
					maxRows={3}
				/>
				<EntityGrid
					title="Savings · Goal"
					type="saving"
					entities={savings}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onTap={handleTap}
					onAdd={handleAdd}
					horizontalScroll
				/>

				{entities.length === 0 && (
					<View className="items-center px-4 py-10">
						<Text className="text-center font-sans text-ink-muted">
							Setting up your dashboard...
						</Text>
					</View>
				)}
			</ScrollView>

			{/* Transaction Modal */}
			<TransactionModal
				visible={modalVisible}
				fromEntity={fromEntity}
				toEntity={toEntity}
				onClose={handleCloseModal}
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
