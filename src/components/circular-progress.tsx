import Svg, { Circle } from 'react-native-svg';

interface CircularProgressProps {
	size: number;
	strokeWidth?: number;
	progress: number; // 0-100
	isOverspent?: boolean;
	children?: React.ReactNode;
}

// Theme colors from tailwind config
const COLORS = {
	track: '#F5F1EB', // paper-200 (light, subtle)
	progress: '#6B5D4A', // ink-muted (matches icon color)
	overspent: '#9B2C2C', // negative
};

export function CircularProgress({
	size,
	strokeWidth = 3,
	progress,
	isOverspent = false,
	children,
}: CircularProgressProps) {
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const clampedProgress = Math.min(Math.max(progress, 0), 100);

	// Calculate stroke dash offset (progress starts from bottom, fills clockwise)
	const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

	const progressColor = isOverspent ? COLORS.overspent : COLORS.progress;

	return (
		<Svg width={size} height={size}>
			{/* Background track */}
			<Circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke={COLORS.track}
				strokeWidth={strokeWidth}
				fill="transparent"
			/>
			{/* Progress arc */}
			<Circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke={progressColor}
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
