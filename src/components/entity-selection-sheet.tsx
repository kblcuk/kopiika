import { View, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { Text } from './text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import type { Entity } from '@/src/types';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';

interface EntitySelectionSheetProps {
	visible: boolean;
	title: string;
	entities: Entity[];
	selectedId: string | null;
	onSelect: (entity: Entity) => void;
	onClose: () => void;
	testID?: string;
	/** Prefix for entity option testIDs to disambiguate multiple sheets */
	testIDPrefix?: string;
}

export function EntitySelectionSheet({
	visible,
	title,
	entities,
	selectedId,
	onSelect,
	onClose,
	testID,
	testIDPrefix,
}: EntitySelectionSheetProps) {
	const insets = useSafeAreaInsets();
	const handleSelect = (entity: Entity) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(entity);
		onClose();
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<View
				className="flex-1 bg-paper-50"
				style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
				testID={testID}
			>
				{/* Header */}
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Text className="font-sans-semibold text-base text-ink">{title}</Text>
					<Pressable onPress={onClose} hitSlop={20} testID="entity-selection-sheet-close">
						<X size={24} color={colors.ink.muted} />
					</Pressable>
				</View>

				{/* Entity grid */}
				<ScrollView className="flex-1 p-4">
					<View className="flex-row flex-wrap justify-start">
						{entities.map((entity) => {
							const IconComponent = getIcon(entity.icon || 'circle');
							const typeColors = getEntityColors(entity.type, entity.color);
							const isSelected = entity.id === selectedId;

							return (
								<Pressable
									key={entity.id}
									onPress={() => handleSelect(entity)}
									testID={`${testIDPrefix ?? 'entity-option'}-${entity.name}`}
									className="mb-4 w-1/3 items-center"
								>
									<View
										className={`mb-2 h-14 w-14 items-center justify-center rounded-full ${
											isSelected ? 'border-2 border-accent' : ''
										}`}
										style={{ backgroundColor: typeColors.bgColor }}
									>
										<IconComponent size={24} color={typeColors.iconColor} />
									</View>
									<Text
										className={`text-center font-sans text-xs ${
											isSelected
												? 'font-sans-semibold text-accent'
												: 'text-ink'
										}`}
										numberOfLines={2}
									>
										{entity.name}
									</Text>
								</Pressable>
							);
						})}
					</View>

					{entities.length === 0 && (
						<View className="items-center py-8">
							<Text className="font-sans text-sm text-ink-muted">
								No valid entities available
							</Text>
						</View>
					)}
				</ScrollView>
			</View>
		</Modal>
	);
}
