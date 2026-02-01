import { View } from 'react-native';
import { getProgressState } from '@/constants/progress';

interface ProgressBarProps {
	progress: number; // 0-100+, can exceed 100 for overspending
	inverse?: boolean; // For savings/goals where higher progress is better
	planned?: number; // When 0 or undefined with activity, shows neutral state
}

export function ProgressBar({ progress, inverse = false, planned }: ProgressBarProps) {
	const clampedProgress = Math.min(Math.max(progress, 0), 100);
	const hasNoPlan = planned === 0 || planned === undefined;
	const progressState =
		hasNoPlan && progress > 0 ? 'neutral' : getProgressState(progress, inverse);

	const getProgressColor = () => {
		switch (progressState) {
			case 'healthy':
				return 'bg-positive';
			case 'warning':
				return 'bg-warning';
			case 'overspent':
				return 'bg-negative';
			case 'neutral':
				return 'bg-ink-muted';
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
