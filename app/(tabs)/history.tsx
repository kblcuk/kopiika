import { useState, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { View, Text, TextInput, SectionList, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Search, X } from 'lucide-react-native';

import { useStore } from '@/src/store';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import type { Transaction, EntityWithBalance } from '@/src/types';
import { PeriodPicker } from '@/src/components/period-picker';
import { EntityFilter } from '@/src/components/entity-filter';
import { TransactionRow } from '@/src/components/transaction-row';
import { TransactionModal } from '@/src/components/transaction-modal';
import { formatAmount } from '@/src/utils/format';
import { isEntityDeleted } from '@/src/utils/entity-display';
import { colors } from '@/src/theme/colors';

interface TransactionSection {
	title: string;
	data: Transaction[];
	isUpcoming?: boolean;
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

	const [selectedPeriod, setSelectedPeriod] = useState(params.period || getCurrentPeriod());
	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
		params.entityId || null
	);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const deferredPeriod = useDeferredValue(selectedPeriod);
	const deferredSearch = useDeferredValue(searchQuery);
	const paramsRef = useRef(params);
	paramsRef.current = params;
	// Tracks the entityId we applied on the last focus so that the same
	// stale URL param on a subsequent tab-press is treated as "no filter".
	const lastAppliedEntityId = useRef<string | null>(null);

	const { transactions, entities } = useStore(
		useShallow((state) => ({
			transactions: state.transactions,
			entities: state.entities,
		}))
	);

	// On every focus: apply period from URL. For entityId, only apply it if
	// it's a *new* value we haven't seen before (fresh navigation from an
	// entity). If it matches what we applied last time, the URL is stale
	// (user returned via tab bar) and we reset to All Entities instead.
	useFocusEffect(
		useCallback(() => {
			const { entityId, period } = paramsRef.current;
			setSelectedPeriod(period || getCurrentPeriod());

			if (entityId && entityId !== lastAppliedEntityId.current) {
				setSelectedEntityId(entityId);
				lastAppliedEntityId.current = entityId;
			} else {
				setSelectedEntityId(null);
				lastAppliedEntityId.current = null;
			}
		}, [])
	);

	const isStale = deferredPeriod !== selectedPeriod || deferredSearch !== searchQuery;

	// Single memo for both past and upcoming — one Date.now() call ensures a
	// transaction at the boundary can never fall between two different "now"
	// snapshots and disappear from both lists (KII-73).
	const { filteredTransactions, upcomingTransactions } = useMemo(() => {
		const { start, end } = getPeriodRange(deferredPeriod);
		const now = Date.now();
		const query = deferredSearch.trim().toLowerCase();

		const filtered: Transaction[] = [];
		const upcoming: Transaction[] = [];

		for (const tx of transactions) {
			// Entity filter
			if (
				selectedEntityId &&
				tx.from_entity_id !== selectedEntityId &&
				tx.to_entity_id !== selectedEntityId
			) {
				continue;
			}

			// Period boundary
			if (tx.timestamp < start || tx.timestamp > end) continue;

			// Search filter — match note (case-insensitive) or amount (partial)
			if (
				query &&
				!tx.note?.toLowerCase().includes(query) &&
				!String(tx.amount).includes(query)
			) {
				continue;
			}

			// Past/present vs upcoming split
			if (tx.timestamp <= now) {
				filtered.push(tx);
			} else {
				upcoming.push(tx);
			}
		}

		upcoming.sort((a, b) => a.timestamp - b.timestamp);

		return { filteredTransactions: filtered, upcomingTransactions: upcoming };
	}, [transactions, deferredPeriod, selectedEntityId, deferredSearch]);

	const sections = useMemo(() => {
		const pastSections = groupTransactionsByDay(filteredTransactions);
		const upcomingSection: TransactionSection[] =
			upcomingTransactions.length > 0
				? [{ title: 'Upcoming', data: upcomingTransactions, isUpcoming: true }]
				: [];
		return [...upcomingSection, ...pastSections];
	}, [filteredTransactions, upcomingTransactions]);

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
		return { ...entity, planned: 0, actual: 0, remaining: 0, upcoming: 0 };
	};

	const renderItem = useCallback(
		({
			item,
			index,
			section,
		}: {
			item: Transaction;
			index: number;
			section: TransactionSection;
		}) => {
			const fromEntity = entityMap.get(item.from_entity_id);
			const toEntity = entityMap.get(item.to_entity_id);
			const editable = !isEntityDeleted(fromEntity) && !isEntityDeleted(toEntity);

			return (
				<TransactionRow
					transaction={item}
					entityMap={entityMap}
					onEdit={handleEdit}
					index={index}
					isUpcoming={section.isUpcoming}
					editable={editable}
				/>
			);
		},
		[entityMap, handleEdit]
	);

	const renderSectionHeader = useCallback(
		({ section }: { section: TransactionSection }) =>
			section.isUpcoming ? (
				<View className="border-paper-300 bg-info/10 px-5 py-2">
					<Text className="font-sans text-xs uppercase tracking-wider text-info">
						{section.title}
					</Text>
				</View>
			) : (
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

			{/* Search */}
			<View className="border-paper-400 mx-5 mb-3 flex-row items-center rounded-lg border bg-paper-100 px-3">
				<Search size={16} color={colors.ink.placeholder} />
				<TextInput
					value={searchQuery}
					onChangeText={setSearchQuery}
					placeholder="Search by note or amount"
					placeholderTextColor={colors.ink.placeholder}
					className="ml-2 flex-1 py-2.5 font-sans text-base text-ink"
					autoCorrect={false}
					returnKeyType="search"
				/>
				{searchQuery.length > 0 && (
					<Pressable onPress={() => setSearchQuery('')} hitSlop={12}>
						<X size={16} color={colors.ink.muted} />
					</Pressable>
				)}
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
								{deferredSearch.trim()
									? 'No matching transactions'
									: 'No transactions this period'}
							</Text>
						</View>
					}
				/>
				{isStale && (
					<ActivityIndicator
						size="small"
						color={colors.ink.muted}
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
