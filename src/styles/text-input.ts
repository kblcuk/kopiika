import { StyleSheet } from 'react-native';

export const textInputClassNames = {
	container: 'border-paper-400 rounded-lg border bg-paper-100 px-4 py-3',
	inlineContainer:
		'border-paper-400 flex-row items-center rounded-lg border bg-paper-100 px-4 py-3',
	input: 'font-sans text-base text-ink',
	inlineAmountInput: 'font-sans-semibold text-lg text-ink',
	primaryAmountInput: 'flex-1 font-sans-semibold text-2xl text-ink',
	heroAmountInput: 'flex-1 font-sans-semibold text-3xl text-ink',
	suffix: 'font-sans text-base text-ink-muted',
	suffixLarge: 'font-sans text-lg text-ink-muted',
} as const;

export const styles = StyleSheet.create({
	input: {
		lineHeight: undefined,
	},
});
