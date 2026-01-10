import { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { ChevronDown, X } from 'lucide-react-native';

import type { Entity, EntityType } from '@/src/types';
import { useStore } from '@/src/store';
import { useShallow } from 'zustand/react/shallow';
import { getIcon } from '@/src/constants/icon-registry';

interface EntityFilterProps {
	selectedEntityId: string | null;
	onChange: (entityId: string | null) => void;
}

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
	income: 'Income',
	account: 'Accounts',
	category: 'Categories',
	saving: 'Savings',
};

const ENTITY_TYPE_ORDER: EntityType[] = ['income', 'account', 'category', 'saving'];

export function EntityFilter({ selectedEntityId, onChange }: EntityFilterProps) {
	const [visible, setVisible] = useState(false);

	const entities = useStore(useShallow((state) => state.entities));

	const selectedEntity = selectedEntityId
		? entities.find((e) => e.id === selectedEntityId)
		: null;

	const groupedEntities = ENTITY_TYPE_ORDER.reduce(
		(acc, type) => {
			const filtered = entities
				.filter((e) => e.type === type)
				.sort((a, b) => a.order - b.order);
			if (filtered.length > 0) {
				acc[type] = filtered;
			}
			return acc;
		},
		{} as Record<EntityType, Entity[]>
	);

	const handleSelect = (entityId: string | null) => {
		onChange(entityId);
		setVisible(false);
	};

	return (
		<>
			<Pressable
				onPress={() => setVisible(true)}
				className="border-paper-400 mx-5 flex-row items-center justify-between rounded-lg border bg-paper-100 px-4 py-3 active:bg-paper-200"
			>
				<Text className="font-sans text-base text-ink">
					{selectedEntity ? selectedEntity.name : 'All Entities'}
				</Text>
				<ChevronDown size={20} color="#6B5D4A" />
			</Pressable>

			<Modal
				visible={visible}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={() => setVisible(false)}
			>
				<View className="flex-1 bg-paper-50">
					{/* Header */}
					<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
						<Text className="font-sans-semibold text-base text-ink">
							Filter by Entity
						</Text>
						<Pressable onPress={() => setVisible(false)} hitSlop={20}>
							<X size={24} color="#4A3F2E" />
						</Pressable>
					</View>

					<ScrollView className="flex-1">
						{/* All Entities option */}
						<Pressable
							onPress={() => handleSelect(null)}
							className={`border-b border-paper-300 px-5 py-4 active:bg-paper-200 ${
								!selectedEntityId ? 'bg-paper-200' : ''
							}`}
						>
							<Text className="font-sans-medium text-base text-ink">
								All Entities
							</Text>
						</Pressable>

						{/* Grouped entities */}
						{ENTITY_TYPE_ORDER.map((type) => {
							const typeEntities = groupedEntities[type];
							if (!typeEntities) return null;

							return (
								<View key={type}>
									<View className="bg-paper-100 px-5 py-2">
										<Text className="font-sans text-xs uppercase tracking-wider text-ink-muted">
											{ENTITY_TYPE_LABELS[type]}
										</Text>
									</View>
									{typeEntities.map((entity) => {
										const Icon = getIcon(entity.icon || 'circle');
										const isSelected = selectedEntityId === entity.id;

										return (
											<Pressable
												key={entity.id}
												onPress={() => handleSelect(entity.id)}
												className={`flex-row items-center border-b border-paper-300 px-5 py-4 active:bg-paper-200 ${
													isSelected ? 'bg-paper-200' : ''
												}`}
											>
												<View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-paper-300">
													<Icon size={16} color="#6B5D4A" />
												</View>
												<Text className="font-sans text-base text-ink">
													{entity.name}
												</Text>
											</Pressable>
										);
									})}
								</View>
							);
						})}
					</ScrollView>
				</View>
			</Modal>
		</>
	);
}
