import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, TextInput, Pressable, Modal, Platform, Alert } from 'react-native';
import { Text } from './text';
import {
	KeyboardAwareScrollView,
	KeyboardController,
	KeyboardExtender,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ArrowRight, Calendar, Pencil, Split, Plus, X, Repeat } from 'lucide-react-native';
import type { RecurrenceFrequency } from '@/src/types/recurrence';
import { HORIZON_OPTIONS, DEFAULT_HORIZON_DAYS } from '@/src/types/recurrence';

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
import {
	sharedNumericTextInputProps,
	sharedTextInputProps,
	styles,
	textInputClassNames,
} from '../styles/text-input';
import { getValidFromEntities, getValidToEntities } from '@/src/utils/transaction-validation';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { EntitySelectionSheet } from './entity-selection-sheet';
import { SavingsFundingSection, type SavingsFundingHandle } from './savings-funding-section';
import { OperatorToolbar } from './operator-toolbar';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { getEntityDisplayName, isEntityActive } from '@/src/utils/entity-display';
import { normalizeNumericInput } from '@/src/utils/numeric-input';
import { normalizeDecimalSeparator } from '@/src/utils/expression-input';
import { useExpressionInput } from '@/src/hooks/use-expression-input';
import { showSeriesScopeAlert } from './series-action-sheet';

interface SplitRow {
	id: string;
	toEntityId: string | null;
	// amount is ignored for row 0 (anchor); anchor amount is always derived
	amount: string;
}

interface TransactionModalProps {
	visible: boolean;
	fromEntity: EntityWithBalance | null;
	toEntity: EntityWithBalance | null;
	onClose: () => void;
	existingTransaction?: Transaction;
	/** Opens in quick-add mode: entity pickers shown upfront, no drag required */
	quickAdd?: boolean;
	seriesScope?: 'single' | 'future';
}

