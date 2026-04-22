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

export function EntityColorPicker({ entityType, selectedColor, onSelect }: EntityColorPickerProps) {
	const typeDefault = getEntityTypeDefaults(entityType);
	const isDefaultSelected = selectedColor === null;

	return (
		<View className="mt-3 flex-row flex-wrap gap-2">
			{/* Default (type) dot */}
			<Pressable
				onPress={() => {
					if (!isDefaultSelected) onSelect(null);
				}}
				testID="color-dot-default"
			>
				<View
					className="items-center justify-center rounded-full"
					style={{
						width: DOT_SIZE,
						height: DOT_SIZE,
						backgroundColor: typeDefault.bgColor,
						borderWidth: 2,
						borderColor: isDefaultSelected ? colors.ink.DEFAULT : 'transparent',
					}}
				>
					{isDefaultSelected && (
						<Check
							size={14}
							color={typeDefault.iconColor}
							testID="color-check-default"
						/>
					)}
				</View>
			</Pressable>

			{/* Palette dots */}
			{ENTITY_COLOR_KEYS.map((key) => {
				const swatch = ENTITY_COLOR_PALETTE[key];
				const isSelected = selectedColor === key;

				return (
					<Pressable
						key={key}
						onPress={() => {
							if (!isSelected) onSelect(key);
						}}
						testID={`color-dot-${key}`}
					>
						<View
							className="items-center justify-center rounded-full"
							style={{
								width: DOT_SIZE,
								height: DOT_SIZE,
								backgroundColor: swatch.bgColor,
								borderWidth: 2,
								borderColor: isSelected ? colors.ink.DEFAULT : 'transparent',
							}}
						>
							{isSelected && (
								<Check
									size={14}
									color={swatch.iconColor}
									testID={`color-check-${key}`}
								/>
							)}
						</View>
					</Pressable>
				);
			})}
		</View>
	);
}
