import { View, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';

import type { EntityType, EntityColorKey } from '@/src/types';
import { ENTITY_COLOR_PALETTE, ENTITY_COLOR_KEYS } from '@/src/constants/entity-colors';
import { getEntityTypeDefaults } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';

interface EntityColorPickerProps {
	entityType: EntityType;
	selectedColor: EntityColorKey | null;
	onSelect: (color: EntityColorKey | null) => void;
}

const DOT_SIZE = 28;

interface SwatchProps {
	bgColor: string;
	iconColor: string;
	isSelected: boolean;
	dotTestID: string;
	checkTestID: string;
	onPress: () => void;
}

function Swatch({ bgColor, iconColor, isSelected, dotTestID, checkTestID, onPress }: SwatchProps) {
	return (
		<Pressable onPress={onPress} testID={dotTestID}>
			<View
				className="items-center justify-center rounded-full"
				style={{
					width: DOT_SIZE,
					height: DOT_SIZE,
					backgroundColor: bgColor,
					borderWidth: 2,
					borderColor: isSelected ? colors.ink.DEFAULT : 'transparent',
				}}
			>
				{isSelected && <Check size={14} color={iconColor} testID={checkTestID} />}
			</View>
		</Pressable>
	);
}

export function EntityColorPicker({ entityType, selectedColor, onSelect }: EntityColorPickerProps) {
	const typeDefault = getEntityTypeDefaults(entityType);
	const isDefaultSelected = selectedColor === null;

	return (
		<View className="mt-3 flex-row flex-wrap gap-2">
			<Swatch
				bgColor={typeDefault.bgColor}
				iconColor={typeDefault.iconColor}
				isSelected={isDefaultSelected}
				dotTestID="color-dot-default"
				checkTestID="color-check-default"
				onPress={() => {
					if (!isDefaultSelected) onSelect(null);
				}}
			/>

			{ENTITY_COLOR_KEYS.map((key) => {
				const swatch = ENTITY_COLOR_PALETTE[key];
				const isSelected = selectedColor === key;
				return (
					<Swatch
						key={key}
						bgColor={swatch.bgColor}
						iconColor={swatch.iconColor}
						isSelected={isSelected}
						dotTestID={`color-dot-${key}`}
						checkTestID={`color-check-${key}`}
						onPress={() => {
							if (!isSelected) onSelect(key);
						}}
					/>
				);
			})}
		</View>
	);
}
