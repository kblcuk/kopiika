import { useState, useEffect, useRef } from 'react';
import {
	View,
	Text,
	TextInput,
	Pressable,
	Modal,
	KeyboardAvoidingView,
	Platform,
	Alert,
	ScrollView,
	Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import type { EntityWithBalance, Transaction } from '@/src/types';
import { getCurrentPeriod } from '@/src/types';
import {
	formatAmount,
	reverseFormatCurrency,
	roundMoney,
	getCurrencySymbol,
} from '@/src/utils/format';
import { useStore } from '@/src/store';

import { ICON_OPTIONS, DEFAULT_ICONS } from '@/src/constants/icons';
import { getIcon } from '@/src/constants/icon-registry';
import { styles } from '../styles/text-input';
import { colors } from '@/src/theme/colors';
import { generateId } from '@/src/utils/ids';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';

interface EntityDetailModalProps {
	visible: boolean;
	entity: EntityWithBalance | null;
	onClose: () => void;
}

const MAX_NAME_LENGTH = 100;

export function EntityDetailModal({ visible, entity, onClose }: EntityDetailModalProps) {
	const [name, setName] = useState('');
	const [nameError, setNameError] = useState<string | null>(null);
	const [selectedIcon, setSelectedIcon] = useState('');
	const [showIconPicker, setShowIconPicker] = useState(false);
	const [plannedAmount, setPlannedAmount] = useState('');
	const [actualAmount, setActualAmount] = useState('');
	const [isEditingActual, setIsEditingActual] = useState(false);
	const [includeInTotal, setIncludeInTotal] = useState(true);
	const inputRef = useRef<TextInput>(null);
	const insets = useSafeAreaInsets();

	const { plans, currentPeriod, setPlan, deleteEntity, updateEntity, addTransaction } = useStore(
		useShallow((state) => ({
			plans: state.plans,
			currentPeriod: state.currentPeriod,
			setPlan: state.setPlan,
			deleteEntity: state.deleteEntity,
			updateEntity: state.updateEntity,
			addTransaction: state.addTransaction,
		}))
	);

	// Find existing plan for this entity - all plans use 'all-time' period
	const existingPlan = entity
		? plans.find((p) => p.entity_id === entity.id && p.period === 'all-time')
		: null;

	// Reset when modal opens
	useEffect(() => {
		if (visible && entity) {
			setName(entity.name);
			setSelectedIcon(entity.icon || DEFAULT_ICONS[entity.type]);
			setPlannedAmount(
				existingPlan?.planned_amount != null
					? roundMoney(existingPlan.planned_amount).toString()
					: ''
			);
			setActualAmount(roundMoney(entity.actual).toString());
			setIsEditingActual(false);
			setIncludeInTotal(entity.include_in_total !== false);
			setNameError(null);
			setShowIconPicker(false);
		}
	}, [visible, entity, existingPlan?.planned_amount]);

	// Validate name on change
	const handleNameChange = (text: string) => {
		setName(text);

		if (text.trim().length === 0) {
			// Don't show error for empty field, but validation will fail
			setNameError(null);
		} else if (text.length > MAX_NAME_LENGTH) {
			setNameError(`Name is too long (max ${MAX_NAME_LENGTH} characters)`);
		} else {
			setNameError(null);
		}
	};

	// Validation state
	const isNameValid = name.trim().length > 0 && name.length <= MAX_NAME_LENGTH;
	const canSave = isNameValid;

	if (!entity) return null;

	// Get the icon component from registry for live preview
	const IconComponent = getIcon(selectedIcon || 'circle');
	const PencilIcon = getIcon('pencil');

	const handleSave = async () => {
		if (!canSave) return;

		const trimmedName = name.trim();

		// Validate icon is in allowed list, fallback to default if not
		const allowedIcons = ICON_OPTIONS[entity.type];
		const validIcon = allowedIcons.includes(selectedIcon)
			? selectedIcon
			: DEFAULT_ICONS[entity.type];

		// Update entity
		await updateEntity({
			...entity,
			name: trimmedName,
			icon: validIcon,
			include_in_total: includeInTotal,
		});

		// Update plan
		const amount = reverseFormatCurrency(plannedAmount) || 0;
		await setPlan({
			id: existingPlan?.id ?? generateId(),
			entity_id: entity.id,
			// All plans use 'all-time' period - static budget/goal
			period: 'all-time',
			// If updating existing plan, preserve original period_start; otherwise use current period
			period_start: existingPlan?.period_start ?? currentPeriod,
			planned_amount: amount,
		});

		// Handle balance adjustment for accounts
		if (entity.type === 'account' && isEditingActual) {
			const currentBalance = entity.actual;
			const targetBalance = reverseFormatCurrency(actualAmount) || 0;
			const adjustment = targetBalance - currentBalance;

			const roundedAdjustment = roundMoney(adjustment);
			if (roundedAdjustment !== 0) {
				const adjustmentTransaction: Transaction = {
					id: generateId(),
					from_entity_id:
						roundedAdjustment > 0 ? BALANCE_ADJUSTMENT_ENTITY_ID : entity.id,
					to_entity_id: roundedAdjustment > 0 ? entity.id : BALANCE_ADJUSTMENT_ENTITY_ID,
					amount: Math.abs(roundedAdjustment),
					currency: entity.currency,
					timestamp: Date.now(),
					note: `Balance correction: ${formatAmount(currentBalance)} → ${formatAmount(targetBalance)}`,
				};

				await addTransaction(adjustmentTransaction);
			}
		}

		onClose();
	};

	const handleDelete = () => {
		Alert.alert(
			'Delete Entity',
			`Are you sure you want to delete "${entity.name}"? This will also remove all associated plans.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						// Close modal first so user can see the gap-closing animation
						onClose();
						// Small delay to allow modal close animation to complete
						await new Promise((resolve) => setTimeout(resolve, 300));
						// Now delete - user will see entities slide to close the gap
						await deleteEntity(entity.id);
					},
				},
			]
		);
	};

	const typeLabel = {
		income: 'Income Source',
		account: 'Account',
		category: 'Expense Category',
		saving: 'Savings Goal',
	}[entity.type];

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
				style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
			>
				{/* Header */}
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Pressable onPress={onClose} hitSlop={20} testID="entity-detail-cancel-button">
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">Edit Entity</Text>
					<Pressable
						onPress={handleSave}
						disabled={!canSave}
						hitSlop={20}
						testID="entity-detail-save-button"
					>
						<Text
							className={`font-sans-semibold text-base ${canSave ? 'text-accent' : 'text-ink-muted'}`}
						>
							Save
						</Text>
					</Pressable>
				</View>

				{/* Content */}
				<ScrollView className="flex-1 px-5 pt-6" keyboardShouldPersistTaps="handled">
					{/* Entity icon with edit indicator */}
					<View className="mb-6 items-center">
						<Pressable
							onPress={() => setShowIconPicker(!showIconPicker)}
							className="mb-3"
						>
							<View className="relative h-20 w-20 items-center justify-center rounded-full bg-paper-300">
								<IconComponent size={36} color={colors.ink.muted} />
								{/* Pencil edit indicator */}
								<View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full bg-paper-50/90">
									<PencilIcon size={14} color={colors.ink.muted} />
								</View>
							</View>
						</Pressable>
						<Text className="font-sans text-sm text-ink-muted">{typeLabel}</Text>
					</View>

					{/* Icon picker (expandable) */}
					{showIconPicker && (
						<View className="mb-6">
							<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
								Choose Icon
							</Text>
							<View className="flex-row flex-wrap gap-2">
								{ICON_OPTIONS[entity.type].map((icon) => {
									const IconOption = getIcon(icon);
									const isSelected = selectedIcon === icon;

									return (
										<Pressable
											key={icon}
											onPress={() => {
												setSelectedIcon(icon);
												setShowIconPicker(false);
											}}
											className={`h-12 w-12 items-center justify-center rounded-full ${
												isSelected ? 'bg-accent' : 'bg-paper-200'
											}`}
										>
											<IconOption
												size={24}
												color={
													isSelected
														? colors.paper.warm
														: colors.ink.muted
												}
											/>
										</Pressable>
									);
								})}
							</View>
						</View>
					)}

					{/* Name input */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Name
						</Text>
						<TextInput
							value={name}
							onChangeText={handleNameChange}
							placeholder="Enter entity name"
							className={`border-paper-400 rounded-lg border bg-paper-100 px-4 py-3 font-sans text-base text-ink ${
								nameError ? 'border-negative' : ''
							}`}
							style={styles.input}
							placeholderTextColor={colors.ink.placeholder}
							autoCapitalize="words"
							testID="entity-detail-name-input"
						/>
						{nameError && (
							<Text className="mt-1 font-sans text-xs text-negative">
								{nameError}
							</Text>
						)}
					</View>

					{/* Current status - editable for accounts */}
					{entity.type === 'account' ? (
						<View className="mb-6">
							<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
								Current Balance
							</Text>
							<View className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100 px-4 py-3">
								<TextInput
									value={actualAmount}
									onChangeText={(text) => {
										setActualAmount(text);
										setIsEditingActual(true);
									}}
									placeholder="0"
									keyboardType="numeric"
									className="flex-1 font-sans-semibold text-2xl text-ink"
									style={styles.input}
									placeholderTextColor={colors.ink.placeholder}
									testID="entity-detail-actual-input"
								/>
								<Text className="font-sans text-lg text-ink-muted">
									{getCurrencySymbol(entity.currency)}
								</Text>
							</View>
							<Text className="mt-1 font-sans text-xs text-ink-muted">
								Correct your account balance. An adjustment transaction will be
								created.
							</Text>

							{/* Show remaining below */}
							<View className="mt-4 items-center rounded-lg bg-paper-100 px-4 py-3">
								<Text className="font-sans text-xs text-ink-muted">
									Remaining Budget
								</Text>
								<Text
									className={`font-sans-semibold text-lg ${entity.remaining < 0 ? 'text-negative' : 'text-ink'}`}
								>
									{formatAmount(entity.remaining)}
								</Text>
							</View>

							{/* Include in total toggle */}
							<View className="mt-4 flex-row items-center justify-between rounded-lg bg-paper-100 px-4 py-3">
								<View className="flex-1 pr-4">
									<Text className="font-sans text-base text-ink">
										Include in total balance
									</Text>
									<Text className="font-sans text-xs text-ink-muted">
										Turn off to exclude from summary header
									</Text>
								</View>
								<Switch
									value={includeInTotal}
									onValueChange={setIncludeInTotal}
									trackColor={{
										false: colors.border.DEFAULT,
										true: colors.accent.DEFAULT,
									}}
									thumbColor={colors.paper.warm}
									testID="entity-detail-include-in-total-switch"
								/>
							</View>
						</View>
					) : (
						/* Original read-only status for other entity types */
						<View className="mb-6 flex-row justify-around rounded-lg bg-paper-100 px-4 py-4">
							<View className="items-center">
								<Text className="font-sans text-xs text-ink-muted">Actual</Text>
								<Text className="font-sans-semibold text-lg text-ink">
									{formatAmount(entity.actual)}
								</Text>
							</View>
							<View className="items-center">
								<Text className="font-sans text-xs text-ink-muted">Remaining</Text>
								<Text
									className={`font-sans-semibold text-lg ${entity.remaining < 0 ? 'text-negative' : 'text-ink'}`}
								>
									{formatAmount(entity.remaining)}
								</Text>
							</View>
						</View>
					)}

					{/* Planned amount input */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Planned Amount ({getCurrentPeriod()})
						</Text>
						<View className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100 px-4 py-3">
							<TextInput
								ref={inputRef}
								value={plannedAmount}
								onChangeText={setPlannedAmount}
								placeholder="0"
								keyboardType="numeric"
								className="flex-1 font-sans-semibold text-2xl text-ink"
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
								testID="entity-detail-amount-input"
							/>
							<Text className="font-sans text-lg text-ink-muted">
								{getCurrencySymbol(entity.currency)}
							</Text>
						</View>
					</View>

					{/* Delete button */}
					<Pressable
						onPress={handleDelete}
						className="mb-8 items-center rounded-lg border border-negative/30 bg-negative/10 py-3"
						testID="entity-detail-delete-button"
					>
						<Text className="font-sans-semibold text-base text-negative">
							Delete Entity
						</Text>
					</Pressable>
				</ScrollView>
			</KeyboardAvoidingView>
		</Modal>
	);
}
