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
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import * as Icons from 'lucide-react-native';

import type { EntityWithBalance } from '@/src/types';
import { getCurrentPeriod } from '@/src/types';
import { formatAmount } from '@/src/utils/format';
import { useStore, generateId } from '@/src/store';

interface EntityDetailModalProps {
	visible: boolean;
	entity: EntityWithBalance | null;
	onClose: () => void;
}

// Convert kebab-case to PascalCase for lucide icon lookup
function toIconName(name: string): string {
	return name
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

export function EntityDetailModal({ visible, entity, onClose }: EntityDetailModalProps) {
	const [plannedAmount, setPlannedAmount] = useState('');
	const inputRef = useRef<TextInput>(null);

	const { plans, currentPeriod, setPlan, deleteEntity } = useStore(
		useShallow((state) => ({
			plans: state.plans,
			currentPeriod: state.currentPeriod,
			setPlan: state.setPlan,
			deleteEntity: state.deleteEntity,
		}))
	);

	// Find existing plan for this entity
	const existingPlan = entity
		? plans.find((p) => p.entity_id === entity.id && p.period_start === currentPeriod)
		: null;

	// Reset when modal opens
	useEffect(() => {
		if (visible && entity) {
			setPlannedAmount(existingPlan?.planned_amount?.toString() ?? '');
		}
	}, [visible, entity, existingPlan?.planned_amount]);

	if (!entity) return null;

	// Get the icon component dynamically
	const iconName = entity.icon ? toIconName(entity.icon) : 'Circle';
	const IconComponent =
		(Icons as unknown as Record<string, typeof Icons.Circle>)[iconName] || Icons.Circle;

	const handleSavePlan = async () => {
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
					<Pressable onPress={handleSavePlan} hitSlop={20}>
						<Text className="font-sans-semibold text-base text-accent">Save</Text>
					</Pressable>
				</View>

				{/* Content */}
				<View className="flex-1 px-5 pt-6">
					{/* Entity header */}
					<View className="mb-8 items-center">
						<View className="mb-3 h-20 w-20 items-center justify-center rounded-full bg-paper-300">
							<IconComponent size={36} color="#6B5D4A" />
						</View>
						<Text className="font-sans-semibold text-xl text-ink">{entity.name}</Text>
						<Text className="font-sans text-sm text-ink-muted">{typeLabel}</Text>
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
						<View className="border-paper-400 flex-row items-center rounded-lg border bg-paper-100 px-4 py-3">
							<TextInput
								ref={inputRef}
								value={plannedAmount}
								onChangeText={setPlannedAmount}
								placeholder="0"
								keyboardType="numeric"
								className="flex-1 font-sans-semibold text-2xl text-ink"
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
						className="mb-8 mt-auto items-center rounded-lg border border-negative/30 bg-negative/10 py-3"
					>
						<Text className="font-sans-semibold text-base text-negative">
							Delete Entity
						</Text>
					</Pressable>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}
