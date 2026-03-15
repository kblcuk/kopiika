import { useState, useEffect, useRef, useMemo } from 'react';
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
import { useStore, useEntitiesWithBalance } from '@/src/store';

import { ICON_OPTIONS, DEFAULT_ICONS } from '@/src/constants/icons';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';
import {
	sharedNumericTextInputProps,
	sharedTextInputProps,
	styles,
	textInputClassNames,
} from '../styles/text-input';
import { colors } from '@/src/theme/colors';
import { generateId } from '@/src/utils/ids';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { EntityIconPicker } from '@/src/components/entity-icon-picker';
import { ReservationModal } from '@/src/components/reservation-modal';
import { normalizeNumericInput } from '@/src/utils/numeric-input';
import { useKeyboardAwareScroll } from '@/src/hooks/use-keyboard-aware-scroll';

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
	// Reservation modal state (for saving entities)
	const [reservationAccount, setReservationAccount] = useState<EntityWithBalance | null>(null);
	const inputRef = useRef<TextInput>(null);
	const insets = useSafeAreaInsets();
	const { handleInputFocus, keyboardAvoidingViewProps, scrollViewProps } =
		useKeyboardAwareScroll();

	const {
		plans,
		currentPeriod,
		reservations,
		setPlan,
		deletePlan,
		deleteEntity,
		updateEntity,
		addTransaction,
	} = useStore(
		useShallow((state) => ({
			plans: state.plans,
			currentPeriod: state.currentPeriod,
			reservations: state.reservations,
			setPlan: state.setPlan,
			deletePlan: state.deletePlan,
			deleteEntity: state.deleteEntity,
			updateEntity: state.updateEntity,
			addTransaction: state.addTransaction,
		}))
	);

	const accounts = useEntitiesWithBalance('account');

	// For saving entities: find all reservations pointing to this saving, resolved to account entities
	const savingReservations = useMemo(() => {
		if (!entity || entity.type !== 'saving') return [];

		return reservations
			.filter((r) => r.saving_entity_id === entity.id)
			.map((r) => {
				const account = accounts.find((a) => a.id === r.account_entity_id);
				return account ? { reservation: r, account } : null;
			})
			.filter(Boolean) as {
			reservation: { id: string; amount: number };
			account: EntityWithBalance;
		}[];
	}, [entity, reservations, accounts]);

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
				existingPlan?.planned_amount != null && existingPlan.planned_amount > 0
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

		if (entity.type !== 'account') {
			const amount = reverseFormatCurrency(plannedAmount);
			if (!Number.isNaN(amount) && amount > 0) {
				await setPlan({
					id: existingPlan?.id ?? generateId(),
					entity_id: entity.id,
					// All plans use 'all-time' period - static budget/goal
					period: 'all-time',
					// If updating existing plan, preserve original period_start; otherwise use current period
					period_start: existingPlan?.period_start ?? currentPeriod,
					planned_amount: amount,
				});
			} else if (existingPlan) {
				await deletePlan(existingPlan.id);
			}
		}

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
		const deleteConsequences = {
			income: 'Past transactions will stay in History and this income source will be shown as removed.',
			account:
				'Past transactions will stay in History and any funds reserved from this account will be removed from linked savings goals.',
			category:
				'Past transactions will stay in History and this category will be shown as removed.',
			saving: 'Past transactions will stay in History and any reserved money for this goal will be released back to its linked accounts.',
		} satisfies Record<typeof entity.type, string>;

		Alert.alert(
			'Delete Entity',
			`Are you sure you want to delete "${entity.name}"? ${deleteConsequences[entity.type]}`,
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
	const shouldShowRemaining = entity.type !== 'account' && entity.planned > 0;

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<KeyboardAvoidingView
				{...keyboardAvoidingViewProps}
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
				<ScrollView {...scrollViewProps} className="flex-1 px-5 pt-6">
					{/* Entity icon with edit indicator */}
					<View className="mb-6 items-center">
						<Pressable
							onPress={() => setShowIconPicker(!showIconPicker)}
							className="mb-3"
							testID="entity-detail-icon-picker-toggle"
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
							<EntityIconPicker
								key={`${entity.id}-${showIconPicker ? 'open' : 'closed'}`}
								icons={ICON_OPTIONS[entity.type]}
								selectedIcon={selectedIcon}
								onSelect={(icon) => {
									setSelectedIcon(icon);
									setShowIconPicker(false);
								}}
								searchInputTestID="entity-detail-icon-search-input"
								optionTestIDPrefix="entity-detail-icon-option"
								emptyStateTestID="entity-detail-icon-empty-state"
							/>
						</View>
					)}

					{/* Name input */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Name
						</Text>
						<View
							className={[
								textInputClassNames.container,
								nameError && 'border-negative',
							]
								.filter(Boolean)
								.join(' ')}
						>
							<TextInput
								{...sharedTextInputProps}
								value={name}
								onChangeText={handleNameChange}
								placeholder="Enter entity name"
								className={textInputClassNames.input}
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
								maxLength={MAX_NAME_LENGTH}
								testID="entity-detail-name-input"
							/>
						</View>
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
							<View className={textInputClassNames.inlineContainer}>
								<TextInput
									{...sharedNumericTextInputProps}
									value={actualAmount}
									onChangeText={(text) => {
										setActualAmount(normalizeNumericInput(text));
										setIsEditingActual(true);
									}}
									onFocus={handleInputFocus}
									placeholder="0"
									keyboardType="numeric"
									className={textInputClassNames.primaryAmountInput}
									style={styles.input}
									placeholderTextColor={colors.ink.placeholder}
									testID="entity-detail-actual-input"
								/>
								<Text className={textInputClassNames.suffixLarge}>
									{getCurrencySymbol(entity.currency)}
								</Text>
							</View>
							<Text className="mt-1 font-sans text-xs text-ink-muted">
								Correct your account balance. An adjustment transaction will be
								created.
							</Text>

							{/* Available = current minus reservations */}
							<View className="mt-4 items-center rounded-lg bg-paper-100 px-4 py-3">
								<Text className="font-sans text-xs text-ink-muted">Available</Text>
								<Text
									className={`font-sans-semibold text-lg ${entity.actual - (entity.reserved ?? 0) < 0 ? 'text-negative' : 'text-ink'}`}
								>
									{formatAmount(entity.actual - (entity.reserved ?? 0))}
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
							{shouldShowRemaining && (
								<View className="items-center">
									<Text className="font-sans text-xs text-ink-muted">
										Remaining
									</Text>
									<Text
										className={`font-sans-semibold text-lg ${entity.remaining < 0 ? 'text-negative' : 'text-ink'}`}
									>
										{formatAmount(entity.remaining)}
									</Text>
								</View>
							)}
						</View>
					)}

					{/* Planned amount input — not applicable for accounts */}
					{entity.type !== 'account' && (
						<View className="mb-6">
							<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
								Planned Amount ({getCurrentPeriod()})
							</Text>
							<View className={textInputClassNames.inlineContainer}>
								<TextInput
									{...sharedNumericTextInputProps}
									ref={inputRef}
									value={plannedAmount}
									onChangeText={(value) =>
										setPlannedAmount(normalizeNumericInput(value))
									}
									onFocus={handleInputFocus}
									placeholder="0"
									keyboardType="numeric"
									className={textInputClassNames.primaryAmountInput}
									style={styles.input}
									placeholderTextColor={colors.ink.placeholder}
									testID="entity-detail-amount-input"
								/>
								<Text className={textInputClassNames.suffixLarge}>
									{getCurrencySymbol(entity.currency)}
								</Text>
							</View>
						</View>
					)}

					{/* Reservations section — saving entities only */}
					{entity.type === 'saving' && (
						<View className="mb-6" testID="saving-reservations-section">
							<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
								Reserved from
							</Text>
							{savingReservations.length > 0 ? (
								<View className="rounded-lg bg-paper-100">
									{savingReservations.map(({ reservation, account }, index) => {
										const AccountIcon = getIcon(account.icon || 'circle');
										const accountColors = getEntityTypeColors('account');
										return (
											<Pressable
												key={reservation.id}
												onPress={() => setReservationAccount(account)}
												className={`flex-row items-center px-4 py-3 ${
													index > 0 ? 'border-t border-paper-300' : ''
												}`}
												testID={`saving-reservation-row-${account.id}`}
											>
												<View
													className={`mr-3 h-8 w-8 items-center justify-center rounded-full ${accountColors.bg}`}
												>
													<AccountIcon
														size={16}
														color={accountColors.iconColor}
													/>
												</View>
												<Text className="flex-1 font-sans text-base text-ink">
													{account.name}
												</Text>
												<Text
													className="font-sans-semibold text-base text-ink"
													style={{ fontVariant: ['tabular-nums'] }}
												>
													{formatAmount(
														reservation.amount,
														entity.currency
													)}
												</Text>
											</Pressable>
										);
									})}
								</View>
							) : (
								<Text className="text-ink-faint font-sans text-sm">
									Drag an account onto this saving to reserve funds
								</Text>
							)}
						</View>
					)}

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

			{/* Reservation edit modal — opens from saving detail when tapping a reservation row */}
			{entity.type === 'saving' && (
				<ReservationModal
					visible={reservationAccount !== null}
					account={reservationAccount}
					saving={entity}
					onClose={() => setReservationAccount(null)}
				/>
			)}
		</Modal>
	);
}
