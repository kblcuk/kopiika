import { useEffect, useState } from 'react';

/**
 * Latch that flips to `true` the first time `visible` becomes true and never
 * flips back. Used to keep a modal unmounted until first opened — removing its
 * render + native commit from cold start — while preserving its normal
 * mount/animation lifecycle for the rest of the session.
 */
export function useHasOpened(visible: boolean): boolean {
	const [opened, setOpened] = useState(false);
	useEffect(() => {
		if (visible) setOpened(true);
	}, [visible]);
	return opened;
}
