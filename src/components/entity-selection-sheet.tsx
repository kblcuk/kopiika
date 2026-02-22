import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import type { Entity } from '@/src/types';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';

interface EntitySelectionSheetProps {
	visible: boolean;
	title: string;
	entities: Entity[];
	selectedId: string | null;
	onSelect: (entity: Entity) => void;
	onClose: () => void;
}

export function EntitySelectionSheet({
	visible,
	title,
	entities,
	selectedId,
	onSelect,
	onClose,
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
			>
				{/* Header */}
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Text className="font-sans-semibold text-base text-ink">{title}</Text>
					<Pressable onPress={onClose} hitSlop={20}>
						<X size={24} color={colors.ink.muted} />
					</Pressable>
				</View>

				{/* Entity grid */}
				<ScrollView className="flex-1 p-4">
					<View className="flex-row flex-wrap justify-start">
						{entities.map((entity) => {
							const IconComponent = getIcon(entity.icon || 'circle');
							const typeColors = getEntityTypeColors(entity.type);
							const isSelected = entity.id === selectedId;

							return (
								<Pressable
									key={entity.id}
									onPress={() => handleSelect(entity)}
									className="mb-4 w-1/3 items-center"
								>
									<View
										className={`mb-2 h-14 w-14 items-center justify-center rounded-full ${typeColors.bg} ${
											isSelected ? 'border-2 border-accent' : ''
										}`}
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
