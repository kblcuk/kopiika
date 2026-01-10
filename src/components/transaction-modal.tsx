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

import type { EntityWithBalance } from '@/src/types';
import { formatAmount } from '@/src/utils/format';
import { useStore, generateId } from '@/src/store';

interface TransactionModalProps {
	visible: boolean;
	fromEntity: EntityWithBalance | null;
	toEntity: EntityWithBalance | null;
	onClose: () => void;
}

export function TransactionModal({
	visible,
	fromEntity,
	toEntity,
	onClose,
}: TransactionModalProps) {
	const [amount, setAmount] = useState('');
	const [note, setNote] = useState('');
	const inputRef = useRef<TextInput>(null);
	const addTransaction = useStore((state) => state.addTransaction);

	// Reset and focus when modal opens
	useEffect(() => {
		if (visible) {
			setAmount('');
			setNote('');
			// Focus input after a short delay to ensure modal is visible
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [visible]);

	if (!fromEntity || !toEntity) return null;

	// Suggest remaining planned amount for certain flows
	const getSuggestedAmount = (): number | null => {
		// Income → Account: suggest remaining income to distribute
		if (fromEntity.type === 'income') {
			return fromEntity.remaining > 0 ? fromEntity.remaining : null;
		}
		// Account → Saving: suggest remaining planned saving
		if (fromEntity.type === 'account' && toEntity.type === 'saving') {
			return toEntity.remaining > 0 ? toEntity.remaining : null;
		}
		return null;
	};

	const suggestedAmount = getSuggestedAmount();

	const handleSubmit = async () => {
		const numAmount = parseFloat(amount);
		if (isNaN(numAmount) || numAmount <= 0) return;

		await addTransaction({
			id: generateId(),
			from_entity_id: fromEntity.id,
			to_entity_id: toEntity.id,
			amount: numAmount,
			currency: fromEntity.currency,
			timestamp: Date.now(),
			note: note.trim() || undefined,
		});

		onClose();
	};

	const handleUseSuggested = () => {
		if (suggestedAmount) {
			setAmount(suggestedAmount.toString());
		}
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				className="flex-1 bg-paper-50"
			>
				{/* Header */}
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Pressable onPress={onClose} hitSlop={20}>
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">New Transaction</Text>
					<Pressable
						onPress={handleSubmit}
						disabled={!amount || parseFloat(amount) <= 0}
						hitSlop={20}
					>
						<Text
							className={`font-sans-semibold text-base ${
								amount && parseFloat(amount) > 0 ? 'text-accent' : 'text-ink-faint'
							}`}
						>
							Save
						</Text>
					</Pressable>
				</View>

				{/* Content */}
				<View className="flex-1 px-5 pt-6">
					{/* From → To */}
					<View className="mb-8 flex-row items-center justify-center">
						<View className="items-center">
							<View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-paper-300">
								<Text className="font-sans-medium text-xl text-ink-muted">
									{fromEntity.name.charAt(0)}
								</Text>
							</View>
							<Text className="font-sans text-sm text-ink-muted">
								{fromEntity.name}
							</Text>
						</View>
						<Text className="mx-4 font-sans text-2xl text-ink-faint">→</Text>
						<View className="items-center">
							<View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-paper-300">
								<Text className="font-sans-medium text-xl text-ink-muted">
									{toEntity.name.charAt(0)}
								</Text>
							</View>
							<Text className="font-sans text-sm text-ink-muted">
								{toEntity.name}
							</Text>
						</View>
					</View>

					{/* Amount input */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Amount
						</Text>
						<View className="flex-row items-center rounded-lg border border-paper-400 bg-paper-100 px-4 py-3">
							<TextInput
								ref={inputRef}
								value={amount}
								onChangeText={setAmount}
								placeholder="0"
								keyboardType="numeric"
								className="flex-1 font-sans-semibold text-3xl text-ink"
								placeholderTextColor="#9C8B74"
							/>
							<Text className="font-sans text-lg text-ink-muted">
								{fromEntity.currency}
							</Text>
						</View>

						{/* Suggested amount button */}
						{suggestedAmount && (
							<Pressable
								onPress={handleUseSuggested}
								className="mt-3 self-start rounded-full bg-paper-200 px-3 py-1.5"
							>
								<Text className="font-sans text-sm text-ink-muted">
									Use remaining: {formatAmount(suggestedAmount)}
								</Text>
							</Pressable>
						)}
					</View>

					{/* Note input */}
					<View>
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Note (optional)
						</Text>
						<TextInput
							value={note}
							onChangeText={setNote}
							placeholder="Add a note..."
							className="rounded-lg border border-paper-400 bg-paper-100 px-4 py-3 font-sans text-base text-ink"
							placeholderTextColor="#9C8B74"
						/>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}
