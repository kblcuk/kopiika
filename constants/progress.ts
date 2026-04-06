/**
 * Shared configuration for progress indicators across the app
 */

export const PROGRESS_THRESHOLDS = {
	/** Progress below this threshold shows as healthy (green) */
	healthy: 60,
	/** Progress above healthy but below limit shows as warning (amber) */
	limit: 100,
	/** Progress above limit shows as overspent (red) */
} as const;

export type ProgressState = 'healthy' | 'warning' | 'overspent' | 'neutral' | 'goal';

/**
 * Determines the progress state based on percentage
 * @param progress - Progress percentage (0-100+)
 * @param inverse - When true, inverts the logic (for goals like savings where higher is better)
 * @returns The current progress state
 */
export function getProgressState(progress: number, inverse = false): ProgressState {
	if (inverse) {
		// For savings/goals: light blue while in progress, green when reached
		if (progress >= PROGRESS_THRESHOLDS.limit) {
			return 'healthy'; // Maps to green color
		}
		return 'goal'; // Maps to info/blue color
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
