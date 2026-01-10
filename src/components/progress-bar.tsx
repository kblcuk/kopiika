import { View } from 'react-native';
import { getProgressState } from '@/constants/progress';

interface ProgressBarProps {
	progress: number; // 0-100+, can exceed 100 for overspending
	inverse?: boolean; // For savings/goals where higher progress is better
}

export function ProgressBar({ progress, inverse = false }: ProgressBarProps) {
	const clampedProgress = Math.min(Math.max(progress, 0), 100);
	const progressState = getProgressState(progress, inverse);

	const getProgressColor = () => {
		switch (progressState) {
			case 'healthy':
				return 'bg-positive';
			case 'warning':
				return 'bg-warning';
			case 'overspent':
				return 'bg-negative';
		}
	};

	return (
		<View className="h-1.5 w-full rounded-full bg-paper-300">
			<View
				className={`h-full rounded-full ${getProgressColor()}`}
				style={{ width: `${clampedProgress}%` }}
			/>
		</View>
	);
}
