/**
 * Which board action each bubble gesture triggers.
 *
 * KII-154 made tap "record something here" and long-press "open history", but
 * testers split on which way round they want it — the same hold that feels
 * natural to one user reads as slow to another. The pair is always a swap, so
 * one preference drives both gestures and the two can never both mean the same
 * thing.
 */
export type BubbleGesture = 'tap' | 'longPress';

/** `add` opens the quick-add flow; `history` navigates to filtered history. */
export type BubbleAction = 'add' | 'history';

export type BubbleGestureMode = 'tap-adds' | 'tap-opens-history';

/** The KII-154 behaviour, kept as the default so existing users see no change. */
export const DEFAULT_BUBBLE_GESTURE_MODE: BubbleGestureMode = 'tap-adds';

export function isBubbleGestureMode(value: unknown): value is BubbleGestureMode {
	return value === 'tap-adds' || value === 'tap-opens-history';
}

export function actionForGesture(mode: BubbleGestureMode, gesture: BubbleGesture): BubbleAction {
	const tapAction: BubbleAction = mode === 'tap-adds' ? 'add' : 'history';
	return gesture === 'tap' ? tapAction : tapAction === 'add' ? 'history' : 'add';
}

/**
 * Inverse of `actionForGesture`, for the settings pickers: choosing an action
 * for either gesture fully determines the mode, so the other picker follows.
 */
export function modeForGestureAction(
	gesture: BubbleGesture,
	action: BubbleAction
): BubbleGestureMode {
	const tapAdds = gesture === 'tap' ? action === 'add' : action === 'history';
	return tapAdds ? 'tap-adds' : 'tap-opens-history';
}

export const BUBBLE_ACTION_LABELS: Record<BubbleAction, string> = {
	add: 'Add transaction',
	history: 'Open history',
};

export const BUBBLE_GESTURE_LABELS: Record<BubbleGesture, string> = {
	tap: 'Tap',
	longPress: 'Long press',
};
