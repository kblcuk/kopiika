import { View } from 'react-native';
import { getProgressState } from '@/constants/progress';
import { colors } from '@/src/theme/colors';

interface ProgressBarProps {
	progress: number; // 0-100+, can exceed 100 for overspending
	inverse?: boolean; // For savings/goals where higher progress is better
	planned?: number; // When 0 or undefined with activity, shows neutral state
}

// Minimum visible fill so a real-but-tiny actual always shows a sliver.
// 2% on a typical Summary row (~280-340px wide) ≈ 6-7px — clearly visible.
const MIN_FILL_PERCENT = 2;

const TRACK_COLORS = {
	healthy: colors.track.healthy,
	warning: colors.track.warning,
	overspent: colors.track.overspent,
	neutral: colors.track.DEFAULT,
	goal: colors.track.goal,
} as const;

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
			case 'goal':
				return 'bg-info';
		}
	};

	// Enforce minimum sliver only when there's real activity.
	const fillPercent =
		progress > 0 && clampedProgress < MIN_FILL_PERCENT ? MIN_FILL_PERCENT : clampedProgress;

	return (
		<View
			testID="progress-bar-track"
			className="h-1.5 w-full rounded-full"
			style={{ backgroundColor: TRACK_COLORS[progressState] }}
		>
			<View
				testID="progress-bar-fill"
				className={`h-full rounded-full ${getProgressColor()}`}
				style={{ width: `${fillPercent}%` }}
			/>
		</View>
	);
}
