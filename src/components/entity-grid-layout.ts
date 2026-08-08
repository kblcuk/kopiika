// Shared layout dimensions for the entity board. Imported by both the live
// SortableEntityGrid and the EntitySectionSkeleton so a deferred section's
// placeholder reserves exactly the height/width its real grid will occupy.
export const BUBBLE_WIDTH = 96;
export const COLUMN_GAP = 4;
export const ROW_GAP = 4;
export const BUBBLE_HEIGHT = 136;

// Padding around a populated section's scrolling grid content. Shared so the
// skeleton reserves the same footprint — hardcoding it in both places let the
// two drift, which reintroduces the mount jump the skeleton exists to prevent.
export const SECTION_PADDING_H = 12;
export const SECTION_PADDING_V = 4;

/**
 * Rows a section should ask its horizontal grid for (KII-152).
 *
 * A horizontal `Sortable.Grid` sizes its container as
 * `rows * (rowHeight + rowGap) - rowGap` — the item count never enters into it
 * (react-native-sortables `SortableGrid.tsx`, `animatedInnerStyle`). A section
 * holding fewer entities than its row budget therefore reserves a band of dead
 * space under the last bubble unless it asks for fewer rows.
 *
 * Items fill column-major (`col = floor(i / rows)`, `row = i % rows`), so
 * clamping to the entity count keeps every reserved row occupied. The add
 * bubble is deliberately *not* counted: leaving it out lets it flow into the
 * next column beside the entities rather than stacking underneath them, which
 * is how the single-row sections already look.
 */
export function resolveGridRows({
	entityCount,
	maxRows,
}: {
	entityCount: number;
	maxRows: number;
}): number {
	return Math.max(1, Math.min(maxRows, entityCount));
}
