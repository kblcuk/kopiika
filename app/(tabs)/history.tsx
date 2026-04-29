import { useState, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { showSeriesScopeAlert, type SeriesScope } from '@/src/components/series-action-sheet';
import {
	View,
	TextInput,
	SectionList,
	ActivityIndicator,
	Pressable,
	Alert,
	Modal,
} from 'react-native';
import { Text } from '@/src/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Search, X, CheckCheck } from 'lucide-react-native';

import { useStore } from '@/src/store';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import type { Transaction, EntityWithBalance, MarketValueSnapshot } from '@/src/types';
import { PeriodPicker } from '@/src/components/period-picker';
import { EntityFilter } from '@/src/components/entity-filter';
import { ReservationSummary } from '@/src/components/reservation-summary';
import { TransactionRow } from '@/src/components/transaction-row';
import { TransactionModal } from '@/src/components/transaction-modal';
import {
	formatAmount,
	reverseFormatCurrency,
	roundMoney,
	getCurrencySymbol,
} from '@/src/utils/format';
import { isEntityDeleted } from '@/src/utils/entity-display';
import { colors } from '@/src/theme/colors';
import {
	sharedNumericTextInputProps,
	sharedTextInputProps,
	styles,
	textInputClassNames,
} from '@/src/styles/text-input';

interface TransactionSection {
	title: string;
	data: Transaction[];
	isUpcoming?: boolean;
	isUnconfirmed?: boolean;
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

function formatSnapshotDateInput(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate()
	).padStart(2, '0')}`;
}

function parseSnapshotDateInput(input: string): number | null {
	const trimmed = input.trim();
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);

	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}

	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

export default function HistoryScreen() {
	const params = useLocalSearchParams<{ period?: string; entityId?: string }>();

	const [selectedPeriod, setSelectedPeriod] = useState(params.period || getCurrentPeriod());
	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
		params.entityId || null
	);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [editingSnapshot, setEditingSnapshot] = useState<MarketValueSnapshot | null>(null);
	const [editingSnapshotAmount, setEditingSnapshotAmount] = useState('');
	const [editingSnapshotDate, setEditingSnapshotDate] = useState('');
	const [editScope, setEditScope] = useState<SeriesScope>('single');
	const [searchQuery, setSearchQuery] = useState('');
	const deferredPeriod = useDeferredValue(selectedPeriod);
	const deferredSearch = useDeferredValue(searchQuery);
	const paramsRef = useRef(params);
	paramsRef.current = params;
	// Tracks the entityId we applied on the last focus so that the same
	// stale URL param on a subsequent tab-press is treated as "no filter".
	const lastAppliedEntityId = useRef<string | null>(null);

	const {
		transactions,
		entities,
		marketValueSnapshots,
		updateMarketValueSnapshot,
		deleteMarketValueSnapshot,
	} = useStore(
		useShallow((state) => ({
			transactions: state.transactions,
			entities: state.entities,
			marketValueSnapshots: state.marketValueSnapshots,
			updateMarketValueSnapshot: state.updateMarketValueSnapshot,
			deleteMarketValueSnapshot: state.deleteMarketValueSnapshot,
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
	const { filteredTransactions, upcomingTransactions, unconfirmedTransactions } = useMemo(() => {
		const { start, end } = getPeriodRange(deferredPeriod);
		const now = Date.now();
		const query = deferredSearch.trim().toLowerCase();

		const filtered: Transaction[] = [];
		const upcoming: Transaction[] = [];
		const unconfirmed: Transaction[] = [];

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

			// Three-way split: upcoming / unconfirmed past-due / confirmed past
			if (tx.timestamp > now) {
				upcoming.push(tx);
			} else if (tx.is_confirmed === false) {
				unconfirmed.push(tx);
			} else {
				filtered.push(tx);
			}
		}

		upcoming.sort((a, b) => a.timestamp - b.timestamp);
		unconfirmed.sort((a, b) => a.timestamp - b.timestamp);

		return {
			filteredTransactions: filtered,
			upcomingTransactions: upcoming,
			unconfirmedTransactions: unconfirmed,
		};
	}, [transactions, deferredPeriod, selectedEntityId, deferredSearch]);

	const sections = useMemo(() => {
		const pastSections = groupTransactionsByDay(filteredTransactions);
		const upcomingSection: TransactionSection[] =
			upcomingTransactions.length > 0
				? [{ title: 'Upcoming', data: upcomingTransactions, isUpcoming: true }]
				: [];
		const unconfirmedSection: TransactionSection[] =
			unconfirmedTransactions.length > 0
				? [
						{
							title: 'Needs Confirmation',
							data: unconfirmedTransactions,
							isUnconfirmed: true,
						},
					]
				: [];
		return [...upcomingSection, ...unconfirmedSection, ...pastSections];
	}, [filteredTransactions, upcomingTransactions, unconfirmedTransactions]);

	const entityMap = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

	const selectedEntity = selectedEntityId ? (entityMap.get(selectedEntityId) ?? null) : null;
	const isInvestmentSelected =
		selectedEntity?.type === 'account' && selectedEntity?.is_investment;

	const entitySnapshots = useMemo(() => {
		if (!isInvestmentSelected || !selectedEntityId) return [];
		return marketValueSnapshots
			.filter((s) => s.entity_id === selectedEntityId)
			.sort((a, b) => b.date - a.date);
	}, [marketValueSnapshots, selectedEntityId, isInvestmentSelected]);

	const parsedSnapshotAmount = useMemo(
		() => reverseFormatCurrency(editingSnapshotAmount),
		[editingSnapshotAmount]
	);
	const parsedSnapshotDate = useMemo(
		() => parseSnapshotDateInput(editingSnapshotDate),
		[editingSnapshotDate]
	);
	const todayStart = useMemo(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return today.getTime();
	}, []);
	const isSnapshotAmountValid = !Number.isNaN(parsedSnapshotAmount) && parsedSnapshotAmount >= 0;
	const isSnapshotDateValid = parsedSnapshotDate !== null && parsedSnapshotDate <= todayStart;
	const canSaveSnapshot =
		editingSnapshot !== null && isSnapshotAmountValid && isSnapshotDateValid;

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

	const confirmAllDueTransactions = useStore((state) => state.confirmAllDueTransactions);

	const handleConfirmAll = useCallback(() => {
		void confirmAllDueTransactions();
	}, [confirmAllDueTransactions]);

	const handleEdit = useCallback((transaction: Transaction) => {
		if (transaction.series_id) {
			showSeriesScopeAlert('edit', (scope) => {
				setEditScope(scope);
				setEditingTransaction(transaction);
			});
		} else {
			setEditingTransaction(transaction);
		}
	}, []);

	const handleCloseEdit = () => {
		setEditingTransaction(null);
	};

	const handleEditSnapshot = useCallback((snapshot: MarketValueSnapshot) => {
		setEditingSnapshot(snapshot);
		setEditingSnapshotAmount(roundMoney(snapshot.amount).toString());
		setEditingSnapshotDate(formatSnapshotDateInput(snapshot.date));
	}, []);

	const handleCloseSnapshotEditor = useCallback(() => {
		setEditingSnapshot(null);
		setEditingSnapshotAmount('');
		setEditingSnapshotDate('');
	}, []);

	const handleSaveSnapshot = useCallback(async () => {
		if (!editingSnapshot) return;

		if (Number.isNaN(parsedSnapshotAmount) || parsedSnapshotAmount < 0) {
			Alert.alert('Invalid Amount', 'Enter a valid non-negative market value amount.');
			return;
		}

		if (parsedSnapshotDate === null) {
			Alert.alert('Invalid Date', 'Enter the date as YYYY-MM-DD.');
			return;
		}
		if (parsedSnapshotDate > todayStart) {
			Alert.alert('Invalid Date', 'Market value snapshots cannot be dated in the future.');
			return;
		}

		await updateMarketValueSnapshot(editingSnapshot.id, {
			amount: parsedSnapshotAmount,
			date: parsedSnapshotDate,
		});
		handleCloseSnapshotEditor();
	}, [
		editingSnapshot,
		parsedSnapshotAmount,
		parsedSnapshotDate,
		todayStart,
		updateMarketValueSnapshot,
		handleCloseSnapshotEditor,
	]);

	const handleDeleteSnapshot = useCallback(() => {
		if (!editingSnapshot) return;

		Alert.alert('Delete Snapshot', 'Delete this market value snapshot?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: async () => {
					await deleteMarketValueSnapshot(editingSnapshot.id);
					handleCloseSnapshotEditor();
				},
			},
		]);
	}, [editingSnapshot, deleteMarketValueSnapshot, handleCloseSnapshotEditor]);

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
					isUnconfirmed={section.isUnconfirmed}
					editable={editable}
				/>
			);
		},
		[entityMap, handleEdit]
	);

	const renderSectionHeader = useCallback(
		({ section }: { section: TransactionSection }) =>
			section.isUnconfirmed ? (
				<View className="flex-row items-center justify-between border-paper-300 bg-warning/10 px-5 py-2">
					<Text className="font-sans text-xs uppercase tracking-wider text-warning">
						{section.title}
					</Text>
					<Pressable
						onPress={handleConfirmAll}
						className="flex-row items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1"
					>
						<CheckCheck size={12} color={colors.warning.DEFAULT} />
						<Text className="font-sans-semibold text-xs text-warning">Confirm All</Text>
					</Pressable>
				</View>
			) : section.isUpcoming ? (
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
		[handleConfirmAll]
	);

	const keyExtractor = useCallback((tx: Transaction) => tx.id, []);

	const renderSnapshotList = useCallback(() => {
		if (!isInvestmentSelected) return null;
		const currency = selectedEntity?.currency ?? 'EUR';
		return (
			<View className="px-5 pb-8 pt-4" testID="market-value-snapshots-section">
				<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
					Market Value Snapshots
				</Text>
				{entitySnapshots.length === 0 ? (
					<View className="rounded-lg bg-paper-100 px-4 py-4">
						<Text className="font-sans text-sm text-ink-muted">
							No market value snapshots yet. Add one from the account editor.
						</Text>
					</View>
				) : (
					<View className="rounded-lg bg-paper-100">
						{entitySnapshots.map((snapshot, index) => {
							const snapshotDate = new Date(snapshot.date);
							const dateStr = snapshotDate.toLocaleDateString(void 0, {
								year: 'numeric',
								month: 'short',
								day: 'numeric',
							});
							return (
								<Pressable
									key={snapshot.id}
									onPress={() => handleEditSnapshot(snapshot)}
									className={`flex-row items-center justify-between px-4 py-3 ${
										index > 0 ? 'border-t border-paper-300' : ''
									}`}
									testID={`market-value-snapshot-row-${snapshot.id}`}
								>
									<Text
										className="font-sans-semibold text-base text-ink"
										style={{ fontVariant: ['tabular-nums'] }}
									>
										{formatAmount(snapshot.amount, currency)}
									</Text>
									<Text className="font-sans text-sm text-ink-muted">
										{dateStr}
									</Text>
								</Pressable>
							);
						})}
					</View>
				)}
			</View>
		);
	}, [entitySnapshots, selectedEntity, handleEditSnapshot, isInvestmentSelected]);

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
					ListHeaderComponent={
						<ReservationSummary
							selectedEntity={selectedEntity}
							entities={entities}
							transactions={transactions}
						/>
					}
					ListFooterComponent={sections.length > 0 ? renderSnapshotList : null}
					ListEmptyComponent={
						<View className="flex-1 px-5 py-16">
							{!isInvestmentSelected ? (
								<Text className="text-center font-sans text-base text-ink-muted">
									{deferredSearch.trim()
										? 'No matching transactions'
										: 'No transactions this period'}
								</Text>
							) : (
								renderSnapshotList()
							)}
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

			<Modal
				visible={editingSnapshot !== null}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={handleCloseSnapshotEditor}
			>
				<SafeAreaView className="flex-1 bg-paper-50" edges={['top']}>
					<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
						<Pressable onPress={handleCloseSnapshotEditor} hitSlop={20}>
							<Text className="font-sans text-base text-ink-muted">Cancel</Text>
						</Pressable>
						<View className="items-center">
							<Text className="font-sans-semibold text-base text-ink">
								Edit Snapshot
							</Text>
							{selectedEntity && (
								<Text className="font-sans text-xs text-ink-muted">
									{selectedEntity.name}
								</Text>
							)}
						</View>
						<Pressable
							onPress={() => void handleSaveSnapshot()}
							hitSlop={20}
							disabled={!canSaveSnapshot}
						>
							<Text
								className={`font-sans-semibold text-base ${
									canSaveSnapshot ? 'text-accent' : 'text-ink-muted'
								}`}
							>
								Save
							</Text>
						</Pressable>
					</View>

					<View className="px-5 pt-6">
						<View className="mb-6">
							<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
								Market Value
							</Text>
							<View className={textInputClassNames.inlineContainer}>
								<TextInput
									{...sharedNumericTextInputProps}
									keyboardType="number-pad"
									value={editingSnapshotAmount}
									onChangeText={setEditingSnapshotAmount}
									placeholder="0"
									className={textInputClassNames.primaryAmountInput}
									style={styles.input}
									placeholderTextColor={colors.ink.placeholder}
									testID="snapshot-edit-amount-input"
								/>
								<Text className={textInputClassNames.suffixLarge}>
									{getCurrencySymbol(selectedEntity?.currency ?? 'EUR')}
								</Text>
							</View>
							{editingSnapshotAmount.length > 0 && !isSnapshotAmountValid && (
								<Text className="mt-1 font-sans text-xs text-negative">
									Enter a valid non-negative market value.
								</Text>
							)}
						</View>

						<View className="mb-6">
							<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
								Snapshot Date
							</Text>
							<View className={textInputClassNames.container}>
								<TextInput
									{...sharedTextInputProps}
									value={editingSnapshotDate}
									onChangeText={setEditingSnapshotDate}
									placeholder="YYYY-MM-DD"
									className={textInputClassNames.input}
									style={styles.input}
									placeholderTextColor={colors.ink.placeholder}
									autoCapitalize="none"
									autoCorrect={false}
									testID="snapshot-edit-date-input"
								/>
							</View>
							<Text className="mt-1 font-sans text-xs text-ink-muted">
								Use the `YYYY-MM-DD` format. Future dates aren&apos;t allowed.
							</Text>
							{editingSnapshotDate.length > 0 && !isSnapshotDateValid && (
								<Text className="mt-1 font-sans text-xs text-negative">
									Enter a valid current or past date.
								</Text>
							)}
						</View>

						<Pressable
							onPress={handleDeleteSnapshot}
							className="items-center rounded-lg border border-negative/30 bg-negative/10 py-3"
							testID="snapshot-edit-delete-button"
						>
							<Text className="font-sans-semibold text-base text-negative">
								Delete Snapshot
							</Text>
						</Pressable>
					</View>
				</SafeAreaView>
			</Modal>

			{/* Edit transaction modal */}
			{editingTransaction && (
				<TransactionModal
					visible={true}
					fromEntity={getEntityWithBalance(editingTransaction.from_entity_id)}
					toEntity={getEntityWithBalance(editingTransaction.to_entity_id)}
					onClose={handleCloseEdit}
					existingTransaction={editingTransaction}
					seriesScope={editingTransaction.series_id ? editScope : undefined}
				/>
			)}
		</SafeAreaView>
	);
}
