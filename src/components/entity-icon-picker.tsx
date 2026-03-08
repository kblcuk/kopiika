import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';

import { getIcon } from '@/src/constants/icon-registry';
import { colors } from '@/src/theme/colors';
import { searchIcons } from '@/src/utils/icon-search';
import { styles } from '@/src/styles/text-input';

interface EntityIconPickerProps {
	icons: string[];
	selectedIcon: string;
	onSelect: (icon: string) => void;
	searchInputTestID: string;
	optionTestIDPrefix: string;
	emptyStateTestID: string;
}

const INITIAL_VISIBLE_ICON_COUNT = 16;
const MAX_RESULTS_HEIGHT = 216;

export function EntityIconPicker({
	icons,
	selectedIcon,
	onSelect,
	searchInputTestID,
	optionTestIDPrefix,
	emptyStateTestID,
}: EntityIconPickerProps) {
	const [query, setQuery] = useState('');
	const [showAll, setShowAll] = useState(false);
	const filteredIcons = searchIcons(icons, query);
	const hasQuery = query.trim().length > 0;
	const isCollapsed = !hasQuery && !showAll && filteredIcons.length > INITIAL_VISIBLE_ICON_COUNT;
	const visibleIcons = isCollapsed
		? filteredIcons.slice(0, INITIAL_VISIBLE_ICON_COUNT)
		: filteredIcons;
	const shouldUseScrollableResults = hasQuery || showAll;
	const countLabel = hasQuery
		? `${filteredIcons.length} matches`
		: isCollapsed
			? `${visibleIcons.length} of ${icons.length} icons`
			: `${icons.length} icons`;

	return (
		<View>
			<View className="border-paper-400 rounded-lg border bg-paper-100 px-4 py-3">
				<TextInput
					value={query}
					onChangeText={setQuery}
					placeholder="Search icons, e.g. car or wallet"
					className="font-sans text-base text-ink"
					style={styles.input}
					placeholderTextColor={colors.ink.placeholder}
					autoCapitalize="none"
					autoCorrect={false}
					testID={searchInputTestID}
				/>
			</View>

			<View className="mt-2 flex-row items-center justify-between gap-3">
				<Text className="font-sans text-xs text-ink-muted">{countLabel}</Text>
				{isCollapsed && (
					<Pressable onPress={() => setShowAll(true)}>
						<Text className="font-sans-semibold text-sm text-accent">
							Show all {icons.length} icons
						</Text>
					</Pressable>
				)}
			</View>

			{visibleIcons.length > 0 ? (
				<ScrollView
					className="mt-3"
					nestedScrollEnabled={shouldUseScrollableResults}
					showsVerticalScrollIndicator={false}
					keyboardShouldPersistTaps="handled"
					style={
						shouldUseScrollableResults ? { maxHeight: MAX_RESULTS_HEIGHT } : undefined
					}
				>
					<View className="flex-row flex-wrap gap-2 pr-1">
						{visibleIcons.map((icon) => {
							const IconComponent = getIcon(icon);
							const isSelected = selectedIcon === icon;

							return (
								<Pressable
									key={icon}
									onPress={() => onSelect(icon)}
									className={`h-12 w-12 items-center justify-center rounded-full ${
										isSelected ? 'bg-accent' : 'bg-paper-200'
									}`}
									testID={`${optionTestIDPrefix}-${icon}`}
								>
									<IconComponent
										size={24}
										color={isSelected ? colors.paper.warm : colors.ink.muted}
									/>
								</Pressable>
							);
						})}
					</View>
				</ScrollView>
			) : (
				<Text className="mt-3 font-sans text-sm text-ink-muted" testID={emptyStateTestID}>
					No icons match {`"${query.trim()}"`}
				</Text>
			)}
		</View>
	);
}
