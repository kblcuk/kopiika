import { useEffect, useState } from 'react';

/**
 * Reveals deferred UI incrementally, one unit per animation frame, to keep the
 * first frame cheap. Returns how many deferred sections are live: starts at 0
 * (only always-live content paints on frame 1) and climbs to `total`, one per
 * frame, via a chained requestAnimationFrame that self-paces to real commit
 * time. Stops scheduling at `total`; cancels any pending frame on unmount.
 */
export function useStaggeredReveal(total: number): number {
	const [revealed, setRevealed] = useState(0);
	useEffect(() => {
		if (revealed >= total) return;
		const id = requestAnimationFrame(() => setRevealed((r) => r + 1));
		return () => cancelAnimationFrame(id);
	}, [revealed, total]);
	return revealed;
}
