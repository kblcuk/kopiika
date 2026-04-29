import { useState, useEffect, useCallback } from 'react';
import { View, TextInput, Pressable, Modal, Platform } from 'react-native';
import { Text } from './text';
import {
	KeyboardAwareScrollView,
	KeyboardController,
	KeyboardExtender,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';

import type { EntityWithBalance } from '@/src/types';
import {
	formatAmount,
	reverseFormatCurrency,
	roundMoney,
	getCurrencySymbol,
} from '@/src/utils/format';
import { useStore } from '@/src/store';
import { sharedNumericTextInputProps, styles, textInputClassNames } from '../styles/text-input';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { useExpressionInput } from '@/src/hooks/use-expression-input';
import { OperatorToolbar } from './operator-toolbar';
import { getReservationForPair } from '@/src/utils/savings-transactions';

interface ReservationModalProps {
	visible: boolean;
	account: EntityWithBalance | null;
	saving: EntityWithBalance | null;
	onClose: () => void;
}

export function ReservationModal({ visible, account, saving, onClose }: ReservationModalProps) {
	const [amount, setAmount] = useState('');
	const insets = useSafeAreaInsets();
	const amountExpr = useExpressionInput(amount, setAmount);

	const reserveToSaving = useStore((s) => s.reserveToSaving);
	const transactions = useStore((s) => s.transactions);

	// Derive current reservation for this pair from transactions
	const currentNet =
		account && saving ? getReservationForPair(transactions, account.id, saving.id) : 0;
	const hasExisting = currentNet > 0;

	useEffect(() => {
		if (visible && account && saving) {
			setAmount('');
			const ref = amountExpr.inputRef;
			setTimeout(() => ref.current?.focus(), 100);
		}
	}, [visible, account, saving, amountExpr.inputRef]);

	const handleCancel = useCallback(() => {
		void KeyboardController.dismiss();
		onClose();
	}, [onClose]);

	if (!account || !saving) return null;

	const currency = account.currency;
	const parsedAmount = roundMoney(reverseFormatCurrency(amount, currency));
	const canSubmit = parsedAmount > 0;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		const resolved = amountExpr.resolve();
		const finalAmount = roundMoney(reverseFormatCurrency(resolved, currency));
		if (isNaN(finalAmount) || finalAmount <= 0) return;
		await reserveToSaving(account.id, saving.id, currentNet + finalAmount);
		void KeyboardController.dismiss();
		onClose();
	};

	const handleClear = async () => {
		await reserveToSaving(account.id, saving.id, 0);
		void KeyboardController.dismiss();
		onClose();
	};

	const renderBubble = (entity: EntityWithBalance) => {
		const IconComponent = getIcon(entity.icon || 'circle');
		const typeColors = getEntityColors(entity.type, entity.color);
		return (
			<View className="flex-1 items-center">
				<View
					className="mb-2 h-12 w-12 items-center justify-center rounded-full"
					style={{ backgroundColor: typeColors.bgColor }}
				>
					<IconComponent size={20} color={typeColors.iconColor} />
				</View>
				<Text className="text-center font-sans text-sm text-ink-muted" numberOfLines={1}>
					{entity.name}
				</Text>
				<Text
					className="text-center font-sans text-[10px] text-ink-muted"
					numberOfLines={1}
				>
					{formatAmount(entity.actual, entity.currency)}
				</Text>
			</View>
		);
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={handleCancel}
		>
			<View
				testID="reservation-modal"
				className="flex-1 bg-paper-50"
				style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
			>
				{/* Header */}
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Pressable
						onPress={handleCancel}
						hitSlop={20}
						testID="reservation-cancel-button"
					>
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">Reserve</Text>
					<View style={{ width: 48 }} />
				</View>
				<KeyboardAwareScrollView
					bottomOffset={50}
					keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
					keyboardShouldPersistTaps="handled"
					className="flex-1 px-6"
					contentContainerStyle={{
						paddingBottom: Math.max(insets.bottom, 16),
					}}
				>
					{/* Header: account → saving */}
					<View className="mb-6 mt-4 flex-row items-center justify-center">
						{renderBubble(account)}
						<ArrowRight
							size={20}
							color={colors.ink.muted}
							style={{ marginHorizontal: 16 }}
						/>
						{renderBubble(saving)}
					</View>

					{/* Amount input */}
					<View className="mb-4 items-center">
						<Text
							className="mb-1 font-sans text-sm text-ink-muted"
							style={{ letterSpacing: 0.48 }}
						>
							Reserve from {account.name}
						</Text>
						<View className="flex-row items-baseline">
							<Text
								className="text-ink-faint font-sans-semibold"
								style={{ fontSize: 24 }}
							>
								{getCurrencySymbol(currency)}
							</Text>
							<TextInput
								{...sharedNumericTextInputProps}
								{...amountExpr.inputProps}
								placeholder="0"
								className={textInputClassNames.heroAmountInput}
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
							/>
						</View>
						{amountExpr.preview && (
							<Text className="mt-1 font-sans text-xs text-ink-muted">
								{amountExpr.preview}
							</Text>
						)}
						{hasExisting && (
							<Text className="text-ink-faint mt-1 font-sans text-xs">
								Currently reserved: {formatAmount(currentNet, currency)}
							</Text>
						)}
					</View>

					{/* Saving goal context */}
					<View className="mb-6 rounded-xl bg-paper-100 px-4 py-3">
						<View className="flex-row justify-between">
							<Text className="font-sans text-sm text-ink-muted">Saved so far</Text>
							<Text className="font-sans-semibold text-sm text-ink">
								{formatAmount(saving.actual, currency)}
							</Text>
						</View>
						{saving.planned > 0 && (
							<View className="mt-1 flex-row justify-between">
								<Text className="font-sans text-sm text-ink-muted">Goal</Text>
								<Text className="font-sans-semibold text-sm text-ink">
									{formatAmount(saving.planned, currency)}
								</Text>
							</View>
						)}
					</View>

					{/* Actions */}
					<View className="flex-row gap-3">
						{hasExisting && (
							<Pressable
								onPress={handleClear}
								testID="reservation-clear-button"
								className="h-12 items-center justify-center rounded-2xl bg-paper-200 px-5"
							>
								<Text className="font-sans-semibold text-base text-negative">
									Clear
								</Text>
							</Pressable>
						)}
						<Pressable
							onPress={handleSubmit}
							disabled={!canSubmit}
							testID="reservation-submit-button"
							className={`h-12 flex-1 items-center justify-center rounded-2xl ${canSubmit ? 'bg-ink' : 'bg-paper-300'}`}
						>
							<Text
								className={`font-sans-semibold text-base ${canSubmit ? 'text-paper-50' : 'text-ink-faint'}`}
							>
								Reserve
							</Text>
						</Pressable>
					</View>
				</KeyboardAwareScrollView>

				<KeyboardExtender enabled={amountExpr.focused}>
					<OperatorToolbar
						onOperator={amountExpr.insertOperator}
						onEquals={amountExpr.resolve}
					/>
				</KeyboardExtender>
			</View>
		</Modal>
	);
}
