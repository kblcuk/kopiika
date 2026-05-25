import type { EntityType } from '@/src/types';

/**
 * Compute scroll speed based on how deep a touch position is in an edge zone.
 *
 * Returns 0 in the center, positive near the end (bottom/right),
 * negative near the start (top/left). Speed scales linearly with
 * proximity into the zone, capped at +-maxSpeed.
 */
export function computeEdgeSpeed(
	position: number,
	size: number,
	edgeZone: number,
	maxSpeed: number
): number {
	'worklet';
	if (position > size - edgeZone) {
		const proximity = (position - (size - edgeZone)) / edgeZone;
		return maxSpeed * Math.min(proximity, 1);
	}
	if (position < edgeZone) {
		const proximity = (edgeZone - position) / edgeZone;
		return -maxSpeed * Math.min(proximity, 1);
	}
	return 0;
}

/** Fixed index for each section type — matches rendering order in HomeScreen. */
export const SECTION_INDEX: Record<EntityType, number> = {
	income: 0,
	account: 1,
	category: 2,
	saving: 3,
};

export const SECTION_COUNT = Object.keys(SECTION_INDEX).length;

/**
 * Pick the section index whose visible bounds contain `touchY` and which has
 * horizontal scroll headroom. Returns -1 if no section qualifies.
 *
 * Bounds are stored content-relative (`screenY + scrollOffsetY` at measurement
 * time); subtract the current `scrollOffsetY` to get the live screen-space
 * range. Sections without overflow (`maxOffsets[i] <= 0`) are skipped — when a
 * collapsed section retains stale bounds, the next section is checked instead
 * of the loop bailing out.
 */
export function pickHoveredSection(
	touchY: number,
	scrollOffsetY: number,
	bounds: readonly { top: number; bot: number }[],
	maxOffsets: readonly number[]
): number {
	'worklet';
	for (const [i, b] of bounds.entries()) {
		const screenTop = b.top - scrollOffsetY;
		const screenBottom = b.bot - scrollOffsetY;
		if (screenBottom <= screenTop) continue;
		if (touchY < screenTop || touchY > screenBottom) continue;
		if ((maxOffsets[i] ?? 0) <= 0) continue;
		return i;
	}
	return -1;
}
