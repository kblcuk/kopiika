import { useCallback, useState } from 'react';

export interface UseBoardEditMode {
	/** Whether the board is currently in edit mode. */
	editing: boolean;
	/** Flips the board in and out of edit mode. */
	toggle: () => void;
}

/**
 * Owns the home board's edit-mode flag. Edit mode changes how taps and drags
 * behave everywhere at once: a tap opens the entity detail modal instead of
 * starting a transaction, and a drag reorders within its section instead of
 * moving money between sections.
 *
 * KII-148: this used to be four independent per-section toggles driven by a
 * pencil/checkmark pair on each section divider. Testers read those icons as
 * status indicators rather than buttons, so the control collapsed into a single
 * pencil in the summary header backed by the one boolean here — which is also
 * what lets the whole screen tint while it's on.
 *
 * Deliberately component state, not store state: edit mode is a transient
 * posture, and restoring it on a cold start would drop the user onto a board
 * where tapping a category doesn't record a spend.
 */
export function useBoardEditMode(): UseBoardEditMode {
	const [editing, setEditing] = useState(false);
	const toggle = useCallback(() => setEditing((prev) => !prev), []);
	return { editing, toggle };
}
