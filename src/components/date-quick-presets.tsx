import { View, Pressable } from 'react-native';

import { Text } from './text';
import { isSameCivilDay } from '@/src/utils/date-shift';

export type DatePreset = {
	key: string;
	label: string;
	date: Date;
};

interface DateQuickPresetsProps {
	options: DatePreset[];
	value: Date;
	onSelect: (date: Date) => void;
	testIDPrefix: string;
}

/**
 * A row of one-tap date chips.
 *
 * Presentational by design: the caller computes each option's date, so this
 * component never reads the clock and stays deterministic under test.
 *
 * At most one chip matches `value`; none matching is the ordinary state once an
 * arbitrary date has been picked from the calendar. Chips are a selection, not
 * a toggle — pressing the selected chip re-selects the same civil day, which
 * the caller sees as a no-op.
 */
export function DateQuickPresets({
	options,
	value,
	onSelect,
	testIDPrefix,
}: DateQuickPresetsProps) {
	return (
		<View className="mt-2 flex-row gap-2">
			{options.map((option) => {
				const isSelected = isSameCivilDay(option.date, value);
				return (
					<Pressable
						key={option.key}
						onPress={() => onSelect(option.date)}
						className={`flex-1 items-center rounded-lg py-2 ${
							isSelected ? 'bg-accent' : 'bg-paper-200'
						}`}
						accessibilityRole="button"
						accessibilityState={{ selected: isSelected }}
						testID={`${testIDPrefix}-${option.key}`}
					>
						<Text
							className={`font-sans text-sm ${
								isSelected ? 'text-on-color' : 'text-ink-muted'
							}`}
						>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}
