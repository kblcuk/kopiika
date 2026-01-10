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
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import * as Icons from 'lucide-react-native';

import type { EntityWithBalance } from '@/src/types';
import { getCurrentPeriod } from '@/src/types';
import { formatAmount } from '@/src/utils/format';
import { useStore, generateId } from '@/src/store';
import { ICON_OPTIONS, DEFAULT_ICONS, toIconName } from '@/src/constants/icons';
import { styles } from '../styles/text-input';

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
	const inputRef = useRef<TextInput>(null);

	const { plans, currentPeriod, setPlan, deleteEntity, updateEntity } = useStore(
		useShallow((state) => ({
			plans: state.plans,
			currentPeriod: state.currentPeriod,
			setPlan: state.setPlan,
			deleteEntity: state.deleteEntity,
			updateEntity: state.updateEntity,
		}))
	);

	// Find existing plan for this entity
	const existingPlan = entity
		? plans.find((p) => p.entity_id === entity.id && p.period_start === currentPeriod)
		: null;

	// Reset when modal opens
	useEffect(() => {
		if (visible && entity) {
			setName(entity.name);
			setSelectedIcon(entity.icon || DEFAULT_ICONS[entity.type]);
			setPlannedAmount(existingPlan?.planned_amount?.toString() ?? '');
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

	// Get the icon component dynamically using selectedIcon state for live preview
	const iconName = selectedIcon ? toIconName(selectedIcon) : 'Circle';
	const IconComponent =
		(Icons as unknown as Record<string, typeof Icons.Circle>)[iconName] || Icons.Circle;

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
		});

		// Update plan
		const amount = parseFloat(plannedAmount) || 0;
		await setPlan({
			id: existingPlan?.id ?? generateId(),
			entity_id: entity.id,
			period: 'month',
			period_start: currentPeriod,
			planned_amount: amount,
		});

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
						await deleteEntity(entity.id);
						onClose();
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
			>
				{/* Header */}
				<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
					<Pressable onPress={onClose} hitSlop={20}>
						<Text className="font-sans text-base text-ink-muted">Cancel</Text>
					</Pressable>
					<Text className="font-sans-semibold text-base text-ink">Edit Entity</Text>
					<Pressable onPress={handleSave} disabled={!canSave} hitSlop={20}>
						<Text
							className={`font-sans-semibold text-base ${canSave ? 'text-accent' : 'text-ink-faint'}`}
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
								<IconComponent size={36} color="#6B5D4A" />
								{/* Pencil edit indicator */}
								<View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full bg-paper-50/90">
									<Icons.Pencil size={14} color="#6B5D4A" />
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
									const iconPascal = toIconName(icon);
									const IconOption =
										(Icons as unknown as Record<string, typeof Icons.Circle>)[
											iconPascal
										] || Icons.Circle;
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
												color={isSelected ? '#FFFBF5' : '#6B5D4A'}
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
							className={`rounded-lg border border-paper-400 bg-paper-100 px-4 py-3 font-sans text-base text-ink ${
								nameError ? 'border-negative' : ''
							}`}
							style={styles.input}
							placeholderTextColor="#9C8B74"
							autoCapitalize="words"
						/>
						{nameError && (
							<Text className="mt-1 font-sans text-xs text-negative">
								{nameError}
							</Text>
						)}
					</View>

					{/* Current status */}
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

					{/* Planned amount input */}
					<View className="mb-6">
						<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
							Planned Amount ({getCurrentPeriod()})
						</Text>
						<View className="flex-row items-center rounded-lg border border-paper-400 bg-paper-100 px-4 py-3">
							<TextInput
								ref={inputRef}
								value={plannedAmount}
								onChangeText={setPlannedAmount}
								placeholder="0"
								keyboardType="numeric"
								className="flex-1 font-sans-semibold text-2xl  text-ink"
								style={styles.input}
								placeholderTextColor="#9C8B74"
							/>
							<Text className="font-sans text-lg text-ink-muted">
								{entity.currency}
							</Text>
						</View>
					</View>

					{/* Delete button */}
					<Pressable
						onPress={handleDelete}
						className="mb-8 items-center rounded-lg border border-negative/30 bg-negative/10 py-3"
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
