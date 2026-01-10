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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ArrowRight, Calendar } from 'lucide-react-native';

import type { EntityWithBalance, Transaction } from '@/src/types';
import { formatAmount } from '@/src/utils/format';
import { useStore, generateId } from '@/src/store';
import { styles } from '../styles/text-input';

interface TransactionModalProps {
	visible: boolean;
	fromEntity: EntityWithBalance | null;
	toEntity: EntityWithBalance | null;
	onClose: () => void;
	existingTransaction?: Transaction;
}

export function TransactionModal({
	visible,
	fromEntity,
	toEntity,
	onClose,
	existingTransaction,
}: TransactionModalProps) {
	const [amount, setAmount] = useState('');
	const [note, setNote] = useState('');
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [showDatePicker, setShowDatePicker] = useState(false);
	const inputRef = useRef<TextInput>(null);
	const addTransaction = useStore((state) => state.addTransaction);
	const updateTransaction = useStore((state) => state.updateTransaction);

	const isEditing = !!existingTransaction;

	// Reset and focus when modal opens
	useEffect(() => {
		if (visible) {
			if (existingTransaction) {
				setAmount(existingTransaction.amount.toString());
				setNote(existingTransaction.note ?? '');
				setSelectedDate(new Date(existingTransaction.timestamp));
			} else {
				setAmount('');
				setNote('');
				setSelectedDate(new Date());
			}
			setShowDatePicker(false);
			// Focus input after a short delay to ensure modal is visible
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [visible, existingTransaction]);

	const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
		if (Platform.OS === 'android') {
			setShowDatePicker(false);
		}
		if (date) {
			setSelectedDate(date);
		}
	};

	const formatDateDisplay = (date: Date): string => {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) {
			return 'Today';
		}
		if (date.toDateString() === yesterday.toDateString()) {
			return 'Yesterday';
		}
		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
		});
	};

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

		// Use selected date but preserve current time for new transactions
		const timestamp = isEditing
			? selectedDate.getTime()
			: (() => {
					const now = new Date();
					const result = new Date(selectedDate);
					result.setHours(
						now.getHours(),
						now.getMinutes(),
						now.getSeconds(),
						now.getMilliseconds()
					);
					return result.getTime();
				})();

		if (isEditing && existingTransaction) {
			await updateTransaction(existingTransaction.id, {
				amount: numAmount,
				note: note.trim() || undefined,
				timestamp,
			});
		} else {
			await addTransaction({
				id: generateId(),
				from_entity_id: fromEntity.id,
				to_entity_id: toEntity.id,
				amount: numAmount,
				currency: fromEntity.currency,
				timestamp,
				note: note.trim() || undefined,
			});
		}

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
					<Text className="font-sans-semibold text-base text-ink">
						{isEditing ? 'Edit Transaction' : 'New Transaction'}
					</Text>
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
					<View className="mb-8 flex-row items-start">
						<View className="flex-1 items-center">
							<View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-paper-300">
								<Text className="font-sans-medium text-xl text-ink-muted">
									{fromEntity.name.charAt(0)}
								</Text>
							</View>
							<Text className="font-sans text-sm text-ink-muted" numberOfLines={1}>
								{fromEntity.name}
							</Text>
						</View>
						<View className="items-center px-2 py-3">
							<ArrowRight size={24} color="#2C2416" />
						</View>
						<View className="flex-1 items-center">
							<View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-paper-300">
								<Text className="font-sans-medium text-xl text-ink-muted">
									{toEntity.name.charAt(0)}
								</Text>
							</View>
							<Text className="font-sans text-sm text-ink-muted" numberOfLines={1}>
								{toEntity.name}
							</Text>
						</View>
					</View>

					{/* Amount input */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Amount
						</Text>
						<View className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100 px-4 py-3">
							<TextInput
								ref={inputRef}
								value={amount}
								onChangeText={setAmount}
								placeholder="0"
								keyboardType="numeric"
								className="flex-1 font-sans-semibold text-3xl  text-ink"
								style={styles.input}
								placeholderTextColor="#9C8B74"
							/>
							<Text className="font-sans text-lg text-ink-muted">
								{fromEntity.currency}
							</Text>
						</View>

						{/* Suggested amount button (only for new transactions) */}
						{!isEditing && suggestedAmount && (
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

					{/* Date picker */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Date
						</Text>
						{Platform.OS === 'ios' ? (
							<View className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100">
								<View className="flex-1 flex-row items-center px-4 py-2">
									<Calendar size={20} color="#6B5D4A" />
									<Text className="ml-3 font-sans text-base text-ink">
										{formatDateDisplay(selectedDate)}
									</Text>
								</View>
								<DateTimePicker
									value={selectedDate}
									mode="date"
									display="compact"
									onChange={handleDateChange}
									maximumDate={new Date()}
									accentColor="#B85C38"
								/>
							</View>
						) : (
							<>
								<Pressable
									onPress={() => setShowDatePicker(true)}
									className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100 px-4 py-3"
								>
									<Calendar size={20} color="#6B5D4A" />
									<Text className="ml-3 font-sans text-base text-ink">
										{formatDateDisplay(selectedDate)}
									</Text>
								</Pressable>
								{showDatePicker && (
									<DateTimePicker
										value={selectedDate}
										mode="date"
										display="default"
										onChange={handleDateChange}
										maximumDate={new Date()}
									/>
								)}
							</>
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
							className="border-paper-400 rounded-lg border bg-paper-100 px-4 py-3 font-sans text-base  text-ink"
							style={styles.input}
							placeholderTextColor="#9C8B74"
						/>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}
