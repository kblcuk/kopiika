import { useState, useMemo, useCallback, useDeferredValue, useEffect, useRef } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { Search, X, CheckCheck, Upload } from 'lucide-react-native';

import { useStore } from '@/src/store';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import type { Transaction, EntityWithBalance, MarketValueSnapshot } from '@/src/types';
import { PeriodPicker } from '@/src/components/period-picker';
import { EntityFilter } from '@/src/components/entity-filter';
import { ReservationSummary } from '@/src/components/reservation-summary';
import { TransactionRow } from '@/src/components/transaction-row';
import { TransactionModal } from '@/src/components/transaction-modal';
import {
	amountMatchesSearch,
	formatAmount,
	formatAmountForInput,
	parseAmountToMinor,
	getCurrencySymbol,
} from '@/src/utils/format';
import { isEntityDeleted } from '@/src/utils/entity-display';
import { isDue } from '@/src/utils/due';
import { toCivilDate } from '@/src/utils/recurrence';
import { deriveVirtualOccurrences } from '@/src/utils/recurrence-derivation';
import { pickInitialScrollSectionIndex } from '@/src/utils/history-scroll';
import { consumePendingHistoryFilter } from '@/src/utils/history-nav-signal';
import { colors } from '@/src/theme/colors';
import { TestIDs } from '@/e2e/support/test-ids';
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

