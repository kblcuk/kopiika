import { View } from 'react-native';

interface ProgressBarProps {
	progress: number; // 0-100
	isOverspent: boolean;
}

export function ProgressBar({ progress, isOverspent }: ProgressBarProps) {
	const clampedProgress = Math.min(Math.max(progress, 0), 100);

	return (
		<View className="h-1.5 w-full rounded-full bg-paper-300">
			<View
				className={`h-full rounded-full ${isOverspent ? 'bg-negative' : 'bg-ink-faint'}`}
				style={{ width: `${clampedProgress}%` }}
			/>
		</View>
	);
}
