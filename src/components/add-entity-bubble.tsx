import { View, Pressable, DimensionValue } from 'react-native';
import { Plus } from 'lucide-react-native';
import type { EntityType } from '@/src/types';

interface AddEntityBubbleProps {
	type: EntityType;
	onPress: (type: EntityType) => void;
	width?: DimensionValue;
}

export function AddEntityBubble({ type, onPress, width = '25%' }: AddEntityBubbleProps) {
	return (
		<Pressable
			onPress={() => onPress(type)}
			className="items-center px-2 py-1.5"
			style={{ width }}
		>
			{/* Placeholder for name spacing */}
			<View className="mb-1.5 h-4" />

			{/* Dashed circle with plus icon */}
			<View className="relative mb-1.5 h-14 w-14 items-center justify-center">
				<View
					className="border-paper-400 h-14 w-14 items-center justify-center rounded-full border-2 border-dashed"
					style={{ backgroundColor: 'transparent' }}
				>
					<Plus size={24} color="#9A8A78" />
				</View>
			</View>

			{/* Placeholder for amounts spacing */}
			<View className="h-4" />
			<View className="h-3" />
		</Pressable>
	);
}
