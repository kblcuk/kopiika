import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View, Pressable, FlatList, Modal, ActivityIndicator } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/src/components/text';
import { TestIDs } from '@/e2e/support/test-ids';
import { formatAmount } from '@/src/utils/format';
import { colors } from '@/src/theme/colors';
import { EntitySelectionSheet } from '@/src/components/entity-selection-sheet';
import { EntityCreateModal } from '@/src/components/entity-create-modal';
import type { Entity, EntityDraft } from '@/src/types';
import type { Assignment, ReconciledRow } from '@/src/utils/bank-import/types';

interface StepReviewProps {
	rows: ReconciledRow[];
	onRowsChange: (rows: ReconciledRow[]) => void;
	categories: Entity[];
	incomes: Entity[];
	accounts: Entity[];
	currency: string;
	onCommit: () => void;
	committing: boolean;
}

/** Synthetic entity id: selecting it in the sheet opens the new-category prompt
 * instead of assigning a real entity. Never persisted. */
const NEW_CATEGORY_SENTINEL_ID = '__import_new_category__';

/** Prefix for the synthetic ids of categories staged earlier in this same import
 * (created via the new-category modal but not yet committed). Selecting one
 * re-assigns a row to that pending category. The trimmed name follows the
 * prefix and is the dedup key, matching `buildImportTransactions`. */
const STAGED_CATEGORY_PREFIX = '__import_staged_category__';

type Sign = -1 | 1;

interface SheetTarget {
	rowIndex: number;
	sign: Sign;
}

interface PropagatePrompt {
	assignment: Assignment;
	candidateIndexes: number[];
	label: string;
	description: string;
}

function signOf(amountMinor: number): Sign {
	return amountMinor < 0 ? -1 : 1;
}

function normalizeDescription(description: string): string {
	return description.trim().toLowerCase();
}

function assignmentLabel(
	assignment: Assignment | null,
	isNegative: boolean,
	categories: Entity[],
	incomes: Entity[],
	accounts: Entity[]
): string {
	if (!assignment) return isNegative ? 'Choose category' : 'Choose income';
	switch (assignment.kind) {
		case 'category':
			return categories.find((c) => c.id === assignment.entityId)?.name ?? 'Category';
		case 'income':
			return incomes.find((c) => c.id === assignment.entityId)?.name ?? 'Income';
		case 'transfer':
			return `Transfer → ${accounts.find((a) => a.id === assignment.accountId)?.name ?? 'account'}`;
		case 'newCategory':
			return `New: ${assignment.draft.name}`;
	}
}

interface ReviewRowProps {
	row: ReconciledRow;
	currency: string;
	categories: Entity[];
	incomes: Entity[];
	accounts: Entity[];
	onToggleSelect: (rowIndex: number) => void;
	onAssign: (rowIndex: number, sign: Sign) => void;
}

/** Memoized so toggling one row (which produces a new object only for that row)
 * doesn't re-render every other row — matters for large statements (100s of
 * rows). Relies on the parent passing stable callbacks and entity-list props. */
