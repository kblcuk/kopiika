import { useState } from 'react';
import {
	View,
	Text,
	Pressable,
	ScrollView,
	type LayoutChangeEvent,
	useWindowDimensions,
} from 'react-native';

import { getIcon } from '@/src/constants/icon-registry';
import { colors } from '@/src/theme/colors';

interface EntityIconPickerProps {
	icons: string[];
	selectedIcon: string;
	onSelect: (icon: string) => void;
	optionTestIDPrefix: string;
}

const MAX_RESULTS_HEIGHT = 216;
const DEFAULT_VISIBLE_ROWS = 2;
const ICON_BUTTON_SIZE = 48;
const ICON_GAP = 8;
const MODAL_HORIZONTAL_PADDING = 40;

function getColumnCount(width: number): number {
	return Math.max(
		1,
		Math.floor((Math.max(width, ICON_BUTTON_SIZE) + ICON_GAP) / (ICON_BUTTON_SIZE + ICON_GAP))
	);
}

function chunkIcons(icons: string[], rowSize: number): string[][] {
	const rows: string[][] = [];

	for (let index = 0; index < icons.length; index += rowSize) {
		rows.push(icons.slice(index, index + rowSize));
	}

	return rows;
}

export function EntityIconPicker({
	icons,
	selectedIcon,
	onSelect,
	optionTestIDPrefix,
}: EntityIconPickerProps) {
	const [showAll, setShowAll] = useState(false);
	const [measuredGridWidth, setMeasuredGridWidth] = useState<number | null>(null);
	const { width: screenWidth } = useWindowDimensions();
	const estimatedGridWidth = Math.max(screenWidth - MODAL_HORIZONTAL_PADDING, ICON_BUTTON_SIZE);
	const columnCount = getColumnCount(measuredGridWidth ?? estimatedGridWidth);
	const collapsedIconCount = columnCount * DEFAULT_VISIBLE_ROWS;
	const canTogglePreview = icons.length > collapsedIconCount;
	const isCollapsed = !showAll && canTogglePreview;
	const visibleIcons = isCollapsed ? icons.slice(0, collapsedIconCount) : icons;
	const iconRows = chunkIcons(visibleIcons, columnCount);
	const countLabel = isCollapsed
		? `${visibleIcons.length} of ${icons.length} icons`
		: `${icons.length} icons`;

	const handleGridLayout = (event: LayoutChangeEvent) => {
		const nextWidth = event.nativeEvent.layout.width;

		if (nextWidth > 0 && nextWidth !== measuredGridWidth) {
			setMeasuredGridWidth(nextWidth);
		}
	};

	return (
		<View>
			<Text className="font-sans text-xs text-ink-muted">{countLabel}</Text>

			<ScrollView
				className="mt-3"
				nestedScrollEnabled={showAll}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				style={showAll ? { maxHeight: MAX_RESULTS_HEIGHT } : undefined}
			>
				<View
					className="gap-2"
					onLayout={handleGridLayout}
					testID={`${optionTestIDPrefix}-grid`}
				>
					{iconRows.map((row, rowIndex) => (
						<View
							key={`icon-row-${rowIndex}`}
							className="flex-row gap-2"
							testID={`${optionTestIDPrefix}-row-${rowIndex}`}
						>
							{Array.from({ length: columnCount }, (_, columnIndex) => {
								const icon = row[columnIndex];

								if (!icon) {
									return (
										<View
											key={`empty-${columnIndex}`}
											className="flex-1"
										/>
									);
								}

								const IconComponent = getIcon(icon);
								const isSelected = selectedIcon === icon;

								return (
									<View key={icon} className="flex-1 items-center">
										<Pressable
											onPress={() => onSelect(icon)}
											className={`h-12 w-12 items-center justify-center rounded-full ${
												isSelected ? 'bg-accent' : 'bg-paper-200'
											}`}
											testID={`${optionTestIDPrefix}-${icon}`}
										>
											<IconComponent
												size={24}
												color={
													isSelected
														? colors.paper.warm
														: colors.ink.muted
												}
											/>
										</Pressable>
									</View>
								);
							})}
						</View>
					))}
				</View>
			</ScrollView>

			{isCollapsed && (
				<Pressable className="mt-3 self-start" onPress={() => setShowAll(true)}>
					<Text className="font-sans-semibold text-sm text-accent">
						Show all {icons.length} icons
					</Text>
				</Pressable>
			)}

			{showAll && canTogglePreview && (
				<Pressable className="mt-3 self-start" onPress={() => setShowAll(false)}>
					<Text className="font-sans-semibold text-sm text-accent">
						Show less icons
					</Text>
				</Pressable>
			)}
		</View>
	);
}
