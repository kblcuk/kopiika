import { useCallback, memo } from 'react';
import { View, Alert } from 'react-native';
import { Text } from './text';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Clock, Trash2, Repeat, CircleAlert, CircleCheck } from 'lucide-react-native';

import type { Transaction, Entity } from '@/src/types';
import { formatAmount, getCurrencySymbol } from '@/src/utils/format';
import { useStore } from '@/src/store';
import { useConfirmTransaction } from '@/src/hooks/use-confirm-transaction';
import { showSeriesScopeAlert } from './series-action-sheet';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { getEntityDisplayName } from '@/src/utils/entity-display';

interface TransactionRowProps {
	transaction: Transaction;
	entityMap: Map<string, Entity>;
	onEdit: (transaction: Transaction) => void;
	index: number;
	isUpcoming?: boolean;
	isUnconfirmed?: boolean;
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
	isUnconfirmed = false,
	editable = true,
}: TransactionRowProps) {
	const deleteTransaction = useStore((state) => state.deleteTransaction);
	const deleteTransactionWithScope = useStore((state) => state.deleteTransactionWithScope);
	const materializeOccurrence = useStore((state) => state.materializeOccurrence);
	const excludeOccurrence = useStore((state) => state.excludeOccurrence);

	const translateX = useSharedValue(0);
	const deleteOpacity = useSharedValue(0);

	const fromEntity = entityMap.get(transaction.from_entity_id);
	const toEntity = entityMap.get(transaction.to_entity_id);
	const fromLabel = getEntityDisplayName(fromEntity);
	const toLabel = getEntityDisplayName(toEntity);

	const FromIcon = getIcon(fromEntity?.icon || 'circle');
	const ToIcon = getIcon(toEntity?.icon || 'circle');

	const fromColors = fromEntity ? getEntityColors(fromEntity.type, fromEntity.color) : null;
	const toColors = toEntity ? getEntityColors(toEntity.type, toEntity.color) : null;

	const confirmDelete = useCallback(() => {
		const runDelete = async (deleter: () => Promise<unknown>) => {
			try {
				await deleter();
			} catch (error) {
				console.error('Failed to delete transaction:', error);
				Alert.alert(
					'Delete failed',
					'Could not delete this transaction. Please try again.'
				);
			}
		};
		if (transaction.series_id) {
			showSeriesScopeAlert('delete', (scope) => {
				void runDelete(async () => {
					// Single-scope delete of a virtual occurrence is just an exclusion —
					// no row exists, so skip the materialize-then-delete round-trip.
					if (transaction.isVirtual && scope === 'single') {
						return excludeOccurrence(transaction);
					}
					// Future-scope on a virtual occurrence still needs a real row for the
					// id-based scoped delete (delete row + record exclusion).
					if (transaction.isVirtual) await materializeOccurrence(transaction);
					return deleteTransactionWithScope(transaction.id, scope);
				});
			});
		} else {
			Alert.alert(
				'Delete Transaction',
				`Delete ${formatAmount(transaction.amount_minor, transaction.currency)} from ${fromLabel} to ${toLabel}?`,
				[
					{ text: 'Cancel', style: 'cancel' },
					{
						text: 'Delete',
						style: 'destructive',
						onPress: () => {
							void runDelete(() => deleteTransaction(transaction.id));
						},
					},
				]
			);
		}
	}, [
		transaction,
		fromLabel,
		toLabel,
		deleteTransaction,
		deleteTransactionWithScope,
		materializeOccurrence,
		excludeOccurrence,
	]);

	const handleEdit = useCallback(() => {
		onEdit(transaction);
	}, [onEdit, transaction]);

	const confirmTransactionFlow = useConfirmTransaction();

	const handleConfirm = useCallback(async () => {
		await confirmTransactionFlow(transaction);
	}, [confirmTransactionFlow, transaction]);

	// The Confirm pill uses its own RNGH Tap so the row's tap can defer to it
	// via requireExternalGestureToFail. Using a plain Pressable here was
	// insufficient — on iOS, RN's responder system and RNGH don't share a
	// gesture chain, so the row tap still fired and opened the "Edit Recurring
	// Transaction" alert alongside confirmation (KII-106).
	const confirmPillGesture = Gesture.Tap()
		.runOnJS(true)
		.hitSlop(8)
		.onEnd(() => {
			void handleConfirm();
		});

	const tapGesture = Gesture.Tap()
		.maxDuration(250)
		.maxDistance(10)
		.runOnJS(true)
		.requireExternalGestureToFail(confirmPillGesture)
		.onEnd(() => {
			handleEdit();
		});

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

	const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

	const rowStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	const deleteStyle = useAnimatedStyle(() => ({
		opacity: deleteOpacity.value,
	}));

	const rowBg = isUnconfirmed
		? 'bg-warning/5'
		: isUpcoming
			? 'bg-info/5'
			: index % 2 === 0
				? 'bg-paper-50'
				: 'bg-paper-100';

	// The pill is available on upcoming rows too (KII-159): a scheduled charge can
	// land before its date, and the flow guards the date rewrite with a dialog.
	const showConfirmPill = isUnconfirmed || isUpcoming;
	const confirmTone = isUnconfirmed ? colors.warning.DEFAULT : colors.info.DEFAULT;
	const confirmPillClass = isUnconfirmed ? 'bg-warning/15' : 'bg-info/15';
	const confirmTextClass = isUnconfirmed ? 'text-warning' : 'text-info';

	const rowContent = (
		<View className={`px-5 py-3 ${rowBg}`}>
			{/* From row: icon + name + amount */}
			<View className="flex-row items-center">
				<View
					className="mr-2 h-8 w-8 items-center justify-center rounded-full"
					style={{ backgroundColor: fromColors?.bgColor ?? '#EBE3D5' }}
				>
					<FromIcon size={16} color={fromColors?.iconColor ?? FALLBACK_ICON_COLOR} />
				</View>
				<Text className="flex-1 font-sans-medium text-base text-ink" numberOfLines={1}>
					{fromLabel}
				</Text>
				<View className="ml-3 items-end">
					<View className="flex-row items-center gap-1" style={{ marginBottom: 2 }}>
						{transaction.series_id && (
							<Repeat
								size={12}
								color={isUnconfirmed ? colors.warning.DEFAULT : colors.info.DEFAULT}
							/>
						)}
						{isUnconfirmed && <CircleAlert size={12} color={colors.warning.DEFAULT} />}
						{isUpcoming && <Clock size={12} color={colors.info.DEFAULT} />}
					</View>
					<Text
						className={`font-sans-semibold text-base ${isUnconfirmed ? 'text-warning' : isUpcoming ? 'text-info' : 'text-ink'}`}
					>
						{formatAmount(transaction.amount_minor, transaction.currency)}{' '}
						<Text className="font-sans text-sm text-ink-muted">
							{getCurrencySymbol(transaction.currency)}
						</Text>
					</Text>

					{/* Confirm pill: shown when due (unconfirmed) or ahead of schedule (upcoming) */}
					{showConfirmPill && (
						<GestureDetector gesture={confirmPillGesture}>
							<View
								accessibilityRole="button"
								className={`mt-1 flex-row items-center gap-1 rounded-full px-2 py-0.5 ${confirmPillClass}`}
								testID={`confirm-transaction-${transaction.id}`}
							>
								<CircleCheck size={11} color={confirmTone} />
								<Text className={`font-sans-semibold text-xs ${confirmTextClass}`}>
									Confirm
								</Text>
							</View>
						</GestureDetector>
					)}

					{/* Scheduled date for upcoming transactions */}
					{isUpcoming && (
						<Text className="mt-1 pl-10 font-sans text-xs text-info">
							{new Date(transaction.timestamp).toLocaleDateString(undefined, {
								weekday: 'short',
								month: 'short',
								day: 'numeric',
							})}
						</Text>
					)}
				</View>
			</View>

			{/* Vertical connector line, centered under From icon */}
			<View className="ml-4 h-2 w-0.5 bg-paper-300" />

			{/* To row: icon + name */}
			<View className="flex-row items-center">
				<View
					className="mr-2 h-8 w-8 items-center justify-center rounded-full"
					style={{ backgroundColor: toColors?.bgColor ?? '#EBE3D5' }}
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
				<GestureDetector gesture={composedGesture}>
					<Animated.View
						style={rowStyle}
						testID={`transaction-row-${transaction.id}`}
						className="bg-paper-50"
					>
						{rowContent}
					</Animated.View>
				</GestureDetector>
			) : (
				<View className="bg-paper-50" testID={`transaction-row-${transaction.id}`}>
					{rowContent}
				</View>
			)}
		</View>
	);
});
