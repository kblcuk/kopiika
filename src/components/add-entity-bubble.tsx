import { View, Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
import type { EntityType } from '@/src/types';

interface AddEntityBubbleProps {
	type: EntityType;
	onPress: (type: EntityType) => void;
}

export function AddEntityBubble({ type, onPress }: AddEntityBubbleProps) {
	return (
		<Pressable onPress={() => onPress(type)} className="items-center px-3.5 py-1.5">
			{/* Placeholder for name spacing */}
			<View className="mb-1.5 h-4" />

			{/* Dashed circle with plus icon */}
			<View className="relative mb-1.5 h-[72px] w-[72px] items-center justify-center px-4">
				<View
					className="h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-paper-400"
					style={{ backgroundColor: 'transparent' }}
				>
					<Plus size={28} color="#9A8A78" />
				</View>
			</View>

			{/* Placeholder for amounts spacing */}
			<View className="h-4" />
			<View className="h-3" />
		</Pressable>
	);
}
