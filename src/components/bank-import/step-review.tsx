import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/src/components/text';
import { TestIDs } from '@/e2e/support/test-ids';
import { formatAmount } from '@/src/utils/format';
import { colors } from '@/src/theme/colors';
import { EntitySelectionSheet } from '@/src/components/entity-selection-sheet';
import { sharedTextInputProps, textInputClassNames } from '@/src/styles/text-input';
import type { Entity } from '@/src/types';
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

type Sign = -1 | 1;

interface SheetTarget {
	rowIndexes: number[];
	sign: Sign;
}

function signOf(amountMinor: number): Sign {
	return amountMinor < 0 ? -1 : 1;
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
			return `New: ${assignment.name}`;
	}
}

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
	const [bulkMode, setBulkMode] = useState(false);
	const [bulkChecked, setBulkChecked] = useState<Set<number>>(new Set());
	const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
	const [categoryPrompt, setCategoryPrompt] = useState<{ rowIndexes: number[] } | null>(null);
	const [categoryName, setCategoryName] = useState('');

	const newCount = useMemo(() => rows.filter((r) => r.status === 'new').length, [rows]);
	const dupCount = useMemo(() => rows.filter((r) => r.status === 'duplicate').length, [rows]);
	const selectedCount = useMemo(() => rows.filter((r) => r.selected).length, [rows]);

	const canCommit =
		!committing &&
		rows.every((r) => !(r.selected && r.status === 'new') || r.assignment !== null) &&
		rows.some((r) => r.selected && r.status === 'new');

	const updateRow = useCallback(
		(rowIndex: number, patch: Partial<ReconciledRow>) => {
			onRowsChange(
				rows.map((r) => (r.parsed.rowIndex === rowIndex ? { ...r, ...patch } : r))
			);
		},
		[rows, onRowsChange]
	);

	const applyAssignment = useCallback(
		(rowIndexes: number[], assignment: Assignment) => {
			onRowsChange(
				rows.map((r) => (rowIndexes.includes(r.parsed.rowIndex) ? { ...r, assignment } : r))
			);
		},
		[rows, onRowsChange]
	);

	const toggleSelected = (rowIndex: number) => {
		const row = rows.find((r) => r.parsed.rowIndex === rowIndex);
		if (!row) return;
		updateRow(rowIndex, { selected: !row.selected });
	};

	const toggleBulkChecked = (rowIndex: number, sign: Sign) => {
		setBulkChecked((prev) => {
			const next = new Set(prev);
			if (next.has(rowIndex)) {
				next.delete(rowIndex);
				return next;
			}
			// Bulk assignment targets a single entity list (categories+accounts, or
			// incomes+accounts), so once a sign is established, ignore taps on rows
			// of the opposite sign rather than mixing incompatible pickers.
			if (next.size > 0) {
				const firstIdx = [...next][0];
				if (firstIdx !== undefined) {
					const firstRow = rows.find((r) => r.parsed.rowIndex === firstIdx);
					if (firstRow && signOf(firstRow.parsed.amountMinor) !== sign) return prev;
				}
			}
			next.add(rowIndex);
			return next;
		});
	};

	const closeBulk = () => {
		setBulkMode(false);
		setBulkChecked(new Set());
	};

	const openSheetFor = (rowIndexes: number[], sign: Sign) => setSheetTarget({ rowIndexes, sign });

	const openBulkSheet = () => {
		const idxs = [...bulkChecked];
		const firstIdx = idxs[0];
		if (firstIdx === undefined) return;
		const firstRow = rows.find((r) => r.parsed.rowIndex === firstIdx);
		if (!firstRow) return;
		openSheetFor(idxs, signOf(firstRow.parsed.amountMinor));
	};

	const handleEntitySelected = (entity: Entity) => {
		if (!sheetTarget) return;
		const { rowIndexes } = sheetTarget;
		if (entity.id === NEW_CATEGORY_SENTINEL_ID) {
			setSheetTarget(null);
			setCategoryName('');
			setCategoryPrompt({ rowIndexes });
			return;
		}
		if (entity.type === 'account') {
			applyAssignment(rowIndexes, { kind: 'transfer', accountId: entity.id });
		} else if (entity.type === 'income') {
			applyAssignment(rowIndexes, { kind: 'income', entityId: entity.id });
		} else {
			applyAssignment(rowIndexes, { kind: 'category', entityId: entity.id });
		}
		setSheetTarget(null);
		if (bulkMode) closeBulk();
	};

	const confirmNewCategory = () => {
		const name = categoryName.trim();
		if (!name || !categoryPrompt) return;
		applyAssignment(categoryPrompt.rowIndexes, { kind: 'newCategory', name });
		setCategoryPrompt(null);
		setCategoryName('');
		if (bulkMode) closeBulk();
	};

	const sheetEntities = useMemo(() => {
		if (!sheetTarget) return [];
		if (sheetTarget.sign < 0) {
			const newCategoryPseudo: Entity = {
				id: NEW_CATEGORY_SENTINEL_ID,
				type: 'category',
				name: '＋ New category',
				currency,
				icon: 'plus',
				row: 0,
				position: 0,
			};
			return [...categories, ...accounts, newCategoryPseudo];
		}
		return [...incomes, ...accounts];
	}, [sheetTarget, categories, incomes, accounts, currency]);

	const sheetSelectedId = useMemo(() => {
		if (!sheetTarget || sheetTarget.rowIndexes.length !== 1) return null;
		const rowIndex = sheetTarget.rowIndexes[0];
		const row = rows.find((r) => r.parsed.rowIndex === rowIndex);
		const a = row?.assignment;
		if (!a) return null;
		if (a.kind === 'category' || a.kind === 'income') return a.entityId;
		if (a.kind === 'transfer') return a.accountId;
		return null;
	}, [sheetTarget, rows]);

	return (
		<View className="flex-1">
			<View className="flex-row items-center justify-between px-5 pb-2 pt-4">
				<Text className="font-sans text-sm text-ink-muted">
					{newCount} new · {dupCount} already have
				</Text>
				{newCount > 1 ? (
					<Pressable
						testID="import-review-bulk-toggle"
						onPress={() => (bulkMode ? closeBulk() : setBulkMode(true))}
						hitSlop={12}
					>
						<Text
							className={`font-sans-semibold text-sm ${bulkMode ? 'text-accent' : 'text-info'}`}
						>
							{bulkMode ? 'Done' : 'Select'}
						</Text>
					</Pressable>
				) : null}
			</View>

			<ScrollView className="flex-1 px-5">
				{rows.length === 0 ? (
					<Text className="mt-8 text-center font-sans text-sm text-ink-muted">
						No rows to review.
					</Text>
				) : (
					rows.map((row) => {
						const isNegative = signOf(row.parsed.amountMinor) < 0;
						const isBulkChecked = bulkChecked.has(row.parsed.rowIndex);
						return (
							<View
								key={row.parsed.rowIndex}
								className="flex-row items-start border-b border-paper-200 py-3"
							>
								<Pressable
									testID={`import-review-row-select-${row.parsed.rowIndex}`}
									onPress={() => toggleSelected(row.parsed.rowIndex)}
									hitSlop={12}
									className={`mr-3 mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${
										row.selected ? 'border-ink bg-ink' : 'border-paper-300'
									}`}
								>
									{row.selected ? (
										<Check size={16} color={colors.paper[50]} />
									) : null}
								</Pressable>
								<View className="flex-1">
									<View className="flex-row items-center justify-between">
										<Text className="font-sans text-xs text-ink-muted">
											{new Date(row.parsed.dateMs).toLocaleDateString()}
										</Text>
										<Text
											className={`font-sans-semibold text-sm ${
												isNegative ? 'text-ink' : 'text-positive'
											}`}
										>
											{formatAmount(row.parsed.amountMinor, currency)}
										</Text>
									</View>
									<Text className="font-sans text-sm text-ink" numberOfLines={1}>
										{row.parsed.description || 'No description'}
									</Text>
									{row.status === 'duplicate' ? (
										<View className="mt-1 self-start rounded-full bg-paper-200 px-2 py-0.5">
											<Text className="font-sans text-[10px] text-ink-muted">
												Already have
											</Text>
										</View>
									) : (
										<Pressable
											testID={`import-review-assign-${row.parsed.rowIndex}`}
											onPress={() =>
												bulkMode
													? toggleBulkChecked(
															row.parsed.rowIndex,
															isNegative ? -1 : 1
														)
													: openSheetFor(
															[row.parsed.rowIndex],
															isNegative ? -1 : 1
														)
											}
											className={`mt-1 flex-row items-center self-start rounded-full px-3 py-1 ${
												row.assignment ? 'bg-paper-200' : 'bg-warning/20'
											} ${isBulkChecked ? 'border border-accent' : ''}`}
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
									)}
								</View>
							</View>
						);
					})
				)}
			</ScrollView>

			{bulkMode && bulkChecked.size > 0 ? (
				<Pressable
					testID="import-review-bulk-assign"
					onPress={openBulkSheet}
					className="mx-5 mb-2 items-center rounded-full bg-ink py-2.5"
				>
					<Text className="font-sans-semibold text-sm text-paper-50">
						Assign {bulkChecked.size} selected
					</Text>
				</Pressable>
			) : null}

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

			<Modal
				visible={categoryPrompt !== null}
				transparent
				animationType="fade"
				onRequestClose={() => setCategoryPrompt(null)}
			>
				<Pressable
					className="flex-1 items-center justify-center bg-black/25"
					onPress={() => setCategoryPrompt(null)}
				>
					<Pressable onPress={() => {}} className="w-4/5 rounded-2xl bg-paper-50 p-5">
						<Text className="mb-3 font-sans-semibold text-base text-ink">
							New category name
						</Text>
						<TextInput
							{...sharedTextInputProps}
							autoFocus
							value={categoryName}
							onChangeText={setCategoryName}
							placeholder="e.g. Groceries"
							placeholderTextColor={colors.ink.placeholder}
							className={`${textInputClassNames.container} ${textInputClassNames.input}`}
							testID="import-review-new-category-input"
						/>
						<View className="mt-4 flex-row justify-end gap-4">
							<Pressable onPress={() => setCategoryPrompt(null)} hitSlop={12}>
								<Text className="font-sans text-base text-ink-muted">Cancel</Text>
							</Pressable>
							<Pressable
								testID="import-review-new-category-confirm"
								onPress={confirmNewCategory}
								disabled={!categoryName.trim()}
								hitSlop={12}
							>
								<Text
									className={`font-sans-semibold text-base ${
										categoryName.trim() ? 'text-accent' : 'text-ink-muted'
									}`}
								>
									Add
								</Text>
							</Pressable>
						</View>
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	);
}
