/**
 * Shared configuration for progress indicators across the app
 */

export const PROGRESS_THRESHOLDS = {
	/** Progress below this threshold shows as healthy (green) */
	healthy: 70,
	/** Progress above healthy but below limit shows as warning (amber) */
	limit: 100,
	/** Progress above limit shows as overspent (red) */
} as const;

export type ProgressState = 'healthy' | 'warning' | 'overspent' | 'neutral';

/**
 * Determines the progress state based on percentage
 * @param progress - Progress percentage (0-100+)
 * @param inverse - When true, inverts the logic (for goals like savings where higher is better)
 * @returns The current progress state
 */
export function getProgressState(progress: number, inverse = false): ProgressState {
	if (inverse) {
		// For savings/goals: red when low, yellow when approaching, green when achieved
		if (progress < PROGRESS_THRESHOLDS.healthy) {
			return 'overspent'; // Maps to red color
		}
		if (progress < PROGRESS_THRESHOLDS.limit) {
			return 'warning'; // Maps to yellow color
		}
		return 'healthy'; // Maps to green color
	}

	// For spending: green when low, yellow when approaching, red when over
	if (progress < PROGRESS_THRESHOLDS.healthy) {
		return 'healthy';
	}
	if (progress < PROGRESS_THRESHOLDS.limit) {
		return 'warning';
	}
	return 'overspent';
}
