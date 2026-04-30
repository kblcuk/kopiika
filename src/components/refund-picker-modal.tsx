import { useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	Pressable,
	Modal,
	ScrollView,
	Platform,
	ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import type { Transaction, EntityWithBalance } from '@/src/types';
import { getTransactionsBetweenEntities } from '@/src/db/transactions';
import { formatAmount, getCurrencySymbol } from '@/src/utils/format';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { useStore } from '@/src/store';
import { getEntityDisplayName } from '@/src/utils/entity-display';

interface RefundPickerModalProps {
	visible: boolean;
	/** The entity that was the "from" in the original transaction (e.g. account for purchases, income for salary) */
	originalFrom: EntityWithBalance | null;
	/** The entity that was the "to" in the original transaction (e.g. category for purchases, account for salary) */
	originalTo: EntityWithBalance | null;
	onSelect: (transaction: Transaction) => void;
	onClose: () => void;
}

export function RefundPickerModal({
	visible,
	originalFrom,
	originalTo,
	onSelect,
	onClose,
}: RefundPickerModalProps) {
	const insets = useSafeAreaInsets();
	const entities = useStore((state) => state.entities);
	const [pastTransactions, setPastTransactions] = useState<Transaction[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		let cancelled = false;

		if (visible && originalFrom && originalTo) {
			setLoading(true);
			// Fetch transactions in the original direction (e.g. account→category, income→account)
			void (async () => {
				const txs = await getTransactionsBetweenEntities(originalFrom.id, originalTo.id);
				if (cancelled) {
					return;
				}

				setPastTransactions(txs);
				setLoading(false);
			})();
		} else {
			setPastTransactions([]);
		}

		return () => {
			cancelled = true;
		};
	}, [visible, originalFrom, originalTo]);

	const entityMap = new Map(entities.map((e) => [e.id, e]));

	const handleSelect = useCallback(
		(transaction: Transaction) => {
			void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			onSelect(transaction);
		},
		[onSelect]
	);

	const formatDate = (timestamp: number): string => {
		const date = new Date(timestamp);
		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
		});
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<View
				className="flex-1 bg-paper-50"
				style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
				testID="refund-picker-modal"
			>
				{/* Header */}
				<View className="border-b border-paper-300 px-5 py-4">
					<View className="flex-row items-center justify-between">
						<Text className="font-sans-semibold text-base text-ink">
							Select transaction to edit
						</Text>
						<Pressable onPress={onClose} hitSlop={20} testID="refund-picker-close">
							<X size={24} color={colors.ink.muted} />
						</Pressable>
					</View>
					{originalFrom && originalTo && (
						<Text className="mt-1 font-sans text-sm text-ink-muted">
							Past transactions: {getEntityDisplayName(originalFrom)} →{' '}
							{getEntityDisplayName(originalTo)}
						</Text>
					)}
				</View>

				{/* Transaction list */}
				<ScrollView className="flex-1">
					{loading ? (
						<View className="items-center py-12">
							<ActivityIndicator size="large" color={colors.ink.muted} />
						</View>
					) : pastTransactions.length === 0 ? (
						<View className="items-center px-6 py-12">
							<Text className="text-center font-sans text-sm text-ink-muted">
								No transactions found between these entities
							</Text>
						</View>
					) : (
						pastTransactions.map((tx, index) => {
							const fromEntity = entityMap.get(tx.from_entity_id);
							const toEntity = entityMap.get(tx.to_entity_id);
							const FromIcon = getIcon(fromEntity?.icon || 'circle');
							const ToIcon = getIcon(toEntity?.icon || 'circle');
							const fromColors = fromEntity
								? getEntityColors(fromEntity.type, fromEntity.color)
								: null;
							const toColors = toEntity
								? getEntityColors(toEntity.type, toEntity.color)
								: null;
							const rowBg = index % 2 === 0 ? 'bg-paper-50' : 'bg-paper-100';

							return (
								<Pressable
									key={tx.id}
									onPress={() => handleSelect(tx)}
									className={`border-b border-paper-300 px-5 py-3 ${rowBg}`}
									testID={`refund-row-${tx.id}`}
								>
									<View className="flex-row items-center">
										<View className="flex-1">
											{/* Entity flow */}
											<View className="flex-row items-center">
												<View
													className="mr-2 h-8 w-8 items-center justify-center rounded-full"
													style={{
														backgroundColor:
															fromColors?.bgColor ?? '#EBE3D5',
													}}
												>
													<FromIcon
														size={16}
														color={
															fromColors?.iconColor ??
															colors.ink.muted
														}
													/>
												</View>
												<Text
													className="font-sans-medium text-base text-ink"
													numberOfLines={1}
												>
													{getEntityDisplayName(fromEntity)}
												</Text>
												<Text className="mx-1.5 font-sans text-sm text-ink-muted">
													→
												</Text>
												<View
													className="mr-2 h-8 w-8 items-center justify-center rounded-full"
													style={{
														backgroundColor:
															toColors?.bgColor ?? '#EBE3D5',
													}}
												>
													<ToIcon
														size={16}
														color={
															toColors?.iconColor ?? colors.ink.muted
														}
													/>
												</View>
												<Text
													className="flex-1 font-sans text-base text-ink-light"
													numberOfLines={1}
												>
													{getEntityDisplayName(toEntity)}
												</Text>
											</View>

											{/* Note */}
											{tx.note && (
												<Text
													className="mt-1 font-sans text-sm text-ink-muted"
													numberOfLines={2}
												>
													{tx.note}
												</Text>
											)}
										</View>

										{/* Amount + date */}
										<View className="items-end">
											<Text className="font-sans-semibold text-base text-ink">
												{formatAmount(tx.amount, tx.currency)}{' '}
												<Text className="font-sans text-sm text-ink-muted">
													{getCurrencySymbol(tx.currency)}
												</Text>
											</Text>
											<Text className="mt-0.5 font-sans text-xs text-ink-muted">
												{formatDate(tx.timestamp)}
											</Text>
										</View>
									</View>
								</Pressable>
							);
						})
					)}
				</ScrollView>
			</View>
		</Modal>
	);
}
