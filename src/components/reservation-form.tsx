import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { View, TextInput, Pressable, Platform, Alert } from 'react-native';
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
	parseAmountToMinor,
	getCurrencySymbol,
	DEFAULT_CURRENCY,
	formatAmountForInput,
} from '@/src/utils/format';
import { getCurrencyDecimalPlaces } from '@/src/utils/currency-precision';
import { TransactionValidationError } from '@/src/utils/transaction-validation';
import { sharedNumericTextInputProps, styles, textInputClassNames } from '../styles/text-input';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { useExpressionInput } from '@/src/hooks/use-expression-input';
import { OperatorToolbar } from './operator-toolbar';
import { PageSheetModal } from './page-sheet-modal';

interface ReservationFormProps {
	visible: boolean;
	account: EntityWithBalance | null;
	saving: EntityWithBalance | null;
	onClose: () => void;
	currentNetMinor: number;
	initialAmountMinor?: number;
	onSubmit: (targetTotalMinor: number) => Promise<void>;
	tutorialHeader?: ReactNode;
	help?: ReactNode;
	allowClear?: boolean;
}

export function ReservationForm({
	visible,
	account,
	saving,
	onClose,
	currentNetMinor,
	initialAmountMinor,
	onSubmit,
	tutorialHeader,
	help,
	allowClear = true,
}: ReservationFormProps) {
	const [amount, setAmount] = useState('');
	const insets = useSafeAreaInsets();
	const maxDecimalPlaces = useMemo(
		() => getCurrencyDecimalPlaces(account?.currency ?? DEFAULT_CURRENCY),
		[account?.currency]
	);
	const amountExpr = useExpressionInput(amount, setAmount, { maxDecimalPlaces });

	const submitting = useRef(false);
	const [busy, setBusy] = useState(false);
	const active = useRef(false);
	const openingVersion = useRef(0);
	const accountId = account?.id;
	const savingId = saving?.id;
	useEffect(() => {
		openingVersion.current++;
		active.current = visible;
		submitting.current = false;
		setBusy(false);
		return () => {
			active.current = false;
		};
	}, [visible, accountId, savingId]);
	const hasExisting = currentNetMinor > 0;

	const accountCurrency = account?.currency;
	useEffect(() => {
		if (visible && accountId && savingId && accountCurrency) {
			setAmount(
				initialAmountMinor === undefined
					? ''
					: formatAmountForInput(initialAmountMinor, accountCurrency)
			);
			const ref = amountExpr.inputRef;
			const timer = setTimeout(() => ref.current?.focus(), 100);
			return () => clearTimeout(timer);
		}
	}, [visible, accountId, savingId, accountCurrency, initialAmountMinor, amountExpr.inputRef]);

	const handleCancel = useCallback(() => {
		active.current = false;
		openingVersion.current++;
		void KeyboardController.dismiss();
		onClose();
	}, [onClose]);

	if (!account || !saving) return null;

	const currency = account.currency;
	const parsedAmountMinor = parseAmountToMinor(amount, currency);
	const canSubmit = Number.isFinite(parsedAmountMinor) && parsedAmountMinor > 0;

	const showReservationError = (error: unknown) => {
		console.error('Reservation failed:', error);
		Alert.alert(
			'Reservation failed',
			error instanceof TransactionValidationError
				? error.message
				: 'Could not update the reservation. Please try again.'
		);
	};

	const handleSubmit = async () => {
		if (!canSubmit || submitting.current || !active.current) return;
		const resolved = amountExpr.resolve({ rejectInvalid: true });
		const finalAmountMinor = parseAmountToMinor(resolved, currency);
		if (!Number.isFinite(finalAmountMinor) || finalAmountMinor <= 0) return;
		const version = openingVersion.current;
		submitting.current = true;
		setBusy(true);
		try {
			await onSubmit(currentNetMinor + finalAmountMinor);
		} catch (error) {
			if (active.current && version === openingVersion.current) showReservationError(error);
			return;
		} finally {
			if (version === openingVersion.current) {
				submitting.current = false;
				if (active.current) setBusy(false);
			}
		}
		if (!active.current || version !== openingVersion.current) return;
		active.current = false;
		void KeyboardController.dismiss();
		onClose();
	};

	const handleClear = async () => {
		if (submitting.current || !active.current) return;
		const version = openingVersion.current;
		submitting.current = true;
		setBusy(true);
		try {
			await onSubmit(0);
		} catch (error) {
			if (active.current && version === openingVersion.current) showReservationError(error);
			return;
		} finally {
			if (version === openingVersion.current) {
				submitting.current = false;
				if (active.current) setBusy(false);
			}
		}
		if (!active.current || version !== openingVersion.current) return;
		active.current = false;
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
		<PageSheetModal visible={visible} onRequestClose={handleCancel} testID="reservation-modal">
			{tutorialHeader}
			{/* Header */}
			<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
				<Pressable onPress={handleCancel} hitSlop={20} testID="reservation-cancel-button">
					<Text className="font-sans text-base text-ink-muted">Cancel</Text>
				</Pressable>
				<View className="flex-row items-center">
					<Text className="font-sans-semibold text-base text-ink">Reserve</Text>
					{help}
				</View>
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
							testID="reservation-amount-input"
							accessibilityLabel="Amount"
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
							Currently reserved: {formatAmount(currentNetMinor, currency)}
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
					{hasExisting && allowClear && (
						<Pressable
							onPress={() => {
								void handleClear();
							}}
							testID="reservation-clear-button"
							disabled={busy}
							className="h-12 items-center justify-center rounded-2xl bg-paper-200 px-5"
						>
							<Text className="font-sans-semibold text-base text-negative">
								Clear
							</Text>
						</Pressable>
					)}
					<Pressable
						onPress={() => {
							void handleSubmit();
						}}
						disabled={!canSubmit || busy}
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
		</PageSheetModal>
	);
}
