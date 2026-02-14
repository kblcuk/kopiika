import { useState, useEffect, useRef, useMemo } from 'react';
import {
	View,
	Text,
	TextInput,
	Pressable,
	Modal,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ArrowRight, Calendar, Pencil } from 'lucide-react-native';

import type { Entity, EntityWithBalance, Transaction } from '@/src/types';
import {
	formatAmount,
	reverseFormatCurrency,
	roundMoney,
	DEFAULT_CURRENCY,
	getCurrencySymbol,
} from '@/src/utils/format';
import { useStore } from '@/src/store';
import { generateId } from '@/src/utils/ids';
import { styles } from '../styles/text-input';
import { getValidFromEntities, getValidToEntities } from '@/src/utils/transaction-validation';
import { EntitySelectionSheet } from './entity-selection-sheet';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';

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
	const [selectedFromId, setSelectedFromId] = useState<string | null>(null);
	const [selectedToId, setSelectedToId] = useState<string | null>(null);
	const [showFromSheet, setShowFromSheet] = useState(false);
	const [showToSheet, setShowToSheet] = useState(false);
	const inputRef = useRef<TextInput>(null);
	const addTransaction = useStore((state) => state.addTransaction);
	const updateTransaction = useStore((state) => state.updateTransaction);
	const entities = useStore((state) => state.entities);

	const isEditing = !!existingTransaction;

	// Get current currency (from existingTransaction when editing, or from fromEntity for new)
	const currency = existingTransaction?.currency ?? fromEntity?.currency ?? DEFAULT_CURRENCY;

	// Look up selected entities for display
	const selectedFromEntity = useMemo(() => {
		if (!selectedFromId) return null;
		return entities.find((e) => e.id === selectedFromId) ?? null;
	}, [selectedFromId, entities]);

	const selectedToEntity = useMemo(() => {
		if (!selectedToId) return null;
		return entities.find((e) => e.id === selectedToId) ?? null;
	}, [selectedToId, entities]);

	// Filter valid "from" entities based on selected "to" entity
	const validFromEntities = useMemo(() => {
		if (!isEditing || !selectedToEntity) return [];
		const valid = getValidFromEntities(entities, selectedToEntity, currency);
		// Include balance adjustment entity at the beginning
		return valid;
	}, [isEditing, selectedToEntity, entities, currency]);

	// Filter valid "to" entities based on selected "from" entity
	const validToEntities = useMemo(() => {
		if (!isEditing || !selectedFromEntity) return [];
		return getValidToEntities(
			entities,
			selectedFromEntity,
			currency,
			selectedFromId ?? undefined
		);
	}, [isEditing, selectedFromEntity, entities, currency, selectedFromId]);

	// Reset and focus when modal opens
	useEffect(() => {
		if (visible) {
			if (existingTransaction) {
				setAmount(roundMoney(existingTransaction.amount).toString());
				setNote(existingTransaction.note ?? '');
				setSelectedDate(new Date(existingTransaction.timestamp));
				setSelectedFromId(existingTransaction.from_entity_id);
				setSelectedToId(existingTransaction.to_entity_id);
			} else {
				setAmount('');
				setNote('');
				setSelectedDate(new Date());
				setSelectedFromId(null);
				setSelectedToId(null);
			}
			setShowDatePicker(false);
			setShowFromSheet(false);
			setShowToSheet(false);
			// Focus input after a short delay to ensure modal is visible
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [visible, existingTransaction]);

	// Handle "from" entity selection
	const handleFromSelect = (entity: Entity) => {
		setSelectedFromId(entity.id);

		// Check if current "to" is still valid with new "from"
		if (selectedToId) {
			const validTos = getValidToEntities(entities, entity, currency, entity.id);
			const stillValid = validTos.some((e) => e.id === selectedToId);
			if (!stillValid) {
				setSelectedToId(null);
			}
		}
	};

	// Handle "to" entity selection
	const handleToSelect = (entity: Entity) => {
		setSelectedToId(entity.id);
	};

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

	// For new transactions, require fromEntity and toEntity props
	// For editing, require existingTransaction with valid selections
	if (isEditing) {
		if (!existingTransaction || !selectedFromId || !selectedToId) return null;
	} else {
		if (!fromEntity || !toEntity) return null;
	}

	// Determine which entities to display
	const displayFromEntity = isEditing ? selectedFromEntity : fromEntity;
	const displayToEntity = isEditing ? selectedToEntity : toEntity;

	// Suggest remaining planned amount for certain flows (only for new transactions)
	const getSuggestedAmount = (): number | null => {
		if (isEditing || !fromEntity || !toEntity) return null;
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
		const numAmount = reverseFormatCurrency(amount);
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
			const updates: {
				amount?: number;
				note?: string;
				timestamp?: number;
				from_entity_id?: string;
				to_entity_id?: string;
			} = {
				amount: numAmount,
				note: note.trim() || undefined,
				timestamp,
			};

			// Include entity changes if they differ from original
			if (selectedFromId && selectedFromId !== existingTransaction.from_entity_id) {
				updates.from_entity_id = selectedFromId;
			}
			if (selectedToId && selectedToId !== existingTransaction.to_entity_id) {
				updates.to_entity_id = selectedToId;
			}

			await updateTransaction(existingTransaction.id, updates);
		} else if (fromEntity && toEntity) {
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
			setAmount(roundMoney(suggestedAmount).toString());
		}
	};

	// Render entity bubble (reused for both from and to)
	const renderEntityBubble = (
		entity: Entity | EntityWithBalance | null,
		onPress?: () => void
	) => {
		if (!entity) return null;

		const IconComponent = getIcon(entity.icon || 'circle');
		const typeColors = getEntityTypeColors(entity.type);
		const isTappable = !!onPress;

		return (
			<Pressable onPress={onPress} disabled={!isTappable} className="flex-1 items-center">
				<View className="relative">
					<View
						className={`mb-2 h-12 w-12 items-center justify-center rounded-full ${typeColors.bg}`}
					>
						<IconComponent size={20} color={typeColors.iconColor} />
					</View>
					{isTappable && (
						<View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full bg-paper-300">
							<Pencil size={10} color="#6B5D4A" />
						</View>
					)}
				</View>
				<Text
					className={`text-center font-sans text-sm ${isTappable ? 'text-ink' : 'text-ink-muted'}`}
					numberOfLines={1}
				>
					{entity.name}
				</Text>
			</Pressable>
		);
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
					<Pressable onPress={onClose} hitSlop={20} testID="transaction-cancel-button">
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">
						{isEditing ? 'Edit Transaction' : 'New Transaction'}
					</Text>
					<Pressable
						onPress={handleSubmit}
						disabled={!amount || reverseFormatCurrency(amount) <= 0}
						hitSlop={20}
						testID="transaction-save-button"
					>
						<Text
							className={`font-sans-semibold text-base ${
								amount && reverseFormatCurrency(amount) > 0
									? 'text-accent'
									: 'text-ink-muted'
							}`}
						>
							Save
						</Text>
					</Pressable>
				</View>

				{/* Content */}
				<ScrollView className="flex-1 px-5 pt-6">
					{/* From → To */}
					<View className="mb-8 flex-row items-start">
						{renderEntityBubble(
							displayFromEntity,
							isEditing ? () => setShowFromSheet(true) : undefined
						)}
						<View className="items-center px-2 py-3">
							<ArrowRight size={24} color="#2C2416" />
						</View>
						{renderEntityBubble(
							displayToEntity,
							isEditing ? () => setShowToSheet(true) : undefined
						)}
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
								testID="transaction-amount-input"
							/>
							<Text className="font-sans text-lg text-ink-muted">
								{getCurrencySymbol(currency)}
							</Text>
						</View>

						{/* Suggested amount button (only for new transactions) */}
						{!isEditing && suggestedAmount && (
							<Pressable
								onPress={handleUseSuggested}
								className="mt-3 self-start rounded-full bg-paper-200 px-3 py-1.5"
								testID="transaction-suggested-amount-button"
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
					<View className="pb-6">
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
							testID="transaction-note-input"
						/>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>

			{/* Entity selection sheets */}
			<EntitySelectionSheet
				visible={showFromSheet}
				title="Select Source"
				entities={validFromEntities}
				selectedId={selectedFromId}
				onSelect={handleFromSelect}
				onClose={() => setShowFromSheet(false)}
			/>
			<EntitySelectionSheet
				visible={showToSheet}
				title="Select Destination"
				entities={validToEntities}
				selectedId={selectedToId}
				onSelect={handleToSelect}
				onClose={() => setShowToSheet(false)}
			/>
		</Modal>
	);
}
