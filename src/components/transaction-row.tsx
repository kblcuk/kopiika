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

interface TransactionRowProps {
	transaction: Transaction;
	entities: Entity[];
	onEdit: (transaction: Transaction) => void;
}

function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const DELETE_THRESHOLD = -80;

export function TransactionRow({ transaction, entities, onEdit }: TransactionRowProps) {
	const deleteTransaction = useStore((state) => state.deleteTransaction);

	const translateX = useSharedValue(0);
	const deleteOpacity = useSharedValue(0);

	const fromEntity = entities.find((e) => e.id === transaction.from_entity_id);
	const toEntity = entities.find((e) => e.id === transaction.to_entity_id);

	const FromIcon = getIcon(fromEntity?.icon || 'circle');
	const ToIcon = getIcon(toEntity?.icon || 'circle');

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

	return (
		<View className="relative">
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
					className="flex-row items-center border-b border-paper-300 bg-paper-50 px-5 py-3"
				>
					{/* From/To entities */}
					<View className="flex-1 flex-row items-center">
						<View className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-paper-200">
							<FromIcon size={16} />
						</View>
						<Text className="font-sans text-ink" numberOfLines={1}>
							{fromEntity?.name ?? 'Unknown'}
						</Text>
						<Text className="mx-2 font-sans text-ink">→</Text>
						<View className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-paper-200">
							<ToIcon size={16} />
						</View>
						<Text className="flex-1 font-sans text-ink" numberOfLines={1}>
							{toEntity?.name ?? 'Unknown'}
						</Text>
					</View>

					{/* Amount and time */}
					<View className="items-end">
						<Text className="font-sans-semibold text-base text-ink">
							{formatAmount(transaction.amount, transaction.currency)}{' '}
							<Text className="font-sans text-sm text-ink-muted">
								{transaction.currency}
							</Text>
						</Text>
						<Text className="font-sans text-sm text-ink-muted">
							{formatTime(transaction.timestamp)}
						</Text>
					</View>
				</Animated.View>
			</GestureDetector>

			{/* Note if present */}
			{transaction.note && (
				<View className="border-b border-paper-300 bg-paper-100 px-5 py-2">
					<Text className="font-sans text-sm italic text-ink">{transaction.note}</Text>
				</View>
			)}
		</View>
	);
}