// KII-132: `formatDayLabel`, `groupTransactionsByDay`, `parseSnapshotDateInput`
// and the other pure helpers below live in this screen module. Move to
// `src/utils/` so they're reusable + unit-testable independently of the screen.
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
			title: formatDayLabel(txs[0]!.timestamp),
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
	const router = useRouter();
	const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [editingSnapshot, setEditingSnapshot] = useState<MarketValueSnapshot | null>(null);
	const [editingSnapshotAmount, setEditingSnapshotAmount] = useState('');
	const [editingSnapshotDate, setEditingSnapshotDate] = useState('');
	// null until the user answers the scope prompt in handleEdit. Deleting from
	// the modal now acts on this without prompting (KII-158), so a default here
	// would silently pick a scope nobody chose.
	const [editScope, setEditScope] = useState<SeriesScope | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const deferredPeriod = useDeferredValue(selectedPeriod);
	const deferredSearch = useDeferredValue(searchQuery);
	const listRef = useRef<SectionList<Transaction, TransactionSection>>(null);
	// Tracks the last set of user-driven inputs we applied an initial scroll
	// for. Re-scrolling is gated on this so transactions arriving from
	// background sync don't yank a scrolled-down user back to the top.
	const lastScrollInputKey = useRef<string | null>(null);

	const {
		transactions,
		entities,
		recurrenceTemplates,
		marketValueSnapshots,
		updateMarketValueSnapshot,
		deleteMarketValueSnapshot,
	} = useStore(
		useShallow((state) => ({
			transactions: state.transactions,
			entities: state.entities,
			recurrenceTemplates: state.recurrenceTemplates,
			marketValueSnapshots: state.marketValueSnapshots,
			updateMarketValueSnapshot: state.updateMarketValueSnapshot,
			deleteMarketValueSnapshot: state.deleteMarketValueSnapshot,
		}))
	);

	// On every focus (including initial mount), consume the pending nav
	// signal and reset to defaults if none. Producers (Dashboard / Summary)
	// set the signal right before router.push('/history'); tab-bar returns
	// have no pending signal and land on "All Entities + current month".
	// See KII-111 for why URL params can't drive this directly.
	useFocusEffect(
		useCallback(() => {
			const pending = consumePendingHistoryFilter();
			setSelectedPeriod(pending?.period || getCurrentPeriod());
			setSelectedEntityId(pending?.entityId || null);
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

		const exclusionsByTemplate = new Map(
			recurrenceTemplates.map((t) => [t.id, new Set((t.exclusions ?? []).map(toCivilDate))])
		);
		const virtual = deriveVirtualOccurrences(
			recurrenceTemplates,
			exclusionsByTemplate,
			transactions,
			start,
			end,
			now
		);
		const candidates = [...transactions, ...virtual];

		const filtered: Transaction[] = [];
		const upcoming: Transaction[] = [];
		const unconfirmed: Transaction[] = [];

		for (const tx of candidates) {
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

			// Search filter — match note (case-insensitive) or amount (partial,
			// matched against the formatted major-unit string the user sees).
			// Amount matching is separator-agnostic so dot and comma both work
			// regardless of the device locale's decimal separator (KII-137).
			if (
				query &&
				!tx.note?.toLowerCase().includes(query) &&
				!amountMatchesSearch(formatAmount(tx.amount_minor, tx.currency), query)
			) {
				continue;
			}

			// Three-way split: upcoming / due-but-unconfirmed / confirmed past.
			// Due-ness is a civil-day comparison (KII-159), so an occurrence dated
			// today is confirmable from midnight rather than from its inherited
			// time-of-day.
			if (!isDue(tx.timestamp, now)) {
				upcoming.push(tx);
			} else if (tx.is_confirmed === false) {
				unconfirmed.push(tx);
			} else {
				filtered.push(tx);
			}
		}

		upcoming.sort((a, b) => b.timestamp - a.timestamp);
		unconfirmed.sort((a, b) => a.timestamp - b.timestamp);

		return {
			filteredTransactions: filtered,
			upcomingTransactions: upcoming,
			unconfirmedTransactions: unconfirmed,
		};
	}, [transactions, deferredPeriod, selectedEntityId, deferredSearch, recurrenceTemplates]);

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

	// Kept in a ref so the deferred onScrollToIndexFailed retry below always
	// reads the current sections, not the (possibly stale) value captured in
	// its closure at the time the failure fired.
	const sectionsRef = useRef(sections);
	sectionsRef.current = sections;

	useEffect(() => {
		const inputKey = `${deferredPeriod}|${selectedEntityId ?? ''}|${deferredSearch}`;
		if (lastScrollInputKey.current === inputKey) return;
		lastScrollInputKey.current = inputKey;

		const target = pickInitialScrollSectionIndex(sections);
		if (target <= 0) return;

		listRef.current?.scrollToLocation({
			sectionIndex: target,
			itemIndex: 0,
			viewPosition: 0,
			animated: false,
		});
	}, [sections, deferredPeriod, selectedEntityId, deferredSearch]);

	// VirtualizedList can fail to resolve a target offset when items haven't
	// been measured yet; retrying after a tick lets layout catch up. Reads
	// from sectionsRef so a retry that fires after the user has navigated
	// (shrinking sections) doesn't ask for an out-of-range sectionIndex.
	const handleScrollToIndexFailed = useCallback(() => {
		setTimeout(() => {
			const currentSections = sectionsRef.current;
			const target = pickInitialScrollSectionIndex(currentSections);
			if (target <= 0) return;
			listRef.current?.scrollToLocation({
				sectionIndex: target,
				itemIndex: 0,
				viewPosition: 0,
				animated: false,
			});
		}, 100);
	}, []);

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

	const editingSnapshotCurrency = editingSnapshot?.currency ?? selectedEntity?.currency;
	const parsedSnapshotAmountMinor = useMemo(
		() => parseAmountToMinor(editingSnapshotAmount, editingSnapshotCurrency),
		[editingSnapshotAmount, editingSnapshotCurrency]
	);
	const parsedSnapshotDate = useMemo(
		() => parseSnapshotDateInput(editingSnapshotDate),
		[editingSnapshotDate]
	);
	// KII-132: memoized with `[]` deps — stale after midnight if the screen
	// stays mounted across the day boundary. Either drop the memo (cheap to
	// recompute) or document the limitation explicitly.
	const todayStart = useMemo(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return today.getTime();
	}, []);
	const isSnapshotAmountValid =
		!Number.isNaN(parsedSnapshotAmountMinor) && parsedSnapshotAmountMinor >= 0;
	const isSnapshotDateValid = parsedSnapshotDate !== null && parsedSnapshotDate <= todayStart;
	const canSaveSnapshot =
		editingSnapshot !== null && isSnapshotAmountValid && isSnapshotDateValid;

	const periodTotals = useMemo(() => {
		const count = filteredTransactions.length;
		if (!selectedEntityId) return { count, inflow: null, outflow: null };
		let inflow = 0;
		let outflow = 0;
		for (const tx of filteredTransactions) {
			if (tx.to_entity_id === selectedEntityId) inflow += tx.amount_minor;
			if (tx.from_entity_id === selectedEntityId) outflow += tx.amount_minor;
		}
		return { count, inflow, outflow };
	}, [filteredTransactions, selectedEntityId]);

	const confirmAllDueTransactions = useStore((state) => state.confirmAllDueTransactions);

	const handleConfirmAll = useCallback(async () => {
		try {
			await confirmAllDueTransactions();
		} catch (error) {
			console.error('Failed to confirm due transactions:', error);
			Alert.alert(
				'Could not confirm transactions',
				'Something went wrong. Please try again.'
			);
		}
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
		setEditScope(null);
	};

	const handleEditSnapshot = useCallback((snapshot: MarketValueSnapshot) => {
		setEditingSnapshot(snapshot);
		setEditingSnapshotAmount(formatAmountForInput(snapshot.amount_minor, snapshot.currency));
		setEditingSnapshotDate(formatSnapshotDateInput(snapshot.date));
	}, []);

	const handleCloseSnapshotEditor = useCallback(() => {
		setEditingSnapshot(null);
		setEditingSnapshotAmount('');
		setEditingSnapshotDate('');
	}, []);

	const handleSaveSnapshot = useCallback(async () => {
		if (!editingSnapshot) return;

		if (Number.isNaN(parsedSnapshotAmountMinor) || parsedSnapshotAmountMinor < 0) {
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

		try {
			await updateMarketValueSnapshot(editingSnapshot.id, {
				amount_minor: parsedSnapshotAmountMinor,
				date: parsedSnapshotDate,
			});
			handleCloseSnapshotEditor();
		} catch (error) {
			console.error('Failed to update market value snapshot:', error);
			Alert.alert('Save failed', 'Could not update the snapshot. Please try again.');
		}
	}, [
		editingSnapshot,
		parsedSnapshotAmountMinor,
		parsedSnapshotDate,
		todayStart,
		updateMarketValueSnapshot,
		handleCloseSnapshotEditor,
	]);

	const handleDeleteSnapshot = useCallback(() => {
		if (!editingSnapshot) return;
		const snapshotId = editingSnapshot.id;

		const performDelete = async () => {
			try {
				await deleteMarketValueSnapshot(snapshotId);
				handleCloseSnapshotEditor();
			} catch (error) {
				console.error('Failed to delete market value snapshot:', error);
				Alert.alert('Delete failed', 'Could not delete the snapshot. Please try again.');
			}
		};

		Alert.alert('Delete Snapshot', 'Delete this market value snapshot?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: () => {
					void performDelete();
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
						onPress={() => {
							void handleConfirmAll();
						}}
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
										{formatAmount(snapshot.amount_minor, currency)}
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
		<SafeAreaView className="flex-1 bg-paper-50" edges={['top']} testID="history-screen">
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
			<View className="mx-5 mb-3 flex-row items-center rounded-lg border border-paper-300 bg-paper-100 px-3">
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
								{formatAmount(periodTotals.inflow, selectedEntity?.currency)}
							</Text>
						</Text>
						<Text className="font-sans text-xs text-ink-muted">
							Out:{' '}
							<Text className="text-negative">
								{formatAmount(periodTotals.outflow ?? 0, selectedEntity?.currency)}
							</Text>
						</Text>
					</View>
				)}
			</View>

			{/* Transaction list */}
			<View className="flex-1">
				<SectionList
					ref={listRef}
					testID="history-transaction-list"
					sections={sections}
					renderItem={renderItem}
					renderSectionHeader={renderSectionHeader}
					keyExtractor={keyExtractor}
					stickySectionHeadersEnabled={false}
					initialNumToRender={10}
					maxToRenderPerBatch={6}
					windowSize={5}
					// Explicit false: RN defaults removeClippedSubviews to `true` on
					// Android when the prop is omitted (false on iOS). baaf026 *removed*
					// the prop intending to disable clipping (the suspected cause of
					// dead RNGH taps on recycled rows), which took effect on iOS but
					// silently left clipping on for Android. Setting it explicitly
					// restores the intended behavior on both platforms and keeps
					// scrolled-in rows mounted.
					removeClippedSubviews={false}
					onScrollToIndexFailed={handleScrollToIndexFailed}
					className="flex-1"
					style={isStale ? { opacity: 0.6 } : undefined}
					ListHeaderComponent={
						<>
							{selectedEntity?.type === 'account' && !isInvestmentSelected ? (
								<Pressable
									testID={TestIDs.historyImportButton}
									onPress={() =>
										router.push({
											pathname: '/import/[accountId]',
											params: { accountId: selectedEntity.id },
										})
									}
									className="mx-5 mb-2 mt-3 flex-row items-center justify-center gap-2 rounded-full border border-paper-300 py-2.5"
								>
									<Upload size={16} color={colors.ink.muted} />
									<Text className="font-sans-semibold text-sm text-ink">
										Import transactions
									</Text>
								</Pressable>
							) : null}
							<ReservationSummary
								selectedEntity={selectedEntity}
								entities={entities}
								transactions={transactions}
							/>
						</>
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
					seriesScope={
						editingTransaction.series_id ? (editScope ?? undefined) : undefined
					}
				/>
			)}
		</SafeAreaView>
	);
}
