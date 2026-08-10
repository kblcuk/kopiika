import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Text } from './text';
import { PageSheetModal } from './page-sheet-modal';
import { colors } from '@/src/theme/colors';
import {
	CURRENCY_OPTIONS,
	normalizeCurrencyCode,
	type CurrencyOption,
} from '@/src/constants/currencies';
import { getCurrencySymbol } from '@/src/utils/format';
import { TestIDs } from '@/e2e/support/test-ids';

interface CurrencyPickerSheetProps {
	visible: boolean;
	selectedCode: string;
	onSelect: (code: string) => void;
	onClose: () => void;
	testID?: string;
}

export function CurrencyPickerSheet({
	visible,
	selectedCode,
	onSelect,
	onClose,
	testID,
}: CurrencyPickerSheetProps) {
	const [query, setQuery] = useState('');

	const options = useMemo<CurrencyOption[]>(() => {
		const q = query.trim().toLowerCase();
		if (!q) return CURRENCY_OPTIONS;

		const matches = CURRENCY_OPTIONS.filter(
			(c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
		);
		if (matches.length > 0) return matches;

		// Nothing named matches — offer the raw code if it's well-formed. Intl
		// supplies the decimal places and getCurrencySymbol falls back to the
		// code itself, so an unnamed currency still works end to end.
		const code = normalizeCurrencyCode(query);
		return code ? [{ code, symbol: getCurrencySymbol(code), name: 'Other currency' }] : [];
	}, [query]);

	const handleSelect = (code: string) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(code);
		onClose();
	};

	return (
		<PageSheetModal
			visible={visible}
			onRequestClose={onClose}
			testID={testID ?? TestIDs.currencyPicker.sheet}
		>
			<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
				<Text className="font-sans-semibold text-base text-ink">Currency</Text>
				<Pressable onPress={onClose} hitSlop={20} testID={TestIDs.currencyPicker.close}>
					<X size={24} color={colors.ink.muted} />
				</Pressable>
			</View>

			<View className="px-5 pt-4">
				<TextInput
					testID={TestIDs.currencyPicker.search}
					value={query}
					onChangeText={setQuery}
					placeholder="Search, or type a 3-letter code"
					placeholderTextColor={colors.ink.placeholder}
					autoCapitalize="characters"
					autoCorrect={false}
					className="rounded-lg bg-paper-100 px-4 py-3 font-sans text-base text-ink"
				/>
			</View>

			<ScrollView className="flex-1 px-5 pt-4">
				<View className="overflow-hidden rounded-lg bg-paper-100">
					{options.map((option, index) => {
						const isSelected = option.code === selectedCode;
						return (
							<Pressable
								key={option.code}
								testID={TestIDs.currencyPicker.option(option.code)}
								accessibilityState={{ selected: isSelected }}
								onPress={() => handleSelect(option.code)}
								className={`flex-row items-center px-4 py-3.5 active:bg-paper-200 ${
									index > 0 ? 'border-t border-paper-300' : ''
								}`}
							>
								<Text className="w-10 font-sans text-base text-ink">
									{option.symbol}
								</Text>
								<Text className="w-14 font-sans-semibold text-base text-ink">
									{option.code}
								</Text>
								<Text className="flex-1 font-sans text-base text-ink-muted">
									{option.name}
								</Text>
								{isSelected && <Check size={18} color={colors.ink.muted} />}
							</Pressable>
						);
					})}
				</View>

				{options.length === 0 && (
					<View className="items-center py-8">
						<Text className="font-sans text-sm text-ink-muted">
							No match. Currency codes are three letters, like USD.
						</Text>
					</View>
				)}
				<View className="h-8" />
			</ScrollView>
		</PageSheetModal>
	);
}
