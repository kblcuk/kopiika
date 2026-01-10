import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { formatPeriod } from '@/src/utils/format';
import { createDefaultEntities, createDefaultPlans } from '@/src/utils/seed';

export default function HomeScreen() {
	const {
		isLoading,
		currentPeriod,
		entities,
		incomeVisible,
		initialize,
		addEntity,
		setPlan,
		setDraggedEntity,
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

			// If dropped on a valid target, open transaction modal
			if (targetId) {
				const targetEntity = allEntities.find((e) => e.id === targetId);
				if (targetEntity) {
					setFromEntity(entity);
					setToEntity(targetEntity);
					setModalVisible(true);
				}
			}
		},
		[setDraggedEntity, allEntities]
	);

	const handleTap = useCallback(
		(entity: EntityWithBalance) => {
			// If already have a from entity, this becomes the to entity
			if (fromEntity && fromEntity.id !== entity.id) {
				setToEntity(entity);
				setModalVisible(true);
			} else {
				// First tap - set as from entity
				setFromEntity(entity);
			}
		},
		[fromEntity]
	);

	const handleCloseModal = useCallback(() => {
		setModalVisible(false);
		setFromEntity(null);
		setToEntity(null);
	}, []);

	const handleLongPress = useCallback((entity: EntityWithBalance) => {
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

	if (isLoading) {
		return (
			<SafeAreaView className="flex-1 items-center justify-center bg-paper-100">
				<ActivityIndicator size="large" color="#6B5D4A" />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView className="flex-1 bg-paper-50" edges={['top']}>
			{/* Summary bar */}
			<SummaryHeader fromEntity={!modalVisible ? fromEntity : null} />

			{/* Content */}
			<ScrollView
				className="flex-1"
				contentContainerStyle={{ paddingVertical: 12 }}
				onScrollEndDrag={handleScrollEnd}
				onMomentumScrollEnd={handleScrollEnd}
			>
				{incomeVisible && (
					<EntityGrid
						title="Income"
						type="income"
						entities={income}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						onTap={handleTap}
						onLongPress={handleLongPress}
						onAdd={handleAdd}
					/>
				)}
				<EntityGrid
					title="Accounts"
					type="account"
					entities={accounts}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onTap={handleTap}
					onLongPress={handleLongPress}
					onAdd={handleAdd}
				/>
				<EntityGrid
					title="Categories"
					type="category"
					entities={categories}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onTap={handleTap}
					onLongPress={handleLongPress}
					onAdd={handleAdd}
				/>
				<EntityGrid
					title="Savings"
					type="saving"
					entities={savings}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onTap={handleTap}
					onLongPress={handleLongPress}
					onAdd={handleAdd}
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
