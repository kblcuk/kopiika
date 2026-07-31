import { View } from 'react-native';

import { Text } from './text';
import { BUBBLE_WIDTH, BUBBLE_HEIGHT, COLUMN_GAP, ROW_GAP } from './entity-grid-layout';

// Fixed placeholder bubble count per row. The real section scrolls horizontally,
// so the exact column count only changes off-screen width — it has no bearing on
// the reserved *height* that prevents the mount layout jump. A handful reads as
// content during the sub-2-frame flash. (Matches the old VISIBLE_CAP.)
const PLACEHOLDER_COLUMNS = 5;

interface EntitySectionSkeletonProps {
	title: string;
	// Empty sections render a single bubble (mirroring the grid's empty branch);
	// populated sections reserve the full maxRows height. This is the only thing
	// the real item count affects in the placeholder.
	isEmpty: boolean;
	maxRows?: number;
	// A collapsed section reserves only its header, matching the real grid.
	collapsed?: boolean;
}

/**
 * Static placeholder for a deferred entity section. Mirrors SortableEntityGrid's
 * title divider and reserves the same footprint (BUBBLE_HEIGHT × maxRows rows +
 * matching padding) so the real grid swaps in without a layout jump.
 * Deliberately cheap: no gestures, no reanimated, no store subscription.
 */
export function EntitySectionSkeleton({
	title,
	isEmpty,
	maxRows = 1,
	collapsed = false,
}: EntitySectionSkeletonProps) {
	return (
		<View className="overflow-visible">
			{/* Title divider — mirrors SortableEntityGrid, including the ~26px tall
			    row reserved by its edit-mode toggle Pressable. */}
			<View className="flex-row items-center px-4" style={{ minHeight: 26 }}>
				<View className="h-px flex-1 bg-paper-300" />
				<Text className="px-3 font-sans text-xs uppercase tracking-wider text-ink-muted">
					{title}
				</Text>
				<View className="h-px flex-1 bg-paper-300" />
			</View>

			{collapsed ? null : isEmpty ? (
				// Mirrors the real empty branch: a bare `flex-row px-4` row with a
				// single placeholder bubble, no scroll-content padding.
				<View className="flex-row px-4">
					<View
						testID="skeleton-bubble"
						className="rounded-2xl bg-paper-200"
						style={{ width: BUBBLE_WIDTH, height: BUBBLE_HEIGHT }}
					/>
				</View>
			) : (
				// Placeholder rows — same padding as the grid's scroll content.
				<View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
					{Array.from({ length: maxRows }).map((_, r) => (
						<View
							key={r}
							className="flex-row"
							style={{ marginTop: r === 0 ? 0 : ROW_GAP }}
						>
							{Array.from({ length: PLACEHOLDER_COLUMNS }).map((_, c) => (
								<View
									key={c}
									testID="skeleton-bubble"
									className="rounded-2xl bg-paper-200"
									style={{
										width: BUBBLE_WIDTH,
										height: BUBBLE_HEIGHT,
										marginLeft: c === 0 ? 0 : COLUMN_GAP,
									}}
								/>
							))}
						</View>
					))}
				</View>
			)}
		</View>
	);
}
