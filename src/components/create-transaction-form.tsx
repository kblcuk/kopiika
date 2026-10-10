import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Pressable, Platform } from 'react-native';
import {
	KeyboardAwareScrollView,
	KeyboardController,
	KeyboardExtender,
} from 'react-native-keyboard-controller';
import type { EntityWithBalance } from '@/src/types';
import { formatAmountForInput, parseAmountToMinor } from '@/src/utils/format';
import {
	ensureValid,
	validateTransaction,
	type MutationInput,
} from '@/src/utils/transaction-validation';
import { getCurrencyDecimalPlaces } from '@/src/utils/currency-precision';
import { useExpressionInput } from '@/src/hooks/use-expression-input';
import { Text } from './text';
import { PageSheetModal } from './page-sheet-modal';
import { TransactionEntryFields } from './transaction-entry-fields';
import { OperatorToolbar } from './operator-toolbar';

interface CreateTransactionFormProps {
	visible: boolean;
	fromEntity: EntityWithBalance;
	toEntity: EntityWithBalance;
	entities: EntityWithBalance[];
	initialAmountMinor?: number;
	timestamp: number;
	onSubmit: (input: MutationInput) => Promise<void>;
	onClose: () => void;
	tutorialHeader?: ReactNode;
}

export function CreateTransactionForm({
	visible,
	fromEntity,
	toEntity,
	entities,
	initialAmountMinor,
	onSubmit,
	onClose,
	tutorialHeader,
}: CreateTransactionFormProps) {
	const currency = fromEntity.currency;
	const [amount, setAmount] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const submitting = useRef(false);
	const active = useRef(false);
	const openingVersion = useRef(0);
	const expr = useExpressionInput(amount, setAmount, {
		maxDecimalPlaces: getCurrencyDecimalPlaces(currency),
	});
	useEffect(() => {
		openingVersion.current++;
		active.current = visible;
		submitting.current = false;
		setBusy(false);
		setAmount(
			initialAmountMinor === undefined
				? ''
				: formatAmountForInput(initialAmountMinor, currency)
		);
		setError('');
		const timer = setTimeout(() => {
			if (active.current) expr.inputRef.current?.focus();
		}, 100);
		return () => {
			active.current = false;
			clearTimeout(timer);
		};
	}, [visible, fromEntity.id, toEntity.id, currency, initialAmountMinor, expr.inputRef]);
	const cancel = () => {
		active.current = false;
		openingVersion.current++;
		void KeyboardController.dismiss();
		onClose();
	};
	const submit = async () => {
		if (submitting.current || !active.current) return;
		const input = {
			from_entity_id: fromEntity.id,
			to_entity_id: toEntity.id,
			currency,
			amount_minor: parseAmountToMinor(expr.resolve(), currency),
		};
		const version = openingVersion.current;
		submitting.current = true;
		setBusy(true);
		setError('');
		try {
			ensureValid(validateTransaction(input, entities));
			await onSubmit(input);
			if (active.current && version === openingVersion.current) {
				active.current = false;
				void KeyboardController.dismiss();
				onClose();
			}
		} catch (e) {
			if (active.current && version === openingVersion.current)
				setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
		} finally {
			if (version === openingVersion.current) {
				submitting.current = false;
				if (active.current) setBusy(false);
			}
		}
	};
	return (
		<PageSheetModal
			visible={visible}
			onRequestClose={cancel}
			testID="practice-transaction-form"
		>
			{tutorialHeader}
			<View className="border-b border-paper-300 px-5 py-4">
				<Text className="mb-3 font-sans-semibold text-base text-ink">New Transaction</Text>
				<View className="flex-row gap-4">
					<Pressable
						testID="transaction-cancel-button"
						className="min-h-11 flex-1 justify-center"
						onPress={cancel}
						hitSlop={16}
						accessibilityRole="button"
					>
						<Text>Cancel</Text>
					</Pressable>

					<Pressable
						testID="transaction-save-button"
						className="min-h-11 flex-1 items-end justify-center"
						onPress={() => void submit()}
						disabled={busy}
						hitSlop={16}
						accessibilityRole="button"
					>
						<Text>{busy ? 'Saving…' : 'Save'}</Text>
					</Pressable>
				</View>
			</View>
			<KeyboardAwareScrollView
				className="flex-1 px-5 pt-6"
				bottomOffset={50}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
			>
				<View className="mb-8 flex-row items-center justify-between">
					<Text className="flex-1 pr-3">{fromEntity.name}</Text>
					<Text>→</Text>
					<Text className="flex-1 pl-3 text-right">{toEntity.name}</Text>
				</View>
				<Text className="mb-2 font-sans text-sm text-ink-muted">Amount</Text>
				<TransactionEntryFields currency={currency} expression={expr} />
				{expr.preview && <Text>{expr.preview}</Text>}
				{!!error && (
					<Text accessibilityRole="alert" className="mt-3 text-negative">
						{error}
					</Text>
				)}
			</KeyboardAwareScrollView>
			<KeyboardExtender enabled={expr.focused}>
				<OperatorToolbar onOperator={expr.insertOperator} onEquals={expr.resolve} />
			</KeyboardExtender>
		</PageSheetModal>
	);
}
