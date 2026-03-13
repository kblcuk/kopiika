import { useState, useEffect, useRef } from 'react';
import {
	View,
	Text,
	TextInput,
	Pressable,
	Modal,
	KeyboardAvoidingView,
	Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Trash2 } from 'lucide-react-native';

import type { EntityWithBalance } from '@/src/types';
import {
	formatAmount,
	reverseFormatCurrency,
	roundMoney,
	getCurrencySymbol,
} from '@/src/utils/format';
import { useStore } from '@/src/store';
import { sharedTextInputProps, styles, textInputClassNames } from '../styles/text-input';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';

interface ReservationModalProps {
	visible: boolean;
	account: EntityWithBalance | null;
	saving: EntityWithBalance | null;
	onClose: () => void;
}

export function ReservationModal({ visible, account, saving, onClose }: ReservationModalProps) {
	const [amount, setAmount] = useState('');
	const insets = useSafeAreaInsets();
	const inputRef = useRef<TextInput>(null);

	const upsertReservation = useStore((s) => s.upsertReservation);
	const reservations = useStore((s) => s.reservations);

	// Find existing reservation for this pair
	const existing =
		account && saving
			? reservations.find(
					(r) => r.account_entity_id === account.id && r.saving_entity_id === saving.id
				)
			: null;
	const existingAmount = existing?.amount;

	useEffect(() => {
		if (visible && account && saving) {
			setAmount(existingAmount !== undefined ? String(existingAmount) : '');
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [visible, account, saving, existingAmount]);

	if (!account || !saving) return null;

	const currency = account.currency;
	const parsedAmount = roundMoney(reverseFormatCurrency(amount, currency));
	const canSubmit = parsedAmount > 0;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		await upsertReservation(account.id, saving.id, parsedAmount);
		onClose();
	};

	const handleClear = async () => {
		await upsertReservation(account.id, saving.id, 0);
		onClose();
	};

	const renderBubble = (entity: EntityWithBalance) => {
		const IconComponent = getIcon(entity.icon || 'circle');
		const typeColors = getEntityTypeColors(entity.type);
		return (
			<View className="flex-1 items-center">
				<View
					className={`mb-2 h-12 w-12 items-center justify-center rounded-full ${typeColors.bg}`}
				>
					<IconComponent size={20} color={typeColors.iconColor} />
				</View>
				<Text className="text-center font-sans text-sm text-ink-muted" numberOfLines={1}>
					{entity.name}
				</Text>
			</View>
		);
	};

	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				className="flex-1 justify-end"
			>
				<Pressable className="flex-1" onPress={onClose} />

				<View
					className="rounded-t-3xl bg-paper-50 px-6 pb-4 pt-6"
					style={{ paddingBottom: Math.max(insets.bottom, 16) }}
				>
					{/* Header: account → saving */}
					<View className="mb-6 flex-row items-center justify-center">
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
								ref={inputRef}
								value={amount}
								onChangeText={setAmount}
								placeholder="0"
								keyboardType="decimal-pad"
								className={textInputClassNames.heroAmountInput}
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
								{...sharedTextInputProps}
							/>
						</View>
						{existing && (
							<Text className="text-ink-faint mt-1 font-sans text-xs">
								Currently reserved: {formatAmount(existing.amount, currency)}
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
						{existing && (
							<Pressable
								onPress={handleClear}
								className="h-12 w-12 items-center justify-center rounded-2xl bg-paper-200"
							>
								<Trash2 size={18} color={colors.ink.muted} />
							</Pressable>
						)}
						<Pressable
							onPress={handleSubmit}
							disabled={!canSubmit}
							className={`h-12 flex-1 items-center justify-center rounded-2xl ${canSubmit ? 'bg-ink' : 'bg-paper-300'}`}
						>
							<Text
								className={`font-sans-semibold text-base ${canSubmit ? 'text-paper-50' : 'text-ink-faint'}`}
							>
								{existing ? 'Update' : 'Reserve'}
							</Text>
						</Pressable>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}