export function TransactionModal({
	visible,
	fromEntity,
	toEntity,
	onClose,
	existingTransaction,
	quickAdd,
	seriesScope,
}: TransactionModalProps) {
	const [amount, setAmount] = useState('');
	const [note, setNote] = useState('');
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [showDatePicker, setShowDatePicker] = useState(false);
	const [selectedFromId, setSelectedFromId] = useState<string | null>(null);
	const [selectedToId, setSelectedToId] = useState<string | null>(null);
	const [showFromSheet, setShowFromSheet] = useState(false);
	const [showToSheet, setShowToSheet] = useState(false);

	// Split mode
	const [isSplitMode, setIsSplitMode] = useState(false);
	const [splits, setSplits] = useState<SplitRow[]>([]);
	const [activeSplitIndex, setActiveSplitIndex] = useState<number | null>(null);
	// Snapshot of amount when split mode was entered — drives the anchor calculation
	const [splitTotal, setSplitTotal] = useState(0);

	// Savings funding — portion of typed amount sourced from savings reservations
	const [totalFunded, setTotalFunded] = useState(0);
	const insets = useSafeAreaInsets();
	const inputRef = useRef<TextInput>(null);
	const fundingRef = useRef<SavingsFundingHandle>(null);
	const [isRepeat, setIsRepeat] = useState(false);
	const [repeatFrequency, setRepeatFrequency] = useState<RecurrenceFrequency>('monthly');
	const [repeatEndMode, setRepeatEndMode] = useState<'never' | 'until' | 'count'>('never');
	const [repeatEndDate, setRepeatEndDate] = useState<Date | null>(null);
	const [showRepeatEndDatePicker, setShowRepeatEndDatePicker] = useState(false);
	const [repeatEndCount, setRepeatEndCount] = useState('');
	const [repeatHorizon, setRepeatHorizon] = useState(DEFAULT_HORIZON_DAYS);

	const addTransaction = useStore((state) => state.addTransaction);
	const updateTransaction = useStore((state) => state.updateTransaction);
	const updateTransactionWithScope = useStore((state) => state.updateTransactionWithScope);
	const deleteTransaction = useStore((state) => state.deleteTransaction);
	const deleteTransactionWithScope = useStore((state) => state.deleteTransactionWithScope);
	const addRecurringTransaction = useStore((state) => state.addRecurringTransaction);
	const entities = useStore((state) => state.entities);

	const amountExpr = useExpressionInput(
		isSplitMode ? splitTotal.toString() : amount,
		useCallback(
			(v: string) => {
				if (isSplitMode) {
					const n = reverseFormatCurrency(normalizeDecimalSeparator(v));
					setSplitTotal(isNaN(n) ? 0 : roundMoney(n));
				} else {
					setAmount(v);
				}
			},
			[isSplitMode]
		)
	);

	const isEditing = !!existingTransaction;

	const selectedFromEntity = useMemo(
		() => (selectedFromId ? (entities.find((e) => e.id === selectedFromId) ?? null) : null),
		[selectedFromId, entities]
	);

	const selectedToEntity = useMemo(
		() => (selectedToId ? (entities.find((e) => e.id === selectedToId) ?? null) : null),
		[selectedToId, entities]
	);

	// In quickAdd mode, currency follows the selected from-entity
	const currency =
		existingTransaction?.currency ??
		selectedFromEntity?.currency ??
		fromEntity?.currency ??
		DEFAULT_CURRENCY;

	const validFromEntities = useMemo(() => {
		if (!selectedToEntity) return [];
		return getValidFromEntities(entities, selectedToEntity, currency);
	}, [selectedToEntity, entities, currency]);

	// In quickAdd mode, valid from-sources are income + account entities (things that can send money)
	const quickAddFromEntities = useMemo(() => {
		if (!quickAdd) return [];
		return entities.filter(
			(e) =>
				(e.type === 'income' || e.type === 'account' || e.type === 'category') &&
				isEntityActive(e) &&
				e.id !== BALANCE_ADJUSTMENT_ENTITY_ID
		);
	}, [quickAdd, entities]);

	const validToEntities = useMemo(() => {
		if (!selectedFromEntity) return [];
		return getValidToEntities(
			entities,
			selectedFromEntity,
			currency,
			selectedFromId ?? undefined
		);
	}, [selectedFromEntity, entities, currency, selectedFromId]);

	// Valid targets for split entity picker
	const validSplitTargets = useMemo(() => {
		const source = selectedFromEntity ?? fromEntity;
		if (!source) return [];
		return getValidToEntities(entities, source, currency);
	}, [selectedFromEntity, fromEntity, entities, currency]);

	// Anchor = typed total - sum of all non-anchor splits
	// Row 0 is always the anchor; its amount field in state is ignored
	const anchorAmount = useMemo(() => {
		if (!isSplitMode) return 0;
		const otherSum = splits
			.slice(1)
			.reduce((sum, s) => sum + (reverseFormatCurrency(s.amount) || 0), 0);
		return roundMoney(splitTotal - otherSum);
	}, [isSplitMode, splits, splitTotal]);

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
				// Pre-fill with default account in quickAdd mode
				const currentEntities = useStore.getState().entities;
				const defaultAccount = quickAdd
					? currentEntities.find(
							(e) => e.type === 'account' && e.is_default && !e.is_deleted
						)
					: null;
				setSelectedFromId(fromEntity?.id ?? defaultAccount?.id ?? null);
				setSelectedToId(toEntity?.id ?? null);
			}
			setShowDatePicker(false);
			setShowFromSheet(false);
			setShowToSheet(false);
			setIsSplitMode(false);
			setSplits([]);
			setSplitTotal(0);
			setActiveSplitIndex(null);
			setTotalFunded(0);
			setIsRepeat(false);
			setRepeatFrequency('monthly');
			setRepeatEndMode('never');
			setRepeatEndDate(null);
			setShowRepeatEndDatePicker(false);
			setRepeatEndCount('');
			setRepeatHorizon(DEFAULT_HORIZON_DAYS);
			const ref = amountExpr.inputRef;
			setTimeout(() => ref.current?.focus(), 100);
		}
	}, [visible, existingTransaction, quickAdd, amountExpr.inputRef, fromEntity?.id, toEntity?.id]);

	const handleFromSelect = (entity: Entity) => {
		setSelectedFromId(entity.id);
		let toInvalidated = false;
		if (selectedToId) {
			const validTos = getValidToEntities(entities, entity, currency, entity.id);
			if (!validTos.some((e) => e.id === selectedToId)) {
				setSelectedToId(null);
				toInvalidated = true;
			}
		}
		// Automatically advance to the to-entity picker when needed
		if (toInvalidated || (!isEditing && !selectedToId)) {
			setTimeout(() => setShowToSheet(true), 350);
		}
	};

	const handleToSelect = (entity: Entity) => {
		setSelectedToId(entity.id);
		// Focus amount field after picking destination
		if (!isEditing) {
			setTimeout(() => amountExpr.inputRef.current?.focus(), 350);
		}
	};

	const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
		if (Platform.OS === 'android') setShowDatePicker(false);
		if (date) setSelectedDate(date);
	};

	const formatDateDisplay = (date: Date): string => {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		if (date.toDateString() === today.toDateString()) return 'Today';
		if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
		});
	};

	// ── Split mode handlers ───────────────────────────────────────────────────

	const handleEnterSplitMode = () => {
		const resolved = amountExpr.resolve();
		const total = reverseFormatCurrency(resolved) || 0;
		setSplitTotal(total);
		setIsSplitMode(true);
		setSplits([
			// Row 0: anchor — toEntityId from drag, amount ignored (always derived)
			{ id: generateId(), toEntityId: toEntity?.id ?? null, amount: '' },
			// Row 1: first user-editable split
			{ id: generateId(), toEntityId: null, amount: '' },
		]);
	};

	// Collapse split mode back to single transaction
	const handleMerge = () => {
		setIsSplitMode(false);
		setSplits([]);
		// Restore the amount the user had typed before entering split mode
		setAmount(splitTotal > 0 ? roundMoney(splitTotal).toString() : '');
		setSplitTotal(0);
		setTimeout(() => amountExpr.inputRef.current?.focus(), 50);
	};

	const handleSplitEntitySelect = (entity: Entity) => {
		if (activeSplitIndex === null) return;
		setSplits((prev) =>
			prev.map((s, i) => (i === activeSplitIndex ? { ...s, toEntityId: entity.id } : s))
		);
		setActiveSplitIndex(null);
	};

	// Only non-anchor rows (index > 0) are user-editable
	const handleSplitAmountChange = (index: number, value: string) => {
		if (index === 0) return;
		setSplits((prev) =>
			prev.map((s, i) => (i === index ? { ...s, amount: normalizeNumericInput(value) } : s))
		);
	};

	const handleAddSplit = () =>
		setSplits((prev) => [...prev, { id: generateId(), toEntityId: null, amount: '' }]);

	// Minimum: anchor + 1 non-anchor row = 2 total; non-anchor rows only
	const handleRemoveSplit = (index: number) => {
		if (index === 0 || splits.length <= 2) return;
		setSplits((prev) => prev.filter((_, i) => i !== index));
	};

	// ── Delete ────────────────────────────────────────────────────────────────

	const handleDelete = useCallback(() => {
		if (!existingTransaction) return;
		if (existingTransaction.series_id) {
			showSeriesScopeAlert('delete', (scope) => {
				deleteTransactionWithScope(existingTransaction.id, scope);
				KeyboardController.dismiss();
				onClose();
			});
		} else {
			Alert.alert('Delete Transaction', 'Are you sure you want to delete this transaction?', [
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						deleteTransaction(existingTransaction.id);
						KeyboardController.dismiss();
						onClose();
					},
				},
			]);
		}
	}, [existingTransaction, deleteTransaction, deleteTransactionWithScope, onClose]);

	// ── Cancel ────────────────────────────────────────────────────────────────

	const handleCancel = useCallback(() => {
		KeyboardController.dismiss();
		onClose();
	}, [onClose]);

	// ── Guard: require entities ───────────────────────────────────────────────

	if (isEditing) {
		if (!existingTransaction || !selectedFromId || !selectedToId) return null;
	} else if (!quickAdd) {
		if (!fromEntity || !toEntity) return null;
	}

	// All modes track selection via state; prop entities are fallback for first render
	const displayFromEntity = selectedFromEntity ?? fromEntity;
	const displayToEntity = selectedToEntity ?? toEntity;

	const getSuggestedAmount = (): number | null => {
		if (isEditing || !fromEntity || !toEntity || isSplitMode) return null;
		// Hide if user changed entities from the DnD originals
		if (displayFromEntity?.id !== fromEntity.id || displayToEntity?.id !== toEntity.id)
			return null;
		if (fromEntity.type === 'income')
			return fromEntity.remaining > 0 ? fromEntity.remaining : null;
		if (fromEntity.type === 'account' && toEntity.type === 'saving')
			return toEntity.remaining > 0 ? toEntity.remaining : null;
		return null;
	};
	const suggestedAmount = getSuggestedAmount();

	const entitiesSelected = !!(selectedFromId && selectedToId);

	const canSave = isSplitMode
		? // At least one saveable transaction: anchor with entity & positive amount, or any non-anchor with entity & positive amount
			(splits[0]?.toEntityId != null && anchorAmount > 0) ||
			splits.slice(1).some((s) => s.toEntityId && reverseFormatCurrency(s.amount) > 0)
		: !!(amount && reverseFormatCurrency(amount) > 0) && entitiesSelected;

	// ── Submit ────────────────────────────────────────────────────────────────

	const handleSubmit = async () => {
		// Resolve any pending calculator expression before submitting
		const resolvedAmount = amountExpr.resolve();

		try {
			const now = new Date();
			const timestamp = isEditing
				? selectedDate.getTime()
				: (() => {
						const result = new Date(selectedDate);
						result.setHours(
							now.getHours(),
							now.getMinutes(),
							now.getSeconds(),
							now.getMilliseconds()
						);
						return result.getTime();
					})();

			const splitFrom = displayFromEntity;
			if (isSplitMode && splitFrom) {
				const txns: Parameters<typeof addTransaction>[0][] = [];

				// Anchor transaction (row 0)
				if (splits[0]?.toEntityId && anchorAmount > 0) {
					txns.push({
						id: generateId(),
						from_entity_id: splitFrom.id,
						to_entity_id: splits[0].toEntityId,
						amount: anchorAmount,
						currency: splitFrom.currency,
						timestamp,
						note: note.trim() || undefined,
					});
				}
				// Non-anchor splits
				for (const split of splits.slice(1)) {
					const amt = reverseFormatCurrency(split.amount);
					if (!split.toEntityId || isNaN(amt) || amt <= 0) continue;
					txns.push({
						id: generateId(),
						from_entity_id: splitFrom.id,
						to_entity_id: split.toEntityId,
						amount: amt,
						currency: splitFrom.currency,
						timestamp,
						note: note.trim() || undefined,
					});
				}

				if (txns.length === 0) return;
				for (const txn of txns) await addTransaction(txn);

				// Release savings reservations via saving→account transactions
				// Always confirmed — releases are immediate regardless of main transaction date
				const splitFunded = fundingRef.current?.getFundedReservations() ?? [];
				for (const f of splitFunded) {
					await addTransaction({
						id: generateId(),
						from_entity_id: f.savingEntityId,
						to_entity_id: splitFrom.id,
						amount: f.fundAmount,
						currency: splitFrom.currency,
						timestamp,
						is_confirmed: true,
					});
				}

				await KeyboardController.dismiss();
				onClose();
				return;
			}

			const typedAmount = reverseFormatCurrency(resolvedAmount);
			if (isNaN(typedAmount) || typedAmount <= 0) return;

			const numAmount = roundMoney(typedAmount);

			if (isEditing && existingTransaction) {
				const updates: {
					amount?: number;
					note?: string;
					timestamp?: number;
					from_entity_id?: string;
					to_entity_id?: string;
				} = { amount: numAmount, note: note.trim() || undefined, timestamp };
				if (selectedFromId && selectedFromId !== existingTransaction.from_entity_id)
					updates.from_entity_id = selectedFromId;
				if (selectedToId && selectedToId !== existingTransaction.to_entity_id)
					updates.to_entity_id = selectedToId;
				if (seriesScope) {
					await updateTransactionWithScope(existingTransaction.id, updates, seriesScope);
				} else {
					await updateTransaction(existingTransaction.id, updates);
				}
			} else if (selectedFromEntity && selectedToEntity) {
				if (isRepeat) {
					await addRecurringTransaction(
						{
							from_entity_id: selectedFromEntity.id,
							to_entity_id: selectedToEntity.id,
							amount: numAmount,
							currency: selectedFromEntity.currency,
							timestamp,
							note: note.trim() || undefined,
						},
						{
							rule: { type: repeatFrequency },
							endDate:
								repeatEndMode === 'until' && repeatEndDate
									? repeatEndDate.getTime()
									: null,
							endCount:
								repeatEndMode === 'count' && repeatEndCount
									? parseInt(repeatEndCount, 10)
									: null,
							horizon: repeatHorizon,
						}
					);
				} else {
					await addTransaction({
						id: generateId(),
						from_entity_id: selectedFromEntity.id,
						to_entity_id: selectedToEntity.id,
						amount: numAmount,
						currency: selectedFromEntity.currency,
						timestamp,
						note: note.trim() || undefined,
					});
				}
			}

			// Release savings reservations via saving→account transactions
			// Always confirmed — releases are immediate regardless of main transaction date
			const funded = fundingRef.current?.getFundedReservations() ?? [];
			const accountId = selectedFromEntity?.id ?? fromEntity?.id;
			const fundCurrency = selectedFromEntity?.currency ?? fromEntity?.currency ?? currency;
			if (accountId) {
				for (const f of funded) {
					await addTransaction({
						id: generateId(),
						from_entity_id: f.savingEntityId,
						to_entity_id: accountId,
						amount: f.fundAmount,
						currency: fundCurrency,
						timestamp,
						is_confirmed: true,
					});
				}
			}

			KeyboardController.dismiss();
			onClose();
		} catch (error) {
			console.error('Failed to save transaction:', error);
			// Still close so the user isn't stuck on a dead modal
			KeyboardController.dismiss();
			onClose();
		}
	};

	// ── Renderers ─────────────────────────────────────────────────────────────

	const renderEntityBubble = (
		entity: Entity | EntityWithBalance | null,
		onPress?: () => void,
		emptyLabel?: string
	) => {
		if (!entity) {
			// Placeholder shown in quickAdd mode before entity is selected
			return (
				<Pressable onPress={onPress} className="flex-1 items-center">
					<View
						className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-paper-200"
						style={{
							borderWidth: 1.5,
							borderColor: colors.border.dashed,
							borderStyle: 'dashed',
						}}
					>
						<Plus size={20} color={colors.ink.placeholder} />
					</View>
					<Text className="text-center font-sans text-sm text-ink-muted">
						{emptyLabel ?? 'Pick'}
					</Text>
				</Pressable>
			);
		}
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
							<Pencil size={10} color={colors.ink.muted} />
						</View>
					)}
				</View>
				<Text
					className={`text-center font-sans text-sm ${isTappable ? 'text-ink' : 'text-ink-muted'}`}
					numberOfLines={1}
				>
					{getEntityDisplayName(entity)}
				</Text>
			</Pressable>
		);
	};

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={handleCancel}
		>
			<View
				className="flex-1 bg-paper-50"
				style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
			>
				{/* Header */}
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Pressable
						onPress={handleCancel}
						hitSlop={20}
						testID="transaction-cancel-button"
					>
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">
						{isEditing
							? 'Edit Transaction'
							: quickAdd
								? 'Add Transaction'
								: 'New Transaction'}
					</Text>
					<Pressable
						onPress={handleSubmit}
						disabled={!canSave}
						hitSlop={20}
						testID="transaction-save-button"
					>
						<Text
							className={`font-sans-semibold text-base ${canSave ? 'text-accent' : 'text-ink-muted'}`}
						>
							Save
						</Text>
					</Pressable>
				</View>

				<KeyboardAwareScrollView
					bottomOffset={50}
					keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
					keyboardShouldPersistTaps="handled"
					className="flex-1 px-5 pt-6"
				>
					{/* From → To */}
					<View className="mb-8 flex-row items-start">
						{renderEntityBubble(
							displayFromEntity,
							() => setShowFromSheet(true),
							quickAdd ? 'From' : undefined
						)}
						<View className="items-center px-2 py-3">
							<ArrowRight size={24} color={colors.ink.DEFAULT} />
						</View>
						{renderEntityBubble(
							displayToEntity,
							() => setShowToSheet(true),
							quickAdd ? 'To' : undefined
						)}
					</View>

					{/* Series indicator */}
					{isEditing && existingTransaction?.series_id && (
						<View className="mb-4 rounded-lg bg-info/10 px-3 py-2">
							<Text className="font-sans text-sm text-info">
								Part of a recurring series
								{seriesScope === 'future'
									? ' — editing all future'
									: ' — editing this one'}
							</Text>
						</View>
					)}

					{/* Amount / Total Paid */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Amount
						</Text>
						<View className={textInputClassNames.inlineContainer}>
							<TextInput
								{...sharedNumericTextInputProps}
								{...amountExpr.inputProps}
								placeholder="0"
								className={textInputClassNames.heroAmountInput}
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
								testID="transaction-amount-input"
							/>
							<Text className={textInputClassNames.suffixLarge}>
								{getCurrencySymbol(currency)}
							</Text>
						</View>
						{amountExpr.preview && (
							<Text className="mt-1 font-sans text-base text-ink-muted">
								{amountExpr.preview}
							</Text>
						)}
						{!isEditing && suggestedAmount && (
							<Pressable
								onPress={() => setAmount(roundMoney(suggestedAmount).toString())}
								className="mt-3 self-start rounded-full bg-paper-200 px-3 py-1.5"
								testID="transaction-suggested-amount-button"
							>
								<Text className="font-sans text-sm text-ink-muted">
									Use remaining: {formatAmount(suggestedAmount)}
								</Text>
							</Pressable>
						)}
						{/* Show note when part of the amount is sourced from savings */}
						{totalFunded > 0 && (
							<Text className="mt-2 font-sans text-sm text-ink-muted">
								{formatAmount(totalFunded, currency)} from savings
							</Text>
						)}
					</View>

					{/* Fund from savings — show when source is an account with reservations */}
					{!isEditing && displayFromEntity?.type === 'account' && (
						<SavingsFundingSection
							ref={fundingRef}
							accountEntityId={displayFromEntity.id}
							currency={currency}
							enteredAmount={
								isSplitMode ? splitTotal : reverseFormatCurrency(amount) || 0
							}
							onFundingChange={setTotalFunded}
						/>
					)}

					{/* Note */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Note (optional)
						</Text>
						<View className={textInputClassNames.container}>
							<TextInput
								{...sharedTextInputProps}
								ref={inputRef}
								value={note}
								onChangeText={setNote}
								placeholder="Add a note..."
								className={textInputClassNames.input}
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
								testID="transaction-note-input"
							/>
						</View>
					</View>

					{/* Date */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center">
							<Text className="font-sans text-sm uppercase tracking-wider text-ink-muted">
								Date
							</Text>
							{selectedDate > new Date(new Date().setHours(23, 59, 59, 999)) && (
								<Text className="ml-2 font-sans text-xs text-info">Scheduled</Text>
							)}
						</View>
						{Platform.OS === 'ios' ? (
							<View className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100">
								<View className="flex-1 flex-row items-center px-4 py-2">
									<Calendar size={20} color={colors.ink.muted} />
									<Text className="ml-3 font-sans text-base text-ink">
										{formatDateDisplay(selectedDate)}
									</Text>
								</View>
								<DateTimePicker
									value={selectedDate}
									mode="date"
									display="compact"
									onChange={handleDateChange}
									accentColor={colors.accent.deeper}
								/>
							</View>
						) : (
							<>
								<Pressable
									onPress={() => setShowDatePicker(true)}
									className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100 px-4 py-3"
								>
									<Calendar size={20} color={colors.ink.muted} />
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
									/>
								)}
							</>
						)}
					</View>

					{/* Split — only for account → category */}
					{!isEditing &&
						!quickAdd &&
						fromEntity?.type === 'account' &&
						toEntity?.type === 'category' && (
							<View className="mb-6">
								<Pressable
									onPress={isSplitMode ? handleMerge : handleEnterSplitMode}
									className="flex-row items-center rounded-lg bg-paper-100 px-3 py-2.5"
									style={{
										borderWidth: 1,
										borderColor: isSplitMode
											? colors.accent.DEFAULT
											: colors.border.dashed,
										borderStyle: isSplitMode ? 'solid' : 'dashed',
									}}
									testID="split-toggle-button"
								>
									<Split
										size={14}
										color={
											isSplitMode ? colors.accent.DEFAULT : colors.ink.muted
										}
									/>
									<Text
										className={`ml-2 font-sans text-sm ${isSplitMode ? 'text-accent' : 'text-ink-muted'}`}
									>
										Split
									</Text>
								</Pressable>

								{isSplitMode && (
									<View className="mt-3 overflow-hidden rounded-lg border border-paper-300 bg-paper-100">
										{splits.map((split, index) => {
											const splitEntity = split.toEntityId
												? entities.find((e) => e.id === split.toEntityId)
												: null;
											const typeColors = splitEntity
												? getEntityTypeColors(splitEntity.type)
												: null;
											const IconComponent = splitEntity
												? getIcon(splitEntity.icon || 'circle')
												: null;
											const isAnchor = index === 0;

											return (
												<View
													key={split.id}
													className="flex-row items-center px-3 py-2.5"
													style={
														index > 0
															? {
																	borderTopWidth: 1,
																	borderTopColor:
																		colors.border.light,
																}
															: undefined
													}
													testID={`split-row-${index}`}
												>
													{/* Entity chip */}
													<Pressable
														onPress={() => setActiveSplitIndex(index)}
														className="mr-3 flex-row items-center rounded-full bg-paper-200 px-2 py-1"
														style={{ maxWidth: 140 }}
														testID={`split-entity-${index}`}
													>
														{splitEntity &&
														typeColors &&
														IconComponent ? (
															<>
																<View
																	className={`mr-1.5 h-5 w-5 items-center justify-center rounded-full ${typeColors.bg}`}
																>
																	<IconComponent
																		size={11}
																		color={typeColors.iconColor}
																	/>
																</View>
																<Text
																	className="font-sans text-sm text-ink"
																	numberOfLines={1}
																	style={{ flexShrink: 1 }}
																>
																	{splitEntity.name}
																</Text>
															</>
														) : (
															<Text className="font-sans text-sm text-ink-muted">
																Pick category
															</Text>
														)}
														<Pencil
															size={9}
															color={colors.ink.placeholder}
															style={{
																marginLeft: 4,
																flexShrink: 0,
															}}
														/>
													</Pressable>

													{/* Amount area */}
													{isAnchor ? (
														// Anchor: auto-computed, read-only
														<View
															className="flex-1 flex-row items-center justify-end"
															testID="split-anchor-amount"
														>
															<Text
																className="font-sans-semibold text-lg"
																style={{
																	color:
																		anchorAmount >= 0
																			? colors.ink.light
																			: colors.negative
																					.DEFAULT,
																}}
															>
																{anchorAmount < 0 ? '-' : ''}
																{roundMoney(Math.abs(anchorAmount))}
															</Text>
															<Text className="ml-1 font-sans text-xs text-ink-muted">
																auto
															</Text>
														</View>
													) : (
														// Non-anchor: editable + "use remaining" chip
														<View className="flex-1 flex-row items-center justify-end">
															{!split.amount && anchorAmount > 0 && (
																<Pressable
																	onPress={() =>
																		handleSplitAmountChange(
																			index,
																			roundMoney(
																				anchorAmount
																			).toString()
																		)
																	}
																	className="mr-2 rounded-full bg-paper-200 px-2 py-0.5"
																	testID={`split-remaining-chip-${index}`}
																>
																	<Text className="font-sans text-xs text-positive">
																		→{' '}
																		{formatAmount(anchorAmount)}
																	</Text>
																</Pressable>
															)}
															<TextInput
																{...sharedNumericTextInputProps}
																value={split.amount}
																onChangeText={(v) =>
																	handleSplitAmountChange(
																		index,
																		v
																	)
																}
																placeholder="0"
																keyboardType="numeric"
																className={
																	textInputClassNames.inlineAmountInput
																}
																style={[
																	styles.input,
																	{
																		textAlign: 'right',
																		minWidth: 48,
																	},
																]}
																placeholderTextColor={
																	colors.ink.placeholder
																}
																testID={`split-amount-${index}`}
															/>
														</View>
													)}

													<Text className="ml-1 font-sans text-sm text-ink-muted">
														{getCurrencySymbol(currency)}
													</Text>

													{/* Remove (non-anchor only, disabled at minimum) */}
													{!isAnchor && (
														<Pressable
															onPress={() => handleRemoveSplit(index)}
															disabled={splits.length <= 2}
															hitSlop={12}
															className="ml-2"
															testID={`split-remove-${index}`}
														>
															<X
																size={16}
																color={
																	splits.length <= 2
																		? colors.border.DEFAULT
																		: colors.ink.placeholder
																}
															/>
														</Pressable>
													)}
												</View>
											);
										})}

										{/* Add split */}
										<Pressable
											onPress={handleAddSplit}
											className="flex-row items-center px-3 py-2.5"
											style={{
												borderTopWidth: 1,
												borderTopColor: colors.border.light,
											}}
											testID="split-add-button"
										>
											<Plus size={14} color={colors.ink.muted} />
											<Text className="ml-2 font-sans text-sm text-ink-muted">
												Add split
											</Text>
										</Pressable>
									</View>
								)}
							</View>
						)}

					{/* Repeat — create mode only */}
					{!isEditing && (
						<View className="mb-6">
							<Pressable
								onPress={() => setIsRepeat((v) => !v)}
								className="flex-row items-center rounded-lg bg-paper-100 px-3 py-2.5"
								style={{
									borderWidth: 1,
									borderColor: isRepeat
										? colors.accent.DEFAULT
										: colors.border.dashed,
									borderStyle: isRepeat ? 'solid' : 'dashed',
								}}
								testID="repeat-toggle"
							>
								<Repeat
									size={14}
									color={isRepeat ? colors.accent.DEFAULT : colors.ink.muted}
								/>
								<Text
									className={`ml-2 font-sans text-sm ${isRepeat ? 'text-accent' : 'text-ink-muted'}`}
								>
									Repeat
								</Text>
							</Pressable>

							{isRepeat && (
								<View className="mt-3 rounded-lg border border-paper-300 bg-paper-100 p-3">
									{/* Frequency */}
									<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
										Frequency
									</Text>
									<View className="mb-4 flex-row gap-2">
										{(['daily', 'weekly', 'monthly', 'yearly'] as const).map(
											(freq) => (
												<Pressable
													key={freq}
													onPress={() => setRepeatFrequency(freq)}
													className={`flex-1 items-center rounded-lg py-2 ${
														repeatFrequency === freq
															? 'bg-accent'
															: 'bg-paper-200'
													}`}
													testID={`repeat-freq-${freq}`}
												>
													<Text
														className={`font-sans text-sm capitalize ${
															repeatFrequency === freq
																? 'text-on-color'
																: 'text-ink-muted'
														}`}
													>
														{freq}
													</Text>
												</Pressable>
											)
										)}
									</View>

									{/* End condition */}
									<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
										Ends
									</Text>
									<View className="mb-4 flex-row gap-2">
										{(['never', 'until', 'count'] as const).map((mode) => (
											<Pressable
												key={mode}
												onPress={() => setRepeatEndMode(mode)}
												className={`flex-1 items-center rounded-lg py-2 ${
													repeatEndMode === mode
														? 'bg-accent'
														: 'bg-paper-200'
												}`}
												testID={`repeat-end-${mode}`}
											>
												<Text
													className={`font-sans text-sm ${
														repeatEndMode === mode
															? 'text-on-color'
															: 'text-ink-muted'
													}`}
												>
													{mode === 'never'
														? 'Never'
														: mode === 'until'
															? 'Until date'
															: 'After N'}
												</Text>
											</Pressable>
										))}
									</View>

									{repeatEndMode === 'until' && (
										<View className="mb-4">
											{Platform.OS === 'ios' ? (
												<DateTimePicker
													value={repeatEndDate ?? new Date()}
													mode="date"
													display="compact"
													onChange={(_, date) =>
														date && setRepeatEndDate(date)
													}
													minimumDate={selectedDate}
													accentColor={colors.accent.deeper}
												/>
											) : (
												<>
													<Pressable
														onPress={() =>
															setShowRepeatEndDatePicker(true)
														}
														className="border-paper-400 flex-row items-center rounded-lg border bg-paper-200 px-3 py-2"
													>
														<Calendar
															size={16}
															color={colors.ink.muted}
														/>
														<Text className="ml-2 font-sans text-sm text-ink">
															{repeatEndDate
																? repeatEndDate.toLocaleDateString(
																		undefined,
																		{
																			month: 'short',
																			day: 'numeric',
																			year: 'numeric',
																		}
																	)
																: 'Pick end date'}
														</Text>
													</Pressable>
													{showRepeatEndDatePicker && (
														<DateTimePicker
															value={repeatEndDate ?? new Date()}
															mode="date"
															display="default"
															onChange={(event, date) => {
																setShowRepeatEndDatePicker(false);
																if (event.type === 'set' && date) {
																	setRepeatEndDate(date);
																}
															}}
															minimumDate={selectedDate}
														/>
													)}
												</>
											)}
										</View>
									)}

									{repeatEndMode === 'count' && (
										<View className="mb-4">
											<TextInput
												{...sharedNumericTextInputProps}
												value={repeatEndCount}
												onChangeText={setRepeatEndCount}
												placeholder="Number of times"
												keyboardType="number-pad"
												className={textInputClassNames.input}
												style={styles.input}
												placeholderTextColor={colors.ink.placeholder}
												testID="repeat-end-count-input"
											/>
										</View>
									)}

									{/* Horizon */}
									<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
										Generate ahead
									</Text>
									<View className="flex-row gap-2">
										{HORIZON_OPTIONS.map((opt) => (
											<Pressable
												key={opt.days}
												onPress={() => setRepeatHorizon(opt.days)}
												className={`flex-1 items-center rounded-lg py-2 ${
													repeatHorizon === opt.days
														? 'bg-accent'
														: 'bg-paper-200'
												}`}
												testID={`repeat-horizon-${opt.days}`}
											>
												<Text
													className={`font-sans text-xs ${
														repeatHorizon === opt.days
															? 'text-on-color'
															: 'text-ink-muted'
													}`}
												>
													{opt.label}
												</Text>
											</Pressable>
										))}
									</View>
								</View>
							)}
						</View>
					)}

					{/* Delete — edit mode only */}
					{isEditing && (
						<Pressable
							onPress={handleDelete}
							className="mb-8 items-center rounded-lg border border-negative/30 bg-negative/10 py-3"
							testID="transaction-delete-button"
						>
							<Text className="font-sans-semibold text-base text-negative">
								Delete Transaction
							</Text>
						</Pressable>
					)}
				</KeyboardAwareScrollView>
			</View>

			<KeyboardExtender enabled={amountExpr.focused}>
				<OperatorToolbar
					onOperator={amountExpr.insertOperator}
					onEquals={amountExpr.resolve}
				/>
			</KeyboardExtender>

			{/* Entity pickers */}
			<EntitySelectionSheet
				visible={showFromSheet}
				title="Select Source"
				entities={quickAdd ? quickAddFromEntities : validFromEntities}
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

			{/* Split entity picker */}
			<EntitySelectionSheet
				visible={activeSplitIndex !== null}
				title="Select Category"
				entities={validSplitTargets}
				selectedId={
					activeSplitIndex !== null
						? (splits[activeSplitIndex]?.toEntityId ?? null)
						: null
				}
				onSelect={handleSplitEntitySelect}
				onClose={() => setActiveSplitIndex(null)}
			/>
		</Modal>
	);
}
