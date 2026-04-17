import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, Modal, Platform } from 'react-native';
import {
	KeyboardAwareScrollView,
	KeyboardController,
	KeyboardExtender,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import type { EntityType } from '@/src/types';
import { useStore } from '@/src/store';
import { generateId } from '@/src/utils/ids';
import { reverseFormatCurrency, DEFAULT_CURRENCY, getCurrencySymbol } from '@/src/utils/format';
import { ICON_OPTIONS, DEFAULT_ICONS } from '@/src/constants/icons';
import { EntityIconPicker } from '@/src/components/entity-icon-picker';
import {
	sharedNumericTextInputProps,
	sharedTextInputProps,
	styles,
	textInputClassNames,
} from '../styles/text-input';
import { colors } from '@/src/theme/colors';
import { isEntityActive } from '@/src/utils/entity-display';
import { useExpressionInput } from '@/src/hooks/use-expression-input';
import { OperatorToolbar } from './operator-toolbar';

interface EntityCreateModalProps {
	visible: boolean;
	entityType: EntityType | null;
	onClose: () => void;
}

export function EntityCreateModal({ visible, entityType, onClose }: EntityCreateModalProps) {
	const [name, setName] = useState('');
	const [selectedIcon, setSelectedIcon] = useState('');
	const [plannedAmount, setPlannedAmount] = useState('');
	const nameInputRef = useRef<TextInput>(null);
	const createPressInFlightRef = useRef(false);
	const insets = useSafeAreaInsets();
	const plannedExpr = useExpressionInput(plannedAmount, setPlannedAmount);

	const { entities, addEntity, setPlan, currentPeriod } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			addEntity: state.addEntity,
			setPlan: state.setPlan,
			currentPeriod: state.currentPeriod,
		}))
	);

	useEffect(() => {
		if (visible && entityType) {
			setName('');
			setSelectedIcon(DEFAULT_ICONS[entityType]);
			setPlannedAmount('');
			setTimeout(() => nameInputRef.current?.focus(), 100);
		}
	}, [visible, entityType]);

	const handleCreate = useCallback(async () => {
		if (!entityType || !name.trim()) return;

		const maxRows = entityType === 'category' ? 3 : 1;
		const sameTypeEntities = entities.filter((e) => e.type === entityType && isEntityActive(e));
		const rowCounts = new Map<number, number>();

		for (let i = 0; i < maxRows; i++) {
			rowCounts.set(i, 0);
		}

		sameTypeEntities.forEach((e) => {
			rowCounts.set(e.row, (rowCounts.get(e.row) || 0) + 1);
		});

		let targetRow = 0;
		let minCount = rowCounts.get(0) || 0;

		for (let i = 1; i < maxRows; i++) {
			const count = rowCounts.get(i) || 0;
			if (count < minCount) {
				minCount = count;
				targetRow = i;
			}
		}

		const sameTypeInRow = entities.filter(
			(e) => e.type === entityType && e.row === targetRow && isEntityActive(e)
		);
		const nextPosition =
			sameTypeInRow.length > 0 ? Math.max(...sameTypeInRow.map((e) => e.position)) + 1 : 0;

		const entityId = generateId();

		await addEntity({
			id: entityId,
			type: entityType,
			name: name.trim(),
			currency: DEFAULT_CURRENCY,
			icon: selectedIcon,
			order: nextPosition,
			row: targetRow,
			position: nextPosition,
		});

		if (entityType !== 'account') {
			const amount = reverseFormatCurrency(plannedExpr.resolve());
			if (!isNaN(amount) && amount > 0) {
				await setPlan({
					id: generateId(),
					entity_id: entityId,
					period: 'all-time',
					period_start: currentPeriod,
					planned_amount: amount,
				});
			}
		}

		KeyboardController.dismiss();
		onClose();
	}, [
		entityType,
		name,
		selectedIcon,
		plannedExpr,
		entities,
		addEntity,
		setPlan,
		currentPeriod,
		onClose,
	]);

	const handleCreatePress = useCallback(async () => {
		// Physical iOS devices can swallow the first header onPress while dismissing
		// the keyboard from a focused TextInput, so trigger on press-in too and
		// dedupe the same tap across press-in/press.
		if (createPressInFlightRef.current) {
			return;
		}

		createPressInFlightRef.current = true;

		try {
			await handleCreate();
		} finally {
			setTimeout(() => {
				createPressInFlightRef.current = false;
			}, 0);
		}
	}, [handleCreate]);

	const handleCancel = useCallback(() => {
		KeyboardController.dismiss();
		onClose();
	}, [onClose]);

	if (!entityType) return null;

	const iconOptions = ICON_OPTIONS[entityType];

	const typeLabel = {
		income: 'Income Source',
		account: 'Account',
		category: 'Expense Category',
		saving: 'Savings Goal',
	}[entityType];

	const isValid = name.trim().length > 0;

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
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Pressable
						onPress={handleCancel}
						hitSlop={20}
						testID="entity-create-cancel-button"
					>
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">New {typeLabel}</Text>
					<Pressable
						onPressIn={handleCreatePress}
						onPress={handleCreatePress}
						disabled={!isValid}
						hitSlop={20}
						testID="entity-create-save-button"
					>
						<Text
							className={`font-sans-semibold text-base ${isValid ? 'text-accent' : 'text-ink-muted'}`}
						>
							Create
						</Text>
					</Pressable>
				</View>

				<KeyboardAwareScrollView
					bottomOffset={50}
					keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
					keyboardShouldPersistTaps="handled"
					className="flex-1 px-5 pt-6"
				>
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Name
						</Text>
						<View
							className={textInputClassNames.container}
							testID="entity-create-name-input-container"
						>
							<TextInput
								{...sharedTextInputProps}
								ref={nameInputRef}
								value={name}
								onChangeText={setName}
								placeholder={`Enter ${typeLabel.toLowerCase()} name`}
								className={textInputClassNames.input}
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
								testID="entity-create-name-input"
							/>
						</View>
					</View>

					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Icon
						</Text>
						<EntityIconPicker
							key={`${entityType}-${visible ? 'open' : 'closed'}`}
							icons={iconOptions}
							selectedIcon={selectedIcon}
							onSelect={setSelectedIcon}
							optionTestIDPrefix="entity-create-icon-option"
						/>
					</View>

					{entityType !== 'account' && (
						<View className="mb-6">
							<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
								Planned Amount (optional)
							</Text>
							<View
								className={textInputClassNames.inlineContainer}
								testID="entity-create-amount-input-container"
							>
								<TextInput
									{...sharedNumericTextInputProps}
									{...plannedExpr.inputProps}
									placeholder="0"
									className={`flex-1 ${textInputClassNames.input}`}
									style={styles.input}
									placeholderTextColor={colors.ink.placeholder}
									testID="entity-create-amount-input"
								/>
								<Text className={textInputClassNames.suffix}>
									{getCurrencySymbol(DEFAULT_CURRENCY)}
								</Text>
							</View>
							{plannedExpr.preview && (
								<Text className="mt-1 font-sans text-sm text-ink-muted">
									{plannedExpr.preview}
								</Text>
							)}
						</View>
					)}
				</KeyboardAwareScrollView>
			</View>

			{entityType !== 'account' && (
				<KeyboardExtender enabled={plannedExpr.focused}>
					<OperatorToolbar
						onOperator={plannedExpr.insertOperator}
						onEquals={plannedExpr.resolve}
					/>
				</KeyboardExtender>
			)}
		</Modal>
	);
}
