import { useCallback, memo } from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Clock, Trash2, Repeat } from 'lucide-react-native';

import type { Transaction, Entity } from '@/src/types';
import { formatAmount, getCurrencySymbol } from '@/src/utils/format';
import { useStore } from '@/src/store';
import { showSeriesScopeAlert } from './series-action-sheet';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { getEntityDisplayName } from '@/src/utils/entity-display';

interface TransactionRowProps {
	transaction: Transaction;
	entityMap: Map<string, Entity>;
	onEdit: (transaction: Transaction) => void;
	index: number;
	isUpcoming?: boolean;
	editable?: boolean;
}

const DELETE_THRESHOLD = -80;
const FALLBACK_ICON_COLOR = colors.ink.muted;

export const TransactionRow = memo(function TransactionRow({
	transaction,
	entityMap,
	onEdit,
	index,
	isUpcoming = false,
	editable = true,
}: TransactionRowProps) {
	const deleteTransaction = useStore((state) => state.deleteTransaction);
	const deleteTransactionWithScope = useStore((state) => state.deleteTransactionWithScope);

	const translateX = useSharedValue(0);
	const deleteOpacity = useSharedValue(0);

	const fromEntity = entityMap.get(transaction.from_entity_id);
	const toEntity = entityMap.get(transaction.to_entity_id);
	const fromLabel = getEntityDisplayName(fromEntity);
	const toLabel = getEntityDisplayName(toEntity);

	const FromIcon = getIcon(fromEntity?.icon || 'circle');
	const ToIcon = getIcon(toEntity?.icon || 'circle');

	const fromColors = fromEntity ? getEntityTypeColors(fromEntity.type) : null;
	const toColors = toEntity ? getEntityTypeColors(toEntity.type) : null;

	const confirmDelete = useCallback(() => {
		if (transaction.series_id) {
			showSeriesScopeAlert('delete', (scope) => {
				deleteTransactionWithScope(transaction.id, scope);
			});
		} else {
			Alert.alert(
				'Delete Transaction',
				`Delete ${formatAmount(transaction.amount, transaction.currency)} from ${fromLabel} to ${toLabel}?`,
				[
					{ text: 'Cancel', style: 'cancel' },
					{
						text: 'Delete',
						style: 'destructive',
						onPress: () => deleteTransaction(transaction.id),
					},
				]
			);
		}
	}, [transaction, fromLabel, toLabel, deleteTransaction, deleteTransactionWithScope]);

	const handlePress = useCallback(() => {
		onEdit(transaction);
	}, [onEdit, transaction]);

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

	const rowStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	const deleteStyle = useAnimatedStyle(() => ({
		opacity: deleteOpacity.value,
	}));

	const rowBg = isUpcoming ? 'bg-info/5' : index % 2 === 0 ? 'bg-paper-50' : 'bg-paper-100';

	const rowContent = (
		<View>
			{/* From row: icon + name + amount */}
			<View className="flex-row items-center">
				<View
					className={`mr-2 h-8 w-8 items-center justify-center rounded-full ${fromColors?.bg ?? 'bg-paper-200'}`}
				>
					<FromIcon size={16} color={fromColors?.iconColor ?? FALLBACK_ICON_COLOR} />
				</View>
				<Text className="flex-1 font-sans-medium text-base text-ink" numberOfLines={1}>
					{fromLabel}
				</Text>
				<View className="ml-3 items-end">
					<View className="flex-row items-center gap-1" style={{ marginBottom: 2 }}>
						{transaction.series_id && <Repeat size={12} color={colors.info.DEFAULT} />}
						{isUpcoming && <Clock size={12} color={colors.info.DEFAULT} />}
					</View>
					<Text
						className={`font-sans-semibold text-base ${isUpcoming ? 'text-info' : 'text-ink'}`}
					>
						{formatAmount(transaction.amount, transaction.currency)}{' '}
						<Text className="font-sans text-sm text-ink-muted">
							{getCurrencySymbol(transaction.currency)}
						</Text>
					</Text>
				</View>
			</View>

			{/* Vertical connector line, centered under From icon */}
			<View className="ml-4 h-2 w-0.5 bg-paper-300" />

			{/* To row: icon + name */}
			<View className="flex-row items-center">
				<View
					className={`mr-2 h-8 w-8 items-center justify-center rounded-full ${toColors?.bg ?? 'bg-paper-200'}`}
				>
					<ToIcon size={16} color={toColors?.iconColor ?? FALLBACK_ICON_COLOR} />
				</View>
				<Text className="flex-1 font-sans text-base text-ink-light" numberOfLines={1}>
					{toLabel}
				</Text>
			</View>

			{/* Note on its own row */}
			{transaction.note && (
				<Text className="mt-1 pl-10 font-sans text-sm text-ink-muted" numberOfLines={3}>
					{transaction.note}
				</Text>
			)}
		</View>
	);

	return (
		<View className="relative border-b border-paper-300">
			{editable && (
				<Animated.View
					style={deleteStyle}
					className="absolute bottom-0 right-0 top-0 w-20 items-center justify-center bg-negative"
				>
					<Trash2 size={24} color={colors.on.color} />
				</Animated.View>
			)}

			{editable ? (
				<GestureDetector gesture={panGesture}>
					<Animated.View style={rowStyle}>
						<Pressable
							onPress={handlePress}
							className={`px-5 py-3 ${rowBg}`}
							testID={`transaction-row-${transaction.id}`}
						>
							{rowContent}
						</Pressable>
					</Animated.View>
				</GestureDetector>
			) : (
				<View className={`px-5 py-3 ${rowBg}`} testID={`transaction-row-${transaction.id}`}>
					{rowContent}
				</View>
			)}
		</View>
	);
});
