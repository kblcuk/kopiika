import { Pressable, View } from 'react-native';

import { X } from 'lucide-react-native';

import { colors } from '@/src/theme/colors';

interface SheetHeaderProps {
	onClose: () => void;
	title?: string;
}

export function SheetHeader({ onClose }: SheetHeaderProps) {
	return (
		<View className="relative items-center py-4">
			{/* Grabber pill */}
			<View testID="sheet-grabber" className="h-1 w-9 rounded-full bg-paper-300" />

			{/* Close button */}
			<Pressable
				testID="sheet-close"
				onPress={onClose}
				hitSlop={20}
				className="absolute right-3 top-2 h-7 w-7 items-center justify-center rounded-full bg-paper-200"
			>
				<X size={14} color={colors.ink.muted} />
			</Pressable>
		</View>
	);
}
