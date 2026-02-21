import { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { View, Text, SectionList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { useStore } from '@/src/store';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import type { Transaction, EntityWithBalance } from '@/src/types';
import { PeriodPicker } from '@/src/components/period-picker';
import { EntityFilter } from '@/src/components/entity-filter';
import { TransactionRow } from '@/src/components/transaction-row';
import { TransactionModal } from '@/src/components/transaction-modal';
import { formatAmount } from '@/src/utils/format';

interface TransactionSection {
	title: string;
	data: Transaction[];
}

function formatDayLabel(timestamp: number): string {
	const date = new Date(timestamp);
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	const isToday = date.toDateString() === today.toDateString();
	const isYesterday = date.toDateString() === yesterday.toDateString();

	if (isToday) return 'Today';
	if (isYesterday) return 'Yesterday';

	return date.toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	});
}

function groupTransactionsByDay(transactions: Transaction[]): TransactionSection[] {
	const groups: Map<string, Transaction[]> = new Map();

	for (const tx of transactions) {
		const date = new Date(tx.timestamp);
		const key = date.toDateString();

		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key)!.push(tx);
	}

	return Array.from(groups.entries())
		.sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
		.map(([_, txs]) => ({
			title: formatDayLabel(txs[0].timestamp),
			data: txs.sort((a, b) => b.timestamp - a.timestamp),
		}));
}

export default function HistoryScreen() {
	const params = useLocalSearchParams<{ period?: string; entityId?: string }>();
	const router = useRouter();
	const [selectedPeriod, setSelectedPeriod] = useState(params.period || getCurrentPeriod());
	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
		params.entityId || null
	);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const deferredPeriod = useDeferredValue(selectedPeriod);

	const { transactions, entities } = useStore(
		useShallow((state) => ({
			transactions: state.transactions,
			entities: state.entities,
		}))
	);

	// Apply URL params on focus, clear on blur
	useFocusEffect(
		useCallback(() => {
			setSelectedPeriod(params.period || getCurrentPeriod());
			setSelectedEntityId(params.entityId || null);

			return () => {
				router.setParams({ period: '', entityId: '' });
			};
		}, [params.period, params.entityId, router])
	);

	const isStale = deferredPeriod !== selectedPeriod;

	const filteredTransactions = useMemo(() => {
		const { start, end } = getPeriodRange(deferredPeriod);

		return transactions.filter((tx) => {
			if (tx.timestamp < start || tx.timestamp > end) return false;

			if (selectedEntityId) {
				if (
					tx.from_entity_id !== selectedEntityId &&
					tx.to_entity_id !== selectedEntityId
				) {
					return false;
				}
			}

			return true;
		});
	}, [transactions, deferredPeriod, selectedEntityId]);

	const sections = useMemo(
		() => groupTransactionsByDay(filteredTransactions),
		[filteredTransactions]
	);

	const entityMap = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

	const periodTotals = useMemo(() => {
		const count = filteredTransactions.length;
		if (!selectedEntityId) return { count, inflow: null, outflow: null };
		let inflow = 0;
		let outflow = 0;
		for (const tx of filteredTransactions) {
			if (tx.to_entity_id === selectedEntityId) inflow += tx.amount;
			if (tx.from_entity_id === selectedEntityId) outflow += tx.amount;
		}
		return { count, inflow, outflow };
	}, [filteredTransactions, selectedEntityId]);

	const handleEdit = useCallback((transaction: Transaction) => {
		setEditingTransaction(transaction);
	}, []);

	const handleCloseEdit = () => {
		setEditingTransaction(null);
	};

	// For the edit modal, we need EntityWithBalance objects
	const getEntityWithBalance = (entityId: string): EntityWithBalance | null => {
		const entity = entityMap.get(entityId);
		if (!entity) return null;
		return { ...entity, planned: 0, actual: 0, remaining: 0 };
	};

	const renderItem = useCallback(
		({ item, index }: { item: Transaction; index: number }) => (
			<TransactionRow
				transaction={item}
				entityMap={entityMap}
				onEdit={handleEdit}
				index={index}
			/>
		),
		[entityMap, handleEdit]
	);

	const renderSectionHeader = useCallback(
		({ section }: { section: TransactionSection }) => (
			<View className="border-paper-300 bg-paper-100 px-5 py-2">
				<Text className="font-sans text-xs uppercase tracking-wider text-ink-muted">
					{section.title}
				</Text>
			</View>
		),
		[]
	);

	const keyExtractor = useCallback((tx: Transaction) => tx.id, []);

	return (
		<SafeAreaView className="flex-1 bg-paper-50" edges={['top']}>
			{/* Header */}
			<View className="border-b border-paper-300 px-5 py-4">
				<Text className="font-sans-bold text-2xl text-ink">History</Text>
			</View>

			{/* Period picker */}
			<PeriodPicker period={selectedPeriod} onChange={setSelectedPeriod} />

			{/* Entity filter */}
			<View className="pb-3">
				<EntityFilter selectedEntityId={selectedEntityId} onChange={setSelectedEntityId} />
			</View>

			{/* Period totals */}
			<View className="flex-row items-center justify-between border-b border-paper-300 bg-paper-100 px-5 py-2">
				<Text className="font-sans text-xs text-ink-muted">
					{periodTotals.count} {periodTotals.count === 1 ? 'transaction' : 'transactions'}
				</Text>
				{periodTotals.inflow !== null && (
					<View className="flex-row gap-4">
						<Text className="font-sans text-xs text-ink-muted">
							In:{' '}
							<Text className="text-positive">
								{formatAmount(periodTotals.inflow)}
							</Text>
						</Text>
						<Text className="font-sans text-xs text-ink-muted">
							Out:{' '}
							<Text className="text-negative">
								{formatAmount(periodTotals.outflow ?? 0)}
							</Text>
						</Text>
					</View>
				)}
			</View>

			{/* Transaction list */}
			<View className="flex-1">
				<SectionList
					sections={sections}
					renderItem={renderItem}
					renderSectionHeader={renderSectionHeader}
					keyExtractor={keyExtractor}
					stickySectionHeadersEnabled={false}
					initialNumToRender={10}
					maxToRenderPerBatch={6}
					windowSize={5}
					removeClippedSubviews
					className="flex-1"
					style={isStale ? { opacity: 0.6 } : undefined}
					ListEmptyComponent={
						<View className="flex-1 items-center justify-center px-5 py-16">
							<Text className="font-sans text-base text-ink-muted">
								No transactions this period
							</Text>
						</View>
					}
				/>
				{isStale && (
					<ActivityIndicator
						size="small"
						color="#6B5D4A"
						className="absolute bottom-0 left-0 right-0 top-0 items-center justify-center"
					/>
				)}
			</View>

			{/* Edit transaction modal */}
			{editingTransaction && (
				<TransactionModal
					visible={true}
					fromEntity={getEntityWithBalance(editingTransaction.from_entity_id)}
					toEntity={getEntityWithBalance(editingTransaction.to_entity_id)}
					onClose={handleCloseEdit}
					existingTransaction={editingTransaction}
				/>
			)}
		</SafeAreaView>
	);
}
