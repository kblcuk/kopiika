/**
 * Tracks whether a held-in-place gesture has crossed the long-press threshold.
 *
 * KII-154: the dashboard's `Sortable.Grid` lifts a bubble 150 ms after
 * touch-down, so a plain RNGH `LongPress` would fire *mid-drag* — navigating
 * away while the pan is still live, and hijacking a deliberate slow drag start.
 * Instead the grid arms a timer when the drag begins and acts on release:
 * movement past `tolerancePx` disarms permanently, so an ordinary drag is never
 * mistaken for a long press.
 */
export interface LongPressArmer {
	/** Begin the countdown. Resets any state left over from a prior gesture. */
	start(): void;
	/** Feed a drag position. The first call records the origin. */
	move(x: number, y: number): void;
	/** Finish the gesture. Returns whether it armed. Always resets. */
	end(): boolean;
	/** Drop a pending countdown without reporting (unmount). */
	cancel(): void;
}

interface LongPressArmerOptions {
	delayMs: number;
	tolerancePx: number;
	/** Fired once, on the UI-visible moment the gesture arms (haptic cue). */
	onArm: () => void;
}

/**
 * Arm delay measured from drag start, i.e. ~150 ms after touch-down, so the
 * gesture arms at ~600 ms. Deliberately past the 500 ms at which RNGH's `Tap`
 * fails, which keeps tap and long-press mutually exclusive by construction —
 * `onTap` and `onDragEnd` have no guaranteed ordering, so an overlap could not
 * be arbitrated by a flag.
 */
export const ARM_DELAY_MS = 450;

/** Matches `dragActivationFailOffset` and `Sortable.Touchable`'s `failDistance`. */
export const MOVE_TOLERANCE_PX = 10;

export function createLongPressArmer({
	delayMs,
	tolerancePx,
	onArm,
}: LongPressArmerOptions): LongPressArmer {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let origin: { x: number; y: number } | null = null;
	let armed = false;
	let disarmed = false;

	const clearPending = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const reset = () => {
		clearPending();
		origin = null;
		armed = false;
		disarmed = false;
	};

	return {
		start() {
			reset();
			timer = setTimeout(() => {
				timer = null;
				if (disarmed) return;
				armed = true;
				onArm();
			}, delayMs);
		},

		move(x, y) {
			if (disarmed) return;
			if (!origin) {
				origin = { x, y };
				return;
			}
			const dx = x - origin.x;
			const dy = y - origin.y;
			if (Math.sqrt(dx * dx + dy * dy) <= tolerancePx) return;
			disarmed = true;
			armed = false;
			clearPending();
		},

		end() {
			const wasArmed = armed;
			reset();
			return wasArmed;
		},

		cancel() {
			reset();
		},
	};
}