const ReviewRow = memo(function ReviewRow({
	row,
	currency,
	categories,
	incomes,
	accounts,
	onToggleSelect,
	onAssign,
}: ReviewRowProps) {
	const isNegative = signOf(row.parsed.amountMinor) < 0;
	const isSuggested =
		row.suggestedTransferAccountId !== undefined &&
		row.assignment?.kind === 'transfer' &&
		row.assignment.accountId === row.suggestedTransferAccountId;
	// Scan cues for long statements: flag rows that will import but still need a
	// category (amber edge + wash), dim rows that won't import, leave ready rows
	// plain. A constant transparent left border keeps content aligned across
	// states so toggling a row doesn't shift its text.
	const needsCategory = row.selected && row.assignment === null;
	const excluded = !row.selected;
	const stateClass = needsCategory
		? 'border-l-warning bg-warning/10'
		: excluded
			? 'border-l-transparent opacity-50'
			: 'border-l-transparent';
	return (
		<View
			className={`flex-row items-start border-b border-l-4 border-paper-200 py-3 pl-2 ${stateClass}`}
		>
			<Pressable
				testID={`import-review-row-select-${row.parsed.rowIndex}`}
				onPress={() => onToggleSelect(row.parsed.rowIndex)}
				hitSlop={12}
				className={`mr-3 mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${
					row.selected ? 'border-ink bg-ink' : 'border-paper-300'
				}`}
			>
				{row.selected ? <Check size={16} color={colors.paper[50]} /> : null}
			</Pressable>
			<View className="flex-1">
				<View className="flex-row items-center justify-between">
					<Text className="font-sans text-xs text-ink-muted">
						{new Date(row.parsed.dateMs).toLocaleDateString()}
					</Text>
					<Text
						className={`font-sans-semibold text-sm ${isNegative ? 'text-ink' : 'text-positive'}`}
					>
						{formatAmount(row.parsed.amountMinor, currency)}
					</Text>
				</View>
				<Text className="font-sans text-sm text-ink" numberOfLines={1}>
					{row.parsed.description || 'No description'}
				</Text>
				{row.status === 'duplicate' ? (
					<View className="mt-1 self-start rounded-full bg-paper-200 px-2 py-0.5">
						<Text className="font-sans text-[10px] text-ink-muted">Already have</Text>
					</View>
				) : null}
				{/* New rows always need categorizing; a duplicate only once the user
				    ticks it to import anyway. */}
				{row.status === 'new' || row.selected ? (
					<View className="flex-row items-center gap-2">
						<Pressable
							testID={`import-review-assign-${row.parsed.rowIndex}`}
							onPress={() => onAssign(row.parsed.rowIndex, isNegative ? -1 : 1)}
							className={`mt-1 flex-row items-center self-start rounded-full px-3 py-1 ${
								row.assignment ? 'bg-paper-200' : 'bg-warning/20'
							}`}
						>
							<Text className="font-sans text-xs text-ink">
								{assignmentLabel(
									row.assignment,
									isNegative,
									categories,
									incomes,
									accounts
								)}
							</Text>
						</Pressable>
						{isSuggested ? (
							<Text
								testID={`import-review-suggested-${row.parsed.rowIndex}`}
								className="mt-1 font-sans text-[10px] text-info"
							>
								Suggested
							</Text>
						) : null}
					</View>
				) : null}
			</View>
		</View>
	);
});

