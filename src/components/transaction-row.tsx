import { useCallback } from 'react';
import { View, Text, Alert } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Trash2 } from 'lucide-react-native';

import type { Transaction, Entity } from '@/src/types';
import { formatAmount } from '@/src/utils/format';
import { useStore } from '@/src/store';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';

interface TransactionRowProps {
	transaction: Transaction;
	entities: Entity[];
	onEdit: (transaction: Transaction) => void;
	index: number;
}

const DELETE_THRESHOLD = -80;
const FALLBACK_ICON_COLOR = '#6B5D4A';

export function TransactionRow({ transaction, entities, onEdit, index }: TransactionRowProps) {
	const deleteTransaction = useStore((state) => state.deleteTransaction);

	const translateX = useSharedValue(0);
	const deleteOpacity = useSharedValue(0);

	const fromEntity = entities.find((e) => e.id === transaction.from_entity_id);
	const toEntity = entities.find((e) => e.id === transaction.to_entity_id);

	const FromIcon = getIcon(fromEntity?.icon || 'circle');
	const ToIcon = getIcon(toEntity?.icon || 'circle');

	const fromColors = fromEntity ? getEntityTypeColors(fromEntity.type) : null;
	const toColors = toEntity ? getEntityTypeColors(toEntity.type) : null;

	const confirmDelete = useCallback(() => {
		Alert.alert(
			'Delete Transaction',
			`Delete ${formatAmount(transaction.amount, transaction.currency)} from ${fromEntity?.name ?? 'Unknown'} to ${toEntity?.name ?? 'Unknown'}?`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => deleteTransaction(transaction.id),
				},
			]
		);
	}, [transaction, fromEntity, toEntity, deleteTransaction]);

	const panGesture = Gesture.Pan()
		.activeOffsetX([-10, 10])
		.onUpdate((event) => {
			translateX.value = Math.min(0, Math.max(event.translationX, -120));
			deleteOpacity.value = Math.min(1, Math.abs(translateX.value) / 80);
		})
		.onEnd(() => {
			if (translateX.value < DELETE_THRESHOLD) {
				scheduleOnRN(confirmDelete);
			}
			translateX.value = withSpring(0);
			deleteOpacity.value = withTiming(0);
		});

	const tapGesture = Gesture.Tap().onEnd(() => {
		scheduleOnRN(onEdit, transaction);
	});

	const composedGesture = Gesture.Race(panGesture, tapGesture);

	const rowStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	const deleteStyle = useAnimatedStyle(() => ({
		opacity: deleteOpacity.value,
	}));

	const rowBg = index % 2 === 0 ? 'bg-paper-50' : 'bg-paper-100';

	return (
		<View className="relative border-b border-paper-300">
			{/* Delete background */}
			<Animated.View
				style={deleteStyle}
				className="absolute bottom-0 right-0 top-0 w-20 items-center justify-center bg-negative"
			>
				<Trash2 size={24} color="#fff" />
			</Animated.View>

			{/* Row content */}
			<GestureDetector gesture={composedGesture}>
				<Animated.View
					style={rowStyle}
					className={`flex-row items-center ${rowBg} px-5 py-3`}
				>
					{/* Left side: entity flow + optional note */}
					<View className="flex-1">
						{/* Entity flow row */}
						<View className="flex-row items-center">
							<View
								className={`mr-2 h-8 w-8 items-center justify-center rounded-full ${fromColors?.bg ?? 'bg-paper-200'}`}
							>
								<FromIcon
									size={16}
									color={fromColors?.iconColor ?? FALLBACK_ICON_COLOR}
								/>
							</View>
							<Text className="font-sans-medium text-base text-ink" numberOfLines={1}>
								{fromEntity?.name ?? 'Unknown'}
							</Text>
							<Text className="mx-1.5 font-sans text-sm text-ink-muted">→</Text>
							<View
								className={`mr-2 h-8 w-8 items-center justify-center rounded-full ${toColors?.bg ?? 'bg-paper-200'}`}
							>
								<ToIcon
									size={16}
									color={toColors?.iconColor ?? FALLBACK_ICON_COLOR}
								/>
							</View>
							<Text
								className="flex-1 font-sans text-base text-ink-light"
								numberOfLines={1}
							>
								{toEntity?.name ?? 'Unknown'}
							</Text>
						</View>

						{/* Note */}
						{transaction.note && (
							<Text className="mt-4 font-sans text-lg" numberOfLines={5}>
								{transaction.note}
							</Text>
						)}
					</View>

					{/* Amount and currency */}
					<View className="items-end">
						<Text className="font-sans-semibold text-base text-ink">
							{formatAmount(transaction.amount, transaction.currency)}{' '}
							<Text className="font-sans text-sm text-ink-muted">
								{transaction.currency}
							</Text>
						</Text>
					</View>
				</Animated.View>
			</GestureDetector>
		</View>
	);
}
