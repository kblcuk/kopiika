import { View, TextInput } from 'react-native';
import { Text } from './text';
import { getCurrencySymbol } from '@/src/utils/format';
import { colors } from '@/src/theme/colors';
import { sharedNumericTextInputProps, styles, textInputClassNames } from '@/src/styles/text-input';
import type { useExpressionInput } from '@/src/hooks/use-expression-input';

/** Shared money entry; controllers own parsing, validation and persistence. */
export function TransactionEntryFields({
	currency,
	expression,
}: {
	currency: string;
	expression: ReturnType<typeof useExpressionInput>;
}) {
	return (
		<View className={textInputClassNames.inlineContainer}>
			<TextInput
				{...sharedNumericTextInputProps}
				{...expression.inputProps}
				placeholder="0"
				className={textInputClassNames.heroAmountInput}
				style={styles.input}
				placeholderTextColor={colors.ink.placeholder}
				testID="transaction-amount-input"
				accessibilityLabel="Amount"
			/>
			<Text className={textInputClassNames.suffixLarge}>{getCurrencySymbol(currency)}</Text>
		</View>
	);
}