export function StepReview({
	rows,
	onRowsChange,
	categories,
	incomes,
	accounts,
	currency,
	onCommit,
	committing,
}: StepReviewProps) {
	const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
	const [newCategoryRowIndex, setNewCategoryRowIndex] = useState<number | null>(null);
	const [propagatePrompt, setPropagatePrompt] = useState<PropagatePrompt | null>(null);

	// Latest rows in a ref so the mutation callbacks below can stay referentially
	// stable (deps: [onRowsChange] only) — otherwise every keystroke/toggle would
	// give ReviewRow new callback props and defeat its memoization.
	const rowsRef = useRef(rows);
	rowsRef.current = rows;

	const newCount = useMemo(() => rows.filter((r) => r.status === 'new').length, [rows]);
	const dupCount = useMemo(() => rows.filter((r) => r.status === 'duplicate').length, [rows]);
	// Every selected row imports, regardless of status — a ticked duplicate is an
	// explicit opt-in.
	const selectedCount = useMemo(() => rows.filter((r) => r.selected).length, [rows]);
	const allNewSelected = useMemo(
		() => newCount > 0 && rows.every((r) => r.status !== 'new' || r.selected),
		[rows, newCount]
	);

	const canCommit =
		!committing &&
		rows.every((r) => !r.selected || r.assignment !== null) &&
		rows.some((r) => r.selected);

	const applyAssignment = useCallback(
		(rowIndexes: number[], assignment: Assignment) => {
			const set = new Set(rowIndexes);
			onRowsChange(
				rowsRef.current.map((r) => (set.has(r.parsed.rowIndex) ? { ...r, assignment } : r))
			);
		},
		[onRowsChange]
	);

	const toggleSelected = useCallback(
		(rowIndex: number) => {
			onRowsChange(
				rowsRef.current.map((r) =>
					r.parsed.rowIndex === rowIndex ? { ...r, selected: !r.selected } : r
				)
			);
		},
		[onRowsChange]
	);

	const setAllNewSelected = useCallback(
		(value: boolean) => {
			onRowsChange(
				rowsRef.current.map((r) => (r.status === 'new' ? { ...r, selected: value } : r))
			);
		},
		[onRowsChange]
	);

	const openSheetFor = useCallback((rowIndex: number, sign: Sign) => {
		setSheetTarget({ rowIndex, sign });
	}, []);

	// After a single-row assignment, offer to apply it to other UNASSIGNED,
	// selected, same-sign, same-description rows (e.g. every "S-market" → the
	// same category). Never touches already-assigned rows.
	const offerPropagation = useCallback(
		(sourceRowIndex: number, assignment: Assignment) => {
			const cur = rowsRef.current;
			const source = cur.find((r) => r.parsed.rowIndex === sourceRowIndex);
			if (!source) return;
			const key = normalizeDescription(source.parsed.description);
			if (!key) return;
			const sign = signOf(source.parsed.amountMinor);
			const candidateIndexes = cur
				.filter(
					(r) =>
						r.parsed.rowIndex !== sourceRowIndex &&
						r.status === 'new' &&
						r.selected &&
						r.assignment === null &&
						signOf(r.parsed.amountMinor) === sign &&
						normalizeDescription(r.parsed.description) === key
				)
				.map((r) => r.parsed.rowIndex);
			if (candidateIndexes.length === 0) return;
			setPropagatePrompt({
				assignment,
				candidateIndexes,
				label: assignmentLabel(assignment, sign < 0, categories, incomes, accounts),
				description: source.parsed.description.trim(),
			});
		},
		[categories, incomes, accounts]
	);

	const finishAssignment = useCallback(
		(rowIndex: number, assignment: Assignment) => {
			applyAssignment([rowIndex], assignment);
			offerPropagation(rowIndex, assignment);
		},
		[applyAssignment, offerPropagation]
	);

	// Categories the user created earlier in this import, keyed by trimmed name
	// (dedup key, first draft wins — matches buildImportTransactions). Kept so
	// later rows can reuse a just-created category instead of it going stale.
	const stagedCategoryDrafts = useMemo(() => {
		const map = new Map<string, EntityDraft>();
		for (const r of rows) {
			if (r.assignment?.kind !== 'newCategory') continue;
			const name = r.assignment.draft.name.trim();
			if (name && !map.has(name)) map.set(name, r.assignment.draft);
		}
		return map;
	}, [rows]);

	const handleEntitySelected = useCallback(
		(entity: Entity) => {
			const target = sheetTarget;
			if (!target) return;
			setSheetTarget(null);
			if (entity.id === NEW_CATEGORY_SENTINEL_ID) {
				setNewCategoryRowIndex(target.rowIndex);
				return;
			}
			if (entity.id.startsWith(STAGED_CATEGORY_PREFIX)) {
				const draft = stagedCategoryDrafts.get(
					entity.id.slice(STAGED_CATEGORY_PREFIX.length)
				);
				if (draft) finishAssignment(target.rowIndex, { kind: 'newCategory', draft });
				return;
			}
			const assignment: Assignment =
				entity.type === 'account'
					? { kind: 'transfer', accountId: entity.id }
					: entity.type === 'income'
						? { kind: 'income', entityId: entity.id }
						: { kind: 'category', entityId: entity.id };
			finishAssignment(target.rowIndex, assignment);
		},
		[sheetTarget, finishAssignment, stagedCategoryDrafts]
	);

	const handleNewCategoryDraft = useCallback(
		(draft: EntityDraft) => {
			if (newCategoryRowIndex === null) return;
			const rowIndex = newCategoryRowIndex;
			setNewCategoryRowIndex(null);
			finishAssignment(rowIndex, { kind: 'newCategory', draft });
		},
		[newCategoryRowIndex, finishAssignment]
	);

	const confirmPropagation = useCallback(() => {
		if (!propagatePrompt) return;
		applyAssignment(propagatePrompt.candidateIndexes, propagatePrompt.assignment);
		setPropagatePrompt(null);
	}, [propagatePrompt, applyAssignment]);

	const sheetEntities = useMemo(() => {
		if (!sheetTarget) return [];
		if (sheetTarget.sign < 0) {
			const stagedPseudos: Entity[] = [...stagedCategoryDrafts.values()].map((draft) => ({
				id: STAGED_CATEGORY_PREFIX + draft.name.trim(),
				type: 'category',
				name: draft.name,
				currency,
				icon: draft.icon || 'plus',
				color: draft.color,
				row: 0,
				position: 0,
			}));
			const newCategoryPseudo: Entity = {
				id: NEW_CATEGORY_SENTINEL_ID,
				type: 'category',
				name: '＋ New category',
				currency,
				icon: 'plus',
				row: 0,
				position: 0,
			};
			return [...categories, ...stagedPseudos, ...accounts, newCategoryPseudo];
		}
		return [...incomes, ...accounts];
	}, [sheetTarget, categories, incomes, accounts, currency, stagedCategoryDrafts]);

	const sheetSelectedId = useMemo(() => {
		if (!sheetTarget) return null;
		const row = rows.find((r) => r.parsed.rowIndex === sheetTarget.rowIndex);
		const a = row?.assignment;
		if (!a) return null;
		if (a.kind === 'category' || a.kind === 'income') return a.entityId;
		if (a.kind === 'transfer') return a.accountId;
		if (a.kind === 'newCategory') return STAGED_CATEGORY_PREFIX + a.draft.name.trim();
		return null;
	}, [sheetTarget, rows]);

	const renderItem = useCallback(
		({ item }: { item: ReconciledRow }) => (
			<ReviewRow
				row={item}
				currency={currency}
				categories={categories}
				incomes={incomes}
				accounts={accounts}
				onToggleSelect={toggleSelected}
				onAssign={openSheetFor}
			/>
		),
		[currency, categories, incomes, accounts, toggleSelected, openSheetFor]
	);

	const keyExtractor = useCallback((item: ReconciledRow) => String(item.parsed.rowIndex), []);

	return (
		<View className="flex-1">
			<View className="flex-row items-center justify-between px-5 pb-2 pt-4">
				<Text className="font-sans text-sm text-ink-muted">
					{newCount} new · {dupCount} already have
				</Text>
				{newCount > 0 ? (
					<Pressable
						testID="import-review-select-all"
						onPress={() => setAllNewSelected(!allNewSelected)}
						hitSlop={12}
					>
						<Text className="font-sans-semibold text-sm text-info">
							{allNewSelected ? 'Select none' : 'Select all'}
						</Text>
					</Pressable>
				) : null}
			</View>

			<FlatList
				data={rows}
				keyExtractor={keyExtractor}
				renderItem={renderItem}
				className="flex-1 px-5"
				initialNumToRender={15}
				maxToRenderPerBatch={12}
				windowSize={11}
				removeClippedSubviews={false}
				keyboardShouldPersistTaps="handled"
				ListEmptyComponent={
					<Text className="mt-8 text-center font-sans text-sm text-ink-muted">
						No rows to review.
					</Text>
				}
			/>

			<Pressable
				testID={TestIDs.importReviewConfirm}
				disabled={!canCommit}
				onPress={onCommit}
				className={`mx-5 my-4 items-center rounded-full py-3 ${canCommit ? 'bg-ink' : 'bg-paper-200'}`}
			>
				{committing ? (
					<ActivityIndicator color={colors.paper[50]} />
				) : (
					<Text
						className={`font-sans-semibold text-base ${
							canCommit ? 'text-paper-50' : 'text-ink-muted'
						}`}
					>
						Import {selectedCount} transaction{selectedCount === 1 ? '' : 's'}
					</Text>
				)}
			</Pressable>

			<EntitySelectionSheet
				visible={sheetTarget !== null}
				title={sheetTarget && sheetTarget.sign < 0 ? 'Categorize' : 'Source of income'}
				entities={sheetEntities}
				selectedId={sheetSelectedId}
				onSelect={handleEntitySelected}
				onClose={() => setSheetTarget(null)}
				testID="import-review-entity-sheet"
			/>

			<EntityCreateModal
				visible={newCategoryRowIndex !== null}
				entityType="category"
				onClose={() => setNewCategoryRowIndex(null)}
				onCreate={handleNewCategoryDraft}
			/>

			<Modal
				visible={propagatePrompt !== null}
				transparent
				animationType="fade"
				onRequestClose={() => setPropagatePrompt(null)}
			>
				<Pressable
					className="flex-1 items-center justify-center bg-black/25"
					onPress={() => setPropagatePrompt(null)}
				>
					<Pressable onPress={() => {}} className="w-4/5 rounded-2xl bg-paper-50 p-5">
						<Text className="mb-2 font-sans-semibold text-base text-ink">
							Apply to similar rows?
						</Text>
						{propagatePrompt ? (
							<Text className="font-sans text-sm text-ink-muted">
								{propagatePrompt.candidateIndexes.length} other{' '}
								{propagatePrompt.candidateIndexes.length === 1 ? 'row' : 'rows'}{' '}
								match “{propagatePrompt.description}”. Assign{' '}
								{propagatePrompt.label} to{' '}
								{propagatePrompt.candidateIndexes.length === 1 ? 'it' : 'them'} too?
							</Text>
						) : null}
						<View className="mt-4 flex-row justify-end gap-4">
							<Pressable
								testID="import-review-propagate-skip"
								onPress={() => setPropagatePrompt(null)}
								hitSlop={12}
							>
								<Text className="font-sans text-base text-ink-muted">
									Just this one
								</Text>
							</Pressable>
							<Pressable
								testID="import-review-propagate-apply"
								onPress={confirmPropagation}
								hitSlop={12}
							>
								<Text className="font-sans-semibold text-base text-accent">
									Apply to all
								</Text>
							</Pressable>
						</View>
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	);
}
