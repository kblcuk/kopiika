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
import * as Icons from 'lucide-react-native';

import type { EntityType } from '@/src/types';
import { useStore, generateId } from '@/src/store';
import { ICON_OPTIONS, DEFAULT_ICONS, toIconName } from '@/src/constants/icons';
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

		// Get next order number
		const sameTypeEntities = entities.filter((e) => e.type === entityType);
		const nextOrder =
			sameTypeEntities.length > 0 ? Math.max(...sameTypeEntities.map((e) => e.order)) + 1 : 0;

		const entityId = generateId();

		// Create entity
		await addEntity({
			id: entityId,
			type: entityType,
			name: name.trim(),
			currency: 'UAH',
			icon: selectedIcon,
			order: nextOrder,
		});

		// Create plan if amount specified
		const amount = parseFloat(plannedAmount);
		if (!isNaN(amount) && amount > 0) {
			await setPlan({
				id: generateId(),
				entity_id: entityId,
				period: 'month',
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
					<Pressable onPress={onClose} hitSlop={20}>
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">New {typeLabel}</Text>
					<Pressable onPress={handleCreate} disabled={!isValid} hitSlop={20}>
						<Text
							className={`font-sans-semibold text-base ${isValid ? 'text-accent' : 'text-ink-faint'}`}
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
							className="rounded-lg border border-paper-400 bg-paper-100 px-4 py-3 font-sans text-base  text-ink"
							style={styles.input}
							placeholderTextColor="#9C8B74"
							autoCapitalize="words"
						/>
					</View>

					{/* Icon picker */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Icon
						</Text>
						<View className="flex-row flex-wrap gap-2">
							{iconOptions.map((icon) => {
								const iconPascal = toIconName(icon);
								const IconComponent =
									(Icons as unknown as Record<string, typeof Icons.Circle>)[
										iconPascal
									] || Icons.Circle;
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
						<View className="flex-row items-center rounded-lg border border-paper-400 bg-paper-100 px-4 py-3">
							<TextInput
								value={plannedAmount}
								onChangeText={setPlannedAmount}
								placeholder="0"
								keyboardType="numeric"
								className="flex-1 font-sans-semibold text-2xl  text-ink"
								style={styles.input}
								placeholderTextColor="#9C8B74"
							/>
							<Text className="font-sans text-lg text-ink-muted">UAH</Text>
						</View>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</Modal>
	);
}
