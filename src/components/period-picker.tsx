import { View, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from './text';

import { formatPeriod } from '@/src/utils/format';
import { colors } from '@/src/theme/colors';

interface PeriodPickerProps {
	period: string; // YYYY-MM
	onChange: (period: string) => void;
}

function adjustPeriod(period: string, delta: number): string {
	const [year, month] = period.split('-').map(Number);
	const date = new Date(year, month - 1 + delta);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function PeriodPicker({ period, onChange }: PeriodPickerProps) {
	const handlePrevious = () => onChange(adjustPeriod(period, -1));
	const handleNext = () => onChange(adjustPeriod(period, 1));

	return (
		<View className="flex-row items-center justify-between px-5 py-3">
			<Pressable
				onPress={handlePrevious}
				hitSlop={16}
				className="rounded-full p-2 active:bg-paper-200"
			>
				<ChevronLeft size={24} color={colors.ink.medium} />
			</Pressable>
			<Text className="font-sans-semibold text-lg text-ink">{formatPeriod(period)}</Text>
			<Pressable
				onPress={handleNext}
				hitSlop={16}
				className="rounded-full p-2 active:bg-paper-200"
			>
				<ChevronRight size={24} color={colors.ink.medium} />
			</Pressable>
		</View>
	);
}
