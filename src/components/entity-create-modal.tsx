import { useState, useEffect, useRef } from 'react';
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
import { normalizeNumericInput } from '@/src/utils/numeric-input';
import { useKeyboardAwareScroll } from '@/src/hooks/use-keyboard-aware-scroll';

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
	const insets = useSafeAreaInsets();
	const { handleInputFocus, keyboardAvoidingViewProps, scrollViewProps } =
		useKeyboardAwareScroll();

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

	if (!entityType) return null;

	const iconOptions = ICON_OPTIONS[entityType];

	const typeLabel = {
		income: 'Income Source',
		account: 'Account',
		category: 'Expense Category',
		saving: 'Savings Goal',
	}[entityType];

	const handleCreate = async () => {
		if (!name.trim()) return;

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

		const amount = reverseFormatCurrency(plannedAmount);
		if (!isNaN(amount) && amount > 0) {
			await setPlan({
				id: generateId(),
				entity_id: entityId,
				period: 'all-time',
				period_start: currentPeriod,
				planned_amount: amount,
			});
		}

		onClose();
	};

	const isValid = name.trim().length > 0;

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
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Pressable onPress={onClose} hitSlop={20} testID="entity-create-cancel-button">
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">New {typeLabel}</Text>
					<Pressable
						onPress={handleCreate}
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

				<ScrollView {...scrollViewProps} className="flex-1 px-5 pt-6">
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
							searchInputTestID="entity-create-icon-search-input"
							optionTestIDPrefix="entity-create-icon-option"
							emptyStateTestID="entity-create-icon-empty-state"
						/>
					</View>

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
								value={plannedAmount}
								onChangeText={(value) =>
									setPlannedAmount(normalizeNumericInput(value))
								}
								onFocus={handleInputFocus}
								placeholder="0"
								keyboardType="numeric"
								className={`flex-1 ${textInputClassNames.input}`}
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
								testID="entity-create-amount-input"
							/>
							<Text className={textInputClassNames.suffix}>
								{getCurrencySymbol(DEFAULT_CURRENCY)}
							</Text>
						</View>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</Modal>
	);
}
