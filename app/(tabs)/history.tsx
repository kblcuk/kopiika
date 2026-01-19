import { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useLocalSearchParams } from 'expo-router';

import { useStore } from '@/src/store';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import type { Transaction, EntityWithBalance } from '@/src/types';
import { PeriodPicker } from '@/src/components/period-picker';
import { EntityFilter } from '@/src/components/entity-filter';
import { TransactionRow } from '@/src/components/transaction-row';
import { TransactionModal } from '@/src/components/transaction-modal';

interface TransactionGroup {
	label: string;
	transactions: Transaction[];
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

function groupTransactionsByDay(transactions: Transaction[]): TransactionGroup[] {
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
			label: formatDayLabel(txs[0].timestamp),
			transactions: txs.sort((a, b) => b.timestamp - a.timestamp),
		}));
}

export default function HistoryScreen() {
	const params = useLocalSearchParams<{ period?: string; entityId?: string }>();
	const [selectedPeriod, setSelectedPeriod] = useState(params.period || getCurrentPeriod());
	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
		params.entityId || null
	);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

	const { transactions, entities } = useStore(
		useShallow((state) => ({
			transactions: state.transactions,
			entities: state.entities,
		}))
	);

	// Sync state with URL params when navigating from other screens
	useEffect(() => {
		if (params.period) {
			setSelectedPeriod(params.period);
		}
		if (params.entityId) {
			setSelectedEntityId(params.entityId);
		}
	}, [params.period, params.entityId]);

	const filteredTransactions = useMemo(() => {
		const { start, end } = getPeriodRange(selectedPeriod);

		return transactions.filter((tx) => {
			// Period filter
			if (tx.timestamp < start || tx.timestamp > end) return false;

			// Entity filter
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
	}, [transactions, selectedPeriod, selectedEntityId]);

	const groupedTransactions = useMemo(
		() => groupTransactionsByDay(filteredTransactions),
		[filteredTransactions]
	);

	const handleEdit = (transaction: Transaction) => {
		setEditingTransaction(transaction);
	};

	const handleCloseEdit = () => {
		setEditingTransaction(null);
	};

	// For the edit modal, we need EntityWithBalance objects
	const getEntityWithBalance = (entityId: string): EntityWithBalance | null => {
		const entity = entities.find((e) => e.id === entityId);
		if (!entity) return null;
		return { ...entity, planned: 0, actual: 0, remaining: 0 };
	};

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

			{/* Transaction list */}
			<ScrollView className="flex-1">
				{groupedTransactions.length === 0 ? (
					<View className="flex-1 items-center justify-center px-5 py-16">
						<Text className="font-sans text-base text-ink-muted">
							No transactions this period
						</Text>
					</View>
				) : (
					groupedTransactions.map((group, i) => (
						<View key={group.label}>
							{/* Day header */}
							<View
								className={`border-paper-300 bg-paper-100 px-5 py-2 ${i === 0 ? 'border-t' : ''}`}
							>
								<Text className="font-sans text-xs uppercase tracking-wider text-ink-muted">
									{group.label}
								</Text>
							</View>

							{/* Transactions */}
							{group.transactions.map((tx) => (
								<TransactionRow
									key={tx.id}
									transaction={tx}
									entities={entities}
									onEdit={handleEdit}
								/>
							))}
						</View>
					))
				)}
			</ScrollView>

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
