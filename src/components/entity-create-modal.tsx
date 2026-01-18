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
import { useShallow } from 'zustand/react/shallow';

import type { EntityType } from '@/src/types';
import { useStore } from '@/src/store';
import { generateId } from '@/src/utils/ids';
import { ICON_OPTIONS, DEFAULT_ICONS } from '@/src/constants/icons';
import { getIcon } from '@/src/constants/icon-registry';
import { styles } from '../styles/text-input';

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

	const { entities, addEntity, setPlan, currentPeriod } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			addEntity: state.addEntity,
			setPlan: state.setPlan,
			currentPeriod: state.currentPeriod,
		}))
	);

	// Reset when modal opens
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

		// Determine max rows for this entity type
		const maxRows = entityType === 'category' ? 3 : 1;

		// Find the row with fewest items to auto-balance
		const sameTypeEntities = entities.filter((e) => e.type === entityType);
		const rowCounts = new Map<number, number>();
		for (let i = 0; i < maxRows; i++) {
			rowCounts.set(i, 0);
		}
		sameTypeEntities.forEach((e) => {
			rowCounts.set(e.row, (rowCounts.get(e.row) || 0) + 1);
		});

		// Pick the row with the fewest items
		let targetRow = 0;
		let minCount = rowCounts.get(0) || 0;
		for (let i = 1; i < maxRows; i++) {
			const count = rowCounts.get(i) || 0;
			if (count < minCount) {
				minCount = count;
				targetRow = i;
			}
		}

		// Get next position in the target row
		const sameTypeInRow = entities.filter((e) => e.type === entityType && e.row === targetRow);
		const nextPosition =
			sameTypeInRow.length > 0 ? Math.max(...sameTypeInRow.map((e) => e.position)) + 1 : 0;

		const entityId = generateId();

		// Create entity
		await addEntity({
			id: entityId,
			type: entityType,
			name: name.trim(),
			currency: 'UAH',
			icon: selectedIcon,
			order: nextPosition,
			row: targetRow,
			position: nextPosition,
		});

		// Create plan if amount specified
		const amount = parseFloat(plannedAmount);
		if (!isNaN(amount) && amount > 0) {
			await setPlan({
				id: generateId(),
				entity_id: entityId,
				// Savings use 'all-time' period for goals, others use 'month'
				period: entityType === 'saving' ? 'all-time' : 'month',
				// period_start is always a date (YYYY-MM) representing when the plan started
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
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				className="flex-1 bg-paper-50"
			>
				{/* Header */}
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

				{/* Content */}
				<ScrollView className="flex-1 px-5 pt-6" keyboardShouldPersistTaps="handled">
					{/* Name input */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Name
						</Text>
						<TextInput
							ref={nameInputRef}
							value={name}
							onChangeText={setName}
							placeholder={`Enter ${typeLabel.toLowerCase()} name`}
							className="border-paper-400 rounded-lg border bg-paper-100 px-4 py-3 font-sans text-base  text-ink"
							style={styles.input}
							placeholderTextColor="#9C8B74"
							autoCapitalize="words"
							testID="entity-create-name-input"
						/>
					</View>

					{/* Icon picker */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Icon
						</Text>
						<View className="flex-row flex-wrap gap-2">
							{iconOptions.map((icon) => {
								const IconComponent = getIcon(icon);
								const isSelected = selectedIcon === icon;

								return (
									<Pressable
										key={icon}
										onPress={() => setSelectedIcon(icon)}
										className={`h-12 w-12 items-center justify-center rounded-full ${
											isSelected ? 'bg-accent' : 'bg-paper-200'
										}`}
									>
										<IconComponent
											size={24}
											color={isSelected ? '#FFFBF5' : '#6B5D4A'}
										/>
									</Pressable>
								);
							})}
						</View>
					</View>

					{/* Planned amount */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Planned Amount (optional)
						</Text>
						<View className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100 px-4 py-3">
							<TextInput
								value={plannedAmount}
								onChangeText={setPlannedAmount}
								placeholder="0"
								keyboardType="numeric"
								className="flex-1 font-sans-semibold text-2xl  text-ink"
								style={styles.input}
								placeholderTextColor="#9C8B74"
								testID="entity-create-amount-input"
							/>
							<Text className="font-sans text-lg text-ink-muted">UAH</Text>
						</View>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</Modal>
	);
}
