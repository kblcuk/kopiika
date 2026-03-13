import { View, Pressable, DimensionValue } from 'react-native';
import { Plus } from 'lucide-react-native';
import type { EntityType } from '@/src/types';
import { colors } from '@/src/theme/colors';

interface AddEntityBubbleProps {
	type: EntityType;
	onPress: (type: EntityType) => void;
	width?: DimensionValue;
}

export function AddEntityBubble({ type, onPress }: AddEntityBubbleProps) {
	return (
		<Pressable onPress={() => onPress(type)} className="w-24 items-center py-1">
			{/* Placeholder for name spacing */}
			<View className="mb-2.5 h-8" />

			{/* Dashed circle with plus icon */}
			<View className="relative h-14 w-14 items-center justify-center">
				<View
					className="border-paper-400 h-14 w-14 items-center justify-center rounded-full border-2 border-dashed"
					style={{ backgroundColor: 'transparent' }}
				>
					<Plus size={24} color={colors.ink.placeholder} />
				</View>
			</View>

			{/* Placeholder for amounts spacing */}
			<View className="h-4" />
			<View className="h-3" />
		</Pressable>
	);
}
