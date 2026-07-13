import { View } from 'react-native';

import { Text } from './text';
import { BUBBLE_WIDTH, BUBBLE_HEIGHT, COLUMN_GAP, ROW_GAP } from './entity-grid-layout';

// Only what fits on screen matters for reserving space; the real section
// scrolls horizontally, so a handful of placeholders is enough.
const VISIBLE_CAP = 5;

interface EntitySectionSkeletonProps {
	title: string;
	entityCount: number;
	maxRows?: number;
}

/**
 * Static placeholder for a deferred entity section. Mirrors SortableEntityGrid's
 * title divider and reserves the same footprint (BUBBLE_HEIGHT rows + matching
 * padding) so the real grid swaps in without a layout jump. Deliberately cheap:
 * no gestures, no reanimated, no store subscription.
 */
export function EntitySectionSkeleton({
	title,
	entityCount,
	maxRows = 1,
}: EntitySectionSkeletonProps) {
	const count = Math.max(entityCount, 1);
	const rows = Math.min(maxRows, count);
	const columns = Math.min(Math.ceil(count / maxRows), VISIBLE_CAP);

	return (
		<View className="overflow-visible">
			{/* Title divider — mirrors SortableEntityGrid */}
			<View className="flex-row items-center px-4">
				<View className="h-px flex-1 bg-paper-300" />
				<Text className="px-3 font-sans text-xs uppercase tracking-wider text-ink-muted">
					{title}
				</Text>
				<View className="h-px flex-1 bg-paper-300" />
			</View>

			{/* Placeholder rows — same padding as the grid's scroll content */}
			<View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
				{Array.from({ length: rows }).map((_, r) => (
					<View key={r} className="flex-row" style={{ marginTop: r === 0 ? 0 : ROW_GAP }}>
						{Array.from({ length: columns }).map((_, c) => (
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
		</View>
	);
}
