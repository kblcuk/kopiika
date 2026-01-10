import Svg, { Circle } from 'react-native-svg';
import { getProgressState } from '@/constants/progress';

interface CircularProgressProps {
	size: number;
	strokeWidth?: number;
	progress: number; // 0-100+, can exceed 100 for overspending
	inverse?: boolean; // For savings/goals where higher progress is better
	children?: React.ReactNode;
}

// Theme colors from tailwind config
const COLORS = {
	track: {
		default: '#F5F1EB', // paper-200 (light, subtle)
		healthy: '#E8F5EC', // Light green tint
		warning: '#FFF4E6', // Light amber tint
		overspent: '#FDEAEA', // Light red tint
	},
	progress: {
		healthy: '#2F7D4A', // positive.DEFAULT
		warning: '#D4842F', // warning.DEFAULT
		overspent: '#C23030', // negative.DEFAULT
	},
};

export function CircularProgress({
	size,
	strokeWidth = 3,
	progress,
	inverse = false,
	children,
}: CircularProgressProps) {
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const clampedProgress = Math.min(Math.max(progress, 0), 100);

	// Calculate stroke dash offset (progress starts from bottom, fills clockwise)
	const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

	const progressState = getProgressState(progress, inverse);

	const getColors = () => {
		switch (progressState) {
			case 'healthy':
				return {
					track: COLORS.track.healthy,
					progress: COLORS.progress.healthy,
				};
			case 'warning':
				return {
					track: COLORS.track.warning,
					progress: COLORS.progress.warning,
				};
			case 'overspent':
				return {
					track: COLORS.track.overspent,
					progress: COLORS.progress.overspent,
				};
		}
	};

	const colors = getColors();

	return (
		<Svg width={size} height={size}>
			{/* Background track */}
			<Circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke={colors.track}
				strokeWidth={strokeWidth}
				fill="transparent"
			/>
			{/* Progress arc */}
			<Circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke={colors.progress}
				strokeWidth={strokeWidth}
				fill="transparent"
				strokeDasharray={circumference}
				strokeDashoffset={strokeDashoffset}
				strokeLinecap="round"
				transform={`rotate(90 ${size / 2} ${size / 2})`} // Rotate to start from bottom
			/>
		</Svg>
	);
}
