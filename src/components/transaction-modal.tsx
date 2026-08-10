import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, TextInput, Pressable, Platform, Alert } from 'react-native';
import { Text } from './text';
import {
	KeyboardAwareScrollView,
	KeyboardController,
	KeyboardExtender,
} from 'react-native-keyboard-controller';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { PageSheetModal } from './page-sheet-modal';
import {
	ArrowRight,
	Calendar,
	Pencil,
	Split,
	Plus,
	X,
	Repeat,
	CircleCheck,
} from 'lucide-react-native';
import type { RecurrenceFrequency } from '@/src/types/recurrence';

import type { Entity, EntityWithBalance, Transaction } from '@/src/types';
import {
	formatAmount,
	formatAmountForInput,
	parseAmountToMinor,
	DEFAULT_CURRENCY,
	formatFullDate,
	getCurrencySymbol,
} from '@/src/utils/format';
import { useStore, useEntitiesWithBalance } from '@/src/store';
import {
	sharedNumericTextInputProps,
	sharedTextInputProps,
	styles,
	textInputClassNames,
} from '../styles/text-input';
import {
	getValidFromEntities,
	getValidToEntities,
	TransactionValidationError,
} from '@/src/utils/transaction-validation';
import {
	buildSavingsReleases,
	buildSplitRows,
	buildTransaction,
	normalizeCreateTimestamp,
} from '@/src/utils/transaction-builder';
import { generateId } from '@/src/utils/ids';
import { DateQuickPresets, type DatePreset } from './date-quick-presets';
import { shiftCivilDate } from '@/src/utils/date-shift';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { EntitySelectionSheet } from './entity-selection-sheet';
import { SavingsFundingSection, type SavingsFundingHandle } from './savings-funding-section';
import { OperatorToolbar } from './operator-toolbar';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { getEntityDisplayName, isEntityActive } from '@/src/utils/entity-display';
import { normalizeNumericInput } from '@/src/utils/numeric-input';
import { useExpressionInput } from '@/src/hooks/use-expression-input';
import { useConfirmTransaction } from '@/src/hooks/use-confirm-transaction';
import { getCurrencyDecimalPlaces } from '@/src/utils/currency-precision';
import { sanitizeAmountInput } from '@/src/utils/sanitize-amount';
import { InfoPin } from '@/src/components/info-pin';
import {
	showSeriesDeleteConfirm,
	showSeriesScopeAlert,
	type SeriesScope,
} from './series-action-sheet';

const isEntityWithBalance: (e: Entity | EntityWithBalance | null) => e is EntityWithBalance = (e) =>
	e !== null && 'actual' in e;

interface SplitRow {
	id: string;
	toEntityId: string | null;
	// amount is ignored for row 0 (anchor); anchor amount is always derived
	amount: string;
}

interface TransactionModalProps {
	visible: boolean;
	fromEntity: EntityWithBalance | null;
	toEntity: EntityWithBalance | null;
	onClose: () => void;
	existingTransaction?: Transaction;
	/** Opens in quick-add mode: entity pickers shown upfront, no drag required */
	quickAdd?: boolean;
	seriesScope?: SeriesScope;
}

export function TransactionModal({
	visible,
	fromEntity,
	toEntity,
	onClose,
	existingTransaction,
	quickAdd,
	seriesScope,
}: TransactionModalProps) {
	const [amount, setAmount] = useState('');
	const [note, setNote] = useState('');
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [showDatePicker, setShowDatePicker] = useState(false);
	const [selectedFromId, setSelectedFromId] = useState<string | null>(null);
	const [selectedToId, setSelectedToId] = useState<string | null>(null);
	const [showFromSheet, setShowFromSheet] = useState(false);
	const [showToSheet, setShowToSheet] = useState(false);

	// Split mode
	const [isSplitMode, setIsSplitMode] = useState(false);
	const [splits, setSplits] = useState<SplitRow[]>([]);
	const [activeSplitIndex, setActiveSplitIndex] = useState<number | null>(null);
	// Snapshot of amount when split mode was entered (integer minor units,
	// KII-120) — drives the anchor calculation
	const [splitTotalMinor, setSplitTotalMinor] = useState(0);
	// Raw input string while editing splitTotal — preserves trailing/leading
	// separators that the numeric `splitTotal` cannot round-trip (e.g. "5.").
	const [splitTotalDraft, setSplitTotalDraft] = useState('');

	// Savings funding — portion of typed amount sourced from savings reservations
	// (integer minor units, KII-120)
	const [totalFundedMinor, setTotalFundedMinor] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const inputRef = useRef<TextInput>(null);
	const fundingRef = useRef<SavingsFundingHandle>(null);
	const [isRepeat, setIsRepeat] = useState(false);
	const [repeatFrequency, setRepeatFrequency] = useState<RecurrenceFrequency>('monthly');
	const [repeatEndMode, setRepeatEndMode] = useState<'never' | 'until' | 'count'>('never');
	const [repeatEndDate, setRepeatEndDate] = useState<Date | null>(null);
	const [showRepeatEndDatePicker, setShowRepeatEndDatePicker] = useState(false);
	const [repeatEndCount, setRepeatEndCount] = useState('');

	const createTransactionBatch = useStore((state) => state.createTransactionBatch);
	const updateTransaction = useStore((state) => state.updateTransaction);
	const updateTransactionWithScope = useStore((state) => state.updateTransactionWithScope);
	const deleteTransaction = useStore((state) => state.deleteTransaction);
	const deleteTransactionWithScope = useStore((state) => state.deleteTransactionWithScope);
	const materializeOccurrence = useStore((state) => state.materializeOccurrence);
	const excludeOccurrence = useStore((state) => state.excludeOccurrence);
	const replaceTransactionWithSplit = useStore((state) => state.replaceTransactionWithSplit);
	const addRecurringTransaction = useStore((state) => state.addRecurringTransaction);

	const confirmTransactionFlow = useConfirmTransaction();

	const accounts = useEntitiesWithBalance('account');
	const categories = useEntitiesWithBalance('category');
	const income = useEntitiesWithBalance('income');
	const savings = useEntitiesWithBalance('saving');
	const entities = useMemo(
		() => [...accounts, ...categories, ...income, ...savings],
		[accounts, categories, income, savings]
	);

	const isEditing = !!existingTransaction;

	const selectedFromEntity = useMemo(
		() => (selectedFromId ? (entities.find((e) => e.id === selectedFromId) ?? null) : null),
		[selectedFromId, entities]
	);

	const selectedToEntity = useMemo(
		() => (selectedToId ? (entities.find((e) => e.id === selectedToId) ?? null) : null),
		[selectedToId, entities]
	);

	// In quickAdd mode, currency follows the selected from-entity
	const currency =
		existingTransaction?.currency ??
		selectedFromEntity?.currency ??
		fromEntity?.currency ??
		DEFAULT_CURRENCY;

	const maxDecimalPlaces = useMemo(() => getCurrencyDecimalPlaces(currency), [currency]);

	const amountExpr = useExpressionInput(
		isSplitMode ? splitTotalDraft : amount,
		useCallback(
			(v: string) => {
				if (isSplitMode) {
					setSplitTotalDraft(v);
					const n = parseAmountToMinor(
						sanitizeAmountInput(v, { maxDecimalPlaces }),
						currency
					);
					setSplitTotalMinor(Number.isFinite(n) ? n : 0);
				} else {
					setAmount(v);
				}
			},
			[isSplitMode, maxDecimalPlaces, currency]
		),
		{ maxDecimalPlaces }
	);

	const validFromEntities = useMemo(() => {
		if (!selectedToEntity) return [];
		return getValidFromEntities(entities, selectedToEntity, currency);
	}, [selectedToEntity, entities, currency]);

	// In quickAdd mode, valid from-sources are income + account entities (things that can send money)
	const quickAddFromEntities = useMemo(() => {
		if (!quickAdd) return [];
		return entities.filter(
			(e) =>
				(e.type === 'income' || e.type === 'account' || e.type === 'category') &&
				isEntityActive(e) &&
				e.id !== BALANCE_ADJUSTMENT_ENTITY_ID
		);
	}, [quickAdd, entities]);

	const validToEntities = useMemo(() => {
		if (!selectedFromEntity) return [];
		return getValidToEntities(
			entities,
			selectedFromEntity,
			currency,
			selectedFromId ?? undefined
		);
	}, [selectedFromEntity, entities, currency, selectedFromId]);

	// Valid targets for split entity picker
	const validSplitTargets = useMemo(() => {
		const source = selectedFromEntity ?? fromEntity;
		if (!source) return [];
		return getValidToEntities(entities, source, currency);
	}, [selectedFromEntity, fromEntity, entities, currency]);

	// Anchor = typed total - sum of all non-anchor splits (integer minor units,
	// KII-120). Row 0 is always the anchor; its amount field in state is ignored.
	const anchorAmountMinor = useMemo(() => {
		if (!isSplitMode) return 0;
		const otherSum = splits.slice(1).reduce((sum, s) => {
			const n = parseAmountToMinor(s.amount, currency);
			return sum + (Number.isFinite(n) ? n : 0);
		}, 0);
		return splitTotalMinor - otherSum;
	}, [isSplitMode, splits, splitTotalMinor, currency]);

	useEffect(() => {
		if (visible) {
			if (existingTransaction) {
				setAmount(
					formatAmountForInput(
						existingTransaction.amount_minor,
						existingTransaction.currency
					)
				);
				setNote(existingTransaction.note ?? '');
				setSelectedDate(new Date(existingTransaction.timestamp));
				setSelectedFromId(existingTransaction.from_entity_id);
				setSelectedToId(existingTransaction.to_entity_id);
			} else {
				setAmount('');
				setNote('');
				setSelectedDate(new Date());
				// Pre-fill with default account in quickAdd mode
				const currentEntities = useStore.getState().entities;
				const defaultAccount = quickAdd
					? currentEntities.find(
							(e) => e.type === 'account' && e.is_default && !e.is_deleted
						)
					: null;
				setSelectedFromId(fromEntity?.id ?? defaultAccount?.id ?? null);
				setSelectedToId(toEntity?.id ?? null);
			}
			setShowDatePicker(false);
			setShowFromSheet(false);
			setShowToSheet(false);
			setIsSplitMode(false);
			setSplits([]);
			setSplitTotalMinor(0);
			setSplitTotalDraft('');
			setActiveSplitIndex(null);
			setTotalFundedMinor(0);
			setIsSubmitting(false);
			setIsRepeat(false);
			setRepeatFrequency('monthly');
			setRepeatEndMode('never');
			setRepeatEndDate(null);
			setShowRepeatEndDatePicker(false);
			setRepeatEndCount('');
			const ref = amountExpr.inputRef;
			setTimeout(() => ref.current?.focus(), 100);
		}
	}, [visible, existingTransaction, quickAdd, amountExpr.inputRef, fromEntity?.id, toEntity?.id]);

	const handleFromSelect = (entity: Entity) => {
		setSelectedFromId(entity.id);
		let toInvalidated = false;
		if (selectedToId) {
			const validTos = getValidToEntities(entities, entity, currency, entity.id);
			if (!validTos.some((e) => e.id === selectedToId)) {
				setSelectedToId(null);
				toInvalidated = true;
			}
		}
		// Automatically advance to the to-entity picker when needed
		if (toInvalidated || (!isEditing && !selectedToId)) {
			setTimeout(() => setShowToSheet(true), 350);
		}
	};

	const handleToSelect = (entity: Entity) => {
		setSelectedToId(entity.id);
		// Focus amount field after picking destination
		if (!isEditing) {
			setTimeout(() => amountExpr.inputRef.current?.focus(), 350);
		}
	};

	const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
		if (Platform.OS === 'android') setShowDatePicker(false);
		if (date) setSelectedDate(date);
	};

	// Switching to a finite end mode without a value used to silently save as
	// "Never" (endDate/endCount both null). Seed a visible default so the value
	// rendered in the picker / input is also the value the save path uses.
	const handleSelectRepeatEndMode = (mode: 'never' | 'until' | 'count') => {
		setRepeatEndMode(mode);
		if (mode === 'until' && !repeatEndDate) {
			// Seed through `shiftCivilDate` so the default lands on exactly the value
			// the "+1 year" chip computes — `setFullYear` would turn Feb 29 into
			// Mar 1 and leave the seeded default with no chip selected.
			setRepeatEndDate(shiftCivilDate(selectedDate, { years: 1 }));
		} else if (mode === 'count' && !repeatEndCount) {
			setRepeatEndCount('12');
		}
	};

	// Preset dates carry `selectedDate`'s time-of-day onto the target civil day
	// rather than starting from a bare `new Date()`. The create path normalizes
	// time-of-day anyway (`normalizeCreateTimestamp`), but the edit path saves
	// `selectedDate.getTime()` raw — without this, tapping "Yesterday" on an
	// existing transaction would silently move its clock time too.
	//
	// Deliberately NOT memoized: it reads the clock. Memoizing on `selectedDate`
	// would let a modal left open across midnight keep highlighting "Today" on
	// what is now yesterday. Building two objects per render is cheaper than
	// that staleness.
	const datePresets = ((): DatePreset[] => {
		const now = new Date();
		const today = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			selectedDate.getHours(),
			selectedDate.getMinutes(),
			selectedDate.getSeconds(),
			selectedDate.getMilliseconds()
		);
		return [
			{ key: 'today', label: 'Today', date: today },
			{ key: 'yesterday', label: 'Yesterday', date: shiftCivilDate(today, { days: -1 }) },
		];
	})();

	// Duration presets, not calendar days: the until-date's real question is how
	// long the series should run, measured from the transaction date.
	const repeatEndPresets = useMemo(
		(): DatePreset[] => [
			{ key: '1m', label: '+1 month', date: shiftCivilDate(selectedDate, { months: 1 }) },
			{ key: '6m', label: '+6 months', date: shiftCivilDate(selectedDate, { months: 6 }) },
			{ key: '1y', label: '+1 year', date: shiftCivilDate(selectedDate, { years: 1 }) },
		],
		[selectedDate]
	);

	// ── Split mode handlers ───────────────────────────────────────────────────

	const handleEnterSplitMode = () => {
		const resolved = amountExpr.resolve();
		const totalMinor = parseAmountToMinor(resolved, currency);
		setSplitTotalMinor(Number.isFinite(totalMinor) ? totalMinor : 0);
		setSplitTotalDraft(resolved);
		setIsSplitMode(true);
		setSplits([
			// Row 0: anchor — follows current selection (handles edit and post-picker create)
			{ id: generateId(), toEntityId: selectedToId ?? toEntity?.id ?? null, amount: '' },
			// Row 1: first user-editable split
			{ id: generateId(), toEntityId: null, amount: '' },
		]);
	};

	// Collapse split mode back to single transaction
	const handleMerge = () => {
		setIsSplitMode(false);
		setSplits([]);
		// Restore the amount the user had typed before entering split mode
		setAmount(splitTotalMinor > 0 ? formatAmountForInput(splitTotalMinor, currency) : '');
		setSplitTotalMinor(0);
		setSplitTotalDraft('');
		setTimeout(() => amountExpr.inputRef.current?.focus(), 50);
	};

	const handleSplitEntitySelect = (entity: Entity) => {
		if (activeSplitIndex === null) return;
		setSplits((prev) =>
			prev.map((s, i) => (i === activeSplitIndex ? { ...s, toEntityId: entity.id } : s))
		);
		setActiveSplitIndex(null);
	};

	// Only non-anchor rows (index > 0) are user-editable
	const handleSplitAmountChange = (index: number, value: string) => {
		if (index === 0) return;
		setSplits((prev) =>
			prev.map((s, i) =>
				i === index
					? {
							...s,
							amount: normalizeNumericInput(
								sanitizeAmountInput(value, { maxDecimalPlaces })
							),
						}
					: s
			)
		);
	};

	const handleAddSplit = () =>
		setSplits((prev) => [...prev, { id: generateId(), toEntityId: null, amount: '' }]);

	// Minimum: anchor + 1 non-anchor row = 2 total; non-anchor rows only
	const handleRemoveSplit = (index: number) => {
		if (index === 0 || splits.length <= 2) return;
		setSplits((prev) => prev.filter((_, i) => i !== index));
	};

	// ── Delete ────────────────────────────────────────────────────────────────

	const handleDelete = useCallback(() => {
		if (!existingTransaction) return;
		// Close immediately so the user sees the row disappear; surface any
		// background failure via Alert. Caller does `onClose()` synchronously,
		// then `void runDelete(...)` to dispatch the async deletion.
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
		if (existingTransaction.series_id) {
			const deleteWithScope = (scope: SeriesScope) => {
				void KeyboardController.dismiss();
				onClose();
				void runDelete(async () => {
					// Single-scope delete of a virtual occurrence is just an exclusion —
					// no row exists, so skip the materialize-then-delete round-trip.
					if (existingTransaction.isVirtual && scope === 'single') {
						return excludeOccurrence(existingTransaction);
					}
					// Future-scope still needs a real row for the id-based scoped delete.
					if (existingTransaction.isVirtual)
						await materializeOccurrence(existingTransaction);
					return deleteTransactionWithScope(existingTransaction.id, scope);
				});
			};
			if (seriesScope) {
				// Scope was already chosen when this occurrence was opened for
				// editing — confirm, but don't ask the same question twice (KII-158).
				showSeriesDeleteConfirm(seriesScope, () => deleteWithScope(seriesScope));
			} else {
				// No scope picked up front (e.g. the refund picker opens the modal
				// directly), so this delete is the first chance to ask.
				showSeriesScopeAlert('delete', deleteWithScope);
			}
		} else {
			Alert.alert('Delete Transaction', 'Are you sure you want to delete this transaction?', [
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						void KeyboardController.dismiss();
						onClose();
						void runDelete(() => deleteTransaction(existingTransaction.id));
					},
				},
			]);
		}
	}, [
		existingTransaction,
		seriesScope,
		deleteTransaction,
		deleteTransactionWithScope,
		materializeOccurrence,
		excludeOccurrence,
		onClose,
	]);

	// ── Cancel ────────────────────────────────────────────────────────────────

	const handleCancel = useCallback(() => {
		void KeyboardController.dismiss();
		onClose();
	}, [onClose]);

	// ── Guard: require entities ───────────────────────────────────────────────

	if (isEditing) {
		if (!existingTransaction || !selectedFromId || !selectedToId) return null;
	} else if (!quickAdd) {
		if (!fromEntity || !toEntity) return null;
	}

	// All modes track selection via state; prop entities are fallback for first render
	const displayFromEntity = selectedFromEntity ?? fromEntity;
	const displayToEntity = selectedToEntity ?? toEntity;

	const getSuggestedAmount = (): number | null => {
		if (isEditing || !fromEntity || !toEntity || isSplitMode) return null;
		// Hide if user changed entities from the DnD originals
		if (displayFromEntity?.id !== fromEntity.id || displayToEntity?.id !== toEntity.id)
			return null;
		if (fromEntity.type === 'income')
			return fromEntity.remaining > 0 ? fromEntity.remaining : null;
		if (fromEntity.type === 'account' && toEntity.type === 'saving')
			return toEntity.remaining > 0 ? toEntity.remaining : null;
		return null;
	};
	const suggestedAmount = getSuggestedAmount();

	const entitiesSelected = !!(selectedFromId && selectedToId);

	const canSave = isSplitMode
		? // At least one saveable transaction: anchor with entity & positive amount, or any non-anchor with entity & positive amount
			(splits[0]?.toEntityId != null && anchorAmountMinor > 0) ||
			splits.slice(1).some((s) => s.toEntityId && parseAmountToMinor(s.amount, currency) > 0)
		: !!(amount && parseAmountToMinor(amount, currency) > 0) && entitiesSelected;

	// ── Submit ────────────────────────────────────────────────────────────────

	// Resolves to `true` only when the edit was persisted and the modal closed.
	// "Confirm now" chains off that: a failed or rejected save must not go on to
	// confirm (KII-159).
	const handleSubmit = async (): Promise<boolean> => {
		if (isSubmitting) return false;
		setIsSubmitting(true);

		// Resolve any pending calculator expression before submitting.
		// The split branches don't consume `resolvedAmount` (they use `splitTotal`);
		// calling .resolve() here still has the desired side effect of flushing the
		// pending expression in all paths.
		const resolvedAmount = amountExpr.resolve();

		try {
			// Editing a virtual occurrence: materialize it into a real row first so
			// every downstream edit path (split, scoped update, plain update) acts on
			// a persisted row addressed by its deterministic id.
			if (existingTransaction?.isVirtual) {
				await materializeOccurrence(existingTransaction);
			}

			const timestamp = isEditing
				? selectedDate.getTime()
				: normalizeCreateTimestamp(selectedDate);

			const splitFrom = displayFromEntity;
			// seriesScope === 'future' is gated out by the split-toggle visibility
			// condition; only 'single' or undefined can reach this branch.
			// replaceTransactionWithSplit handles series exclusion internally.
			if (isEditing && existingTransaction && isSplitMode && splitFrom) {
				const txns = buildSplitRows({
					fromEntityId: splitFrom.id,
					currency: splitFrom.currency,
					timestamp,
					note: note.trim() || undefined,
					splitTotalMinor,
					splits: splits.map((s) => ({ toEntityId: s.toEntityId, amount: s.amount })),
					// KII-146: re-splitting a row that is already a split leg keeps the
					// parent's group — the sub-legs still sum into the same original
					// bank charge, so reconciliation must still fold them into it.
					splitId: existingTransaction.split_id ?? undefined,
				});
				if (txns.length === 0) {
					setIsSubmitting(false);
					return false;
				}
				// No savings releases in edit-mode split: SavingsFundingSection is gated
				// on `!isEditing`, so `fundingRef.current` is null and no funded
				// reservations can be picked up here.
				await replaceTransactionWithSplit(existingTransaction.id, txns);
				void KeyboardController.dismiss();
				onClose();
				return true;
			}

			if (isSplitMode && splitFrom) {
				const txns = buildSplitRows({
					fromEntityId: splitFrom.id,
					currency: splitFrom.currency,
					timestamp,
					note: note.trim() || undefined,
					splitTotalMinor,
					splits: splits.map((s) => ({ toEntityId: s.toEntityId, amount: s.amount })),
				});

				if (txns.length === 0) {
					setIsSubmitting(false);
					return false;
				}

				const splitReleases = buildSavingsReleases({
					accountId: splitFrom.id,
					currency: splitFrom.currency,
					timestamp,
					funded: fundingRef.current?.getFundedReservations() ?? [],
				});

				// All split rows + their savings releases commit atomically: either
				// every row persists or none do (KII-116). Without this, a mid-loop
				// failure would leave orphaned partial-split transactions.
				await createTransactionBatch([...txns, ...splitReleases]);

				void KeyboardController.dismiss();
				onClose();
				return true;
			}

			const amountMinor = parseAmountToMinor(resolvedAmount, currency);
			if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
				setIsSubmitting(false);
				return false;
			}

			if (isEditing && existingTransaction) {
				const updates: {
					amount_minor?: number;
					note?: string;
					timestamp?: number;
					from_entity_id?: string;
					to_entity_id?: string;
				} = { amount_minor: amountMinor, note: note.trim() || undefined };
				// Only forward `timestamp` if the user actually changed the date.
				// In scope='future' updates this column is broadcast via SQL UPDATE …
				// WHERE timestamp >= ?, so sending the edited row's timestamp would
				// collapse every future occurrence onto that single date.
				if (timestamp !== existingTransaction.timestamp) updates.timestamp = timestamp;
				if (selectedFromId && selectedFromId !== existingTransaction.from_entity_id)
					updates.from_entity_id = selectedFromId;
				if (selectedToId && selectedToId !== existingTransaction.to_entity_id)
					updates.to_entity_id = selectedToId;
				if (seriesScope) {
					await updateTransactionWithScope(existingTransaction.id, updates, seriesScope);
				} else {
					await updateTransaction(existingTransaction.id, updates);
				}
			} else if (selectedFromEntity && selectedToEntity) {
				if (isRepeat) {
					await addRecurringTransaction(
						{
							from_entity_id: selectedFromEntity.id,
							to_entity_id: selectedToEntity.id,
							amount_minor: amountMinor,
							currency: selectedFromEntity.currency,
							timestamp,
							note: note.trim() || undefined,
						},
						{
							rule: { type: repeatFrequency },
							endDate:
								repeatEndMode === 'until' && repeatEndDate
									? repeatEndDate.getTime()
									: null,
							endCount:
								repeatEndMode === 'count' && repeatEndCount
									? parseInt(repeatEndCount, 10)
									: null,
						}
					);

					// Releases belong to the same user intent as the recurring transaction,
					// but the template + first occurrence already persisted above; we
					// commit releases as their own batch (still atomic among themselves).
					const accountId = selectedFromEntity.id;
					const releases = buildSavingsReleases({
						accountId,
						currency: selectedFromEntity.currency,
						timestamp,
						funded: fundingRef.current?.getFundedReservations() ?? [],
					});
					if (releases.length > 0) await createTransactionBatch(releases);
				} else {
					const mainTx = buildTransaction({
						from_entity_id: selectedFromEntity.id,
						to_entity_id: selectedToEntity.id,
						amount_minor: amountMinor,
						currency: selectedFromEntity.currency,
						timestamp,
						note: note.trim() || undefined,
					});
					const releases = buildSavingsReleases({
						accountId: selectedFromEntity.id,
						currency: selectedFromEntity.currency,
						timestamp,
						funded: fundingRef.current?.getFundedReservations() ?? [],
					});
					// Main tx + funding releases commit atomically (KII-116).
					await createTransactionBatch([mainTx, ...releases]);
				}
			} else {
				// Defensive fallback for the partial-selection state: no entity pair
				// to commit, but a funding ref might still have produced releases.
				// In edit mode the SavingsFundingSection is unmounted (gated on
				// `!isEditing`), so `fundingRef` is null and releases is empty —
				// this branch effectively no-ops in edit mode.
				const accountId = selectedFromEntity?.id ?? fromEntity?.id;
				const fundCurrency =
					selectedFromEntity?.currency ?? fromEntity?.currency ?? currency;
				if (accountId) {
					const releases = buildSavingsReleases({
						accountId,
						currency: fundCurrency,
						timestamp,
						funded: fundingRef.current?.getFundedReservations() ?? [],
					});
					if (releases.length > 0) await createTransactionBatch(releases);
				}
			}

			void KeyboardController.dismiss();
			onClose();
			return true;
		} catch (error) {
			console.error('Failed to save transaction:', error);
			setIsSubmitting(false);
			const detail =
				error instanceof TransactionValidationError
					? error.message
					: 'Could not save the transaction. Please try again.';
			Alert.alert('Save failed', detail);
			return false;
		}
	};

	// ── Confirm now ───────────────────────────────────────────────────────────

	/**
	 * KII-159: a scheduled charge can land before its date. Pending form edits are
	 * saved through the normal submit path FIRST — the button sits in the same
	 * scroll region as the editable fields, so confirming the stored values would
	 * silently discard whatever the user just typed. The button is gated on the
	 * same `canSave` as Save, so an invalid form can never reach this path.
	 *
	 * An untouched form skips the save entirely: a no-op update would still churn
	 * `updated_at` and the reminder fingerprint.
	 *
	 * The confirm flow itself asks before rewriting the date when the transaction
	 * is ahead of schedule, so this stays a single button.
	 */
	const handleConfirmNow = () => {
		if (!existingTransaction) return;
		const target = existingTransaction;

		// Resolve a pending calculator expression the same way the save path does,
		// so the comparison below sees the value that would actually be written
		// ("10+5" reads as 105 unresolved, which could look unchanged).
		const resolvedAmount = amountExpr.resolve();
		const hasPendingEdits =
			parseAmountToMinor(resolvedAmount, currency) !== target.amount_minor ||
			(note.trim() || undefined) !== (target.note ?? undefined) ||
			selectedDate.getTime() !== target.timestamp ||
			selectedFromId !== target.from_entity_id ||
			selectedToId !== target.to_entity_id;

		if (!hasPendingEdits) {
			void KeyboardController.dismiss();
			onClose();
			void confirmTransactionFlow(target);
			return;
		}

		void (async () => {
			// handleSubmit owns the keyboard dismissal, the close and the failure
			// Alert; when it fails the modal stays open with the edits intact and
			// there is nothing to confirm. A series edit routes through
			// `updateTransactionWithScope` with the scope chosen when the occurrence
			// was opened, so nothing re-prompts here (KII-158).
			if (!(await handleSubmit())) return;
			// Confirm the SAVED row, never the prop this modal was opened with: the
			// flow reads the timestamp to decide whether this is an early confirm,
			// and reads `isVirtual` to decide whether to materialize.
			const saved = useStore.getState().transactions.find((t) => t.id === target.id);
			await confirmTransactionFlow(saved ?? target);
		})();
	};

	// ── Renderers ─────────────────────────────────────────────────────────────

	const renderEntityBubble = (
		entity: Entity | EntityWithBalance | null,
		onPress?: () => void,
		emptyLabel?: string,
		testID?: string
	) => {
		if (!entity) {
			// Placeholder shown in quickAdd mode before entity is selected
			return (
				<Pressable onPress={onPress} testID={testID} className="flex-1 items-center">
					<View
						className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-paper-200"
						style={{
							borderWidth: 1.5,
							borderColor: colors.border.dashed,
							borderStyle: 'dashed',
						}}
					>
						<Plus size={20} color={colors.ink.placeholder} />
					</View>
					<Text className="text-center font-sans text-sm text-ink-muted">
						{emptyLabel ?? 'Pick'}
					</Text>
				</Pressable>
			);
		}
		const IconComponent = getIcon(entity.icon || 'circle');
		const typeColors = getEntityColors(entity.type, entity.color);
		const isTappable = !!onPress;
		let money = null;
		if (isEntityWithBalance(entity)) {
			if (entity.type === 'account' || entity.type === 'saving') money = entity.actual;
			if (entity.type === 'income' || entity.type === 'category') money = entity.remaining;
		}

		return (
			<Pressable
				onPress={onPress}
				disabled={!isTappable}
				testID={testID}
				className="flex-1 items-center"
			>
				<View className="relative">
					<View
						className="mb-2 h-12 w-12 items-center justify-center rounded-full"
						style={{ backgroundColor: typeColors.bgColor }}
					>
						<IconComponent size={20} color={typeColors.iconColor} />
					</View>
					{isTappable && (
						<View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full bg-paper-300">
							<Pencil size={10} color={colors.ink.muted} />
						</View>
					)}
				</View>
				<Text
					className={`text-center font-sans text-sm ${isTappable ? 'text-ink' : 'text-ink-muted'}`}
					numberOfLines={1}
				>
					{getEntityDisplayName(entity)}
				</Text>
				{money !== null && (
					<Text
						className="text-center font-sans text-[10px] text-ink-muted"
						numberOfLines={1}
					>
						{formatAmount(money, entity.currency)}
					</Text>
				)}
			</Pressable>
		);
	};

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<PageSheetModal visible={visible} onRequestClose={handleCancel}>
			{/* Header */}
			<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
				<Pressable onPress={handleCancel} hitSlop={20} testID="transaction-cancel-button">
					<Text className="font-sans text-base text-ink-muted">Cancel</Text>
				</Pressable>
				<Text className="font-sans-semibold text-base text-ink">
					{isEditing
						? 'Edit Transaction'
						: quickAdd
							? 'Add Transaction'
							: 'New Transaction'}
				</Text>
				<Pressable
					onPress={() => {
						void handleSubmit();
					}}
					disabled={!canSave || isSubmitting}
					hitSlop={20}
					testID="transaction-save-button"
				>
					<Text
						className={`font-sans-semibold text-base ${canSave && !isSubmitting ? 'text-accent' : 'text-ink-muted'}`}
					>
						{isSubmitting ? 'Saving…' : 'Save'}
					</Text>
				</Pressable>
			</View>

			<KeyboardAwareScrollView
				bottomOffset={50}
				keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
				keyboardShouldPersistTaps="handled"
				className="flex-1 px-5 pt-6"
				testID="transaction-form-scroll"
			>
				{/* From → To */}
				<View className="mb-8 flex-row items-start">
					{renderEntityBubble(
						displayFromEntity,
						() => setShowFromSheet(true),
						quickAdd ? 'From' : undefined,
						'transaction-from-button'
					)}
					<View className="items-center px-2 py-3">
						<ArrowRight size={24} color={colors.ink.DEFAULT} />
					</View>
					{renderEntityBubble(
						displayToEntity,
						() => setShowToSheet(true),
						quickAdd ? 'To' : undefined,
						'transaction-to-button'
					)}
				</View>

				{/* Series indicator */}
				{isEditing && existingTransaction?.series_id && (
					<View className="mb-4 rounded-lg bg-info/10 px-3 py-2">
						<Text className="font-sans text-sm text-info">
							Part of a recurring series
							{seriesScope === 'future'
								? ' — editing all future'
								: ' — editing this one'}
						</Text>
					</View>
				)}

				{/* Amount / Total Paid */}
				<View className="mb-6">
					<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
						Amount
					</Text>
					<View className={textInputClassNames.inlineContainer}>
						<TextInput
							{...sharedNumericTextInputProps}
							{...amountExpr.inputProps}
							placeholder="0"
							className={textInputClassNames.heroAmountInput}
							style={styles.input}
							placeholderTextColor={colors.ink.placeholder}
							testID="transaction-amount-input"
						/>
						<Text className={textInputClassNames.suffixLarge}>
							{getCurrencySymbol(currency)}
						</Text>
					</View>
					{amountExpr.preview && (
						<Text className="mt-1 font-sans text-base text-ink-muted">
							{amountExpr.preview}
						</Text>
					)}
					{!canSave && amount !== '' && parseAmountToMinor(amount, currency) <= 0 && (
						<Text className="mt-1 font-sans text-xs text-ink-muted">
							Amount must be greater than 0
						</Text>
					)}
					{!isEditing && suggestedAmount && (
						<Pressable
							onPress={() =>
								setAmount(formatAmountForInput(suggestedAmount, currency))
							}
							className="mt-3 self-start rounded-full bg-paper-200 px-3 py-1.5"
							testID="transaction-suggested-amount-button"
						>
							<Text className="font-sans text-sm text-ink-muted">
								Use remaining: {formatAmount(suggestedAmount, currency)}
							</Text>
						</Pressable>
					)}
					{/* Show note when part of the amount is sourced from savings */}
					{totalFundedMinor > 0 && (
						<Text className="mt-2 font-sans text-sm text-ink-muted">
							{formatAmount(totalFundedMinor, currency)} from savings
						</Text>
					)}
				</View>

				{/* Note */}
				<View className="mb-6">
					<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
						Note (optional)
					</Text>
					<View className={textInputClassNames.container}>
						<TextInput
							{...sharedTextInputProps}
							ref={inputRef}
							value={note}
							onChangeText={setNote}
							placeholder="Add a note..."
							className={textInputClassNames.input}
							style={styles.input}
							placeholderTextColor={colors.ink.placeholder}
							testID="transaction-note-input"
						/>
					</View>
				</View>

				{/* Date */}
				<View className="mb-6">
					<View className="mb-2 flex-row items-center">
						<Text className="font-sans text-sm uppercase tracking-wider text-ink-muted">
							Date
						</Text>
						{selectedDate > new Date(new Date().setHours(23, 59, 59, 999)) && (
							<Text className="ml-2 font-sans text-xs text-info">Scheduled</Text>
						)}
					</View>
					{/* One date per row. On iOS the native compact picker IS the value —
					    rendering our own formatted text beside it printed the same date
					    twice. Android has no inline widget, so there the text is the
					    value and tapping it opens the dialog. Neither says "Today": the
					    chips below name the relative day, and the highlighted chip says
					    it more precisely than the text could. */}
					{Platform.OS === 'ios' ? (
						<View
							className="flex-row items-center rounded-lg border border-paper-300 bg-paper-100 px-4 py-2"
							testID="transaction-date-field"
						>
							<Calendar size={20} color={colors.ink.muted} />
							<View className="ml-2">
								<DateTimePicker
									value={selectedDate}
									mode="date"
									display="compact"
									onChange={handleDateChange}
									accentColor={colors.accent.deeper}
								/>
							</View>
						</View>
					) : (
						<>
							<Pressable
								onPress={() => setShowDatePicker(true)}
								className="flex-row items-center rounded-lg border border-paper-300 bg-paper-100 px-4 py-3"
								testID="transaction-date-field"
							>
								<Calendar size={20} color={colors.ink.muted} />
								<Text
									className="ml-3 font-sans text-base text-ink"
									testID="transaction-date-display"
								>
									{formatFullDate(selectedDate)}
								</Text>
							</Pressable>
							{showDatePicker && (
								<DateTimePicker
									value={selectedDate}
									mode="date"
									display="default"
									onChange={handleDateChange}
								/>
							)}
						</>
					)}
					<DateQuickPresets
						options={datePresets}
						value={selectedDate}
						onSelect={setSelectedDate}
						testIDPrefix="transaction-date-preset"
					/>
				</View>

				{/* Fund from savings — show when source is an account with reservations */}
				{!isEditing && displayFromEntity?.type === 'account' && (
					<SavingsFundingSection
						ref={fundingRef}
						accountEntityId={displayFromEntity.id}
						currency={currency}
						enteredAmountMinor={
							isSplitMode
								? splitTotalMinor
								: parseAmountToMinor(amount, currency) || 0
						}
						onFundingChange={setTotalFundedMinor}
						maxDecimalPlaces={maxDecimalPlaces}
					/>
				)}

				{/* Split — only for account → category; hidden when editing "all future" of a series */}
				{!quickAdd &&
					displayFromEntity?.type === 'account' &&
					displayToEntity?.type === 'category' &&
					(!seriesScope || seriesScope === 'single') && (
						<View className="mb-6">
							<Pressable
								onPress={isSplitMode ? handleMerge : handleEnterSplitMode}
								className="flex-row items-center rounded-lg bg-paper-100 px-3 py-2.5"
								style={{
									borderWidth: 1,
									borderColor: isSplitMode
										? colors.accent.DEFAULT
										: colors.border.dashed,
									borderStyle: isSplitMode ? 'solid' : 'dashed',
								}}
								testID="split-toggle-button"
							>
								<Split
									size={14}
									color={isSplitMode ? colors.accent.DEFAULT : colors.ink.muted}
								/>
								<Text
									className={`ml-2 font-sans text-sm ${isSplitMode ? 'text-accent' : 'text-ink-muted'}`}
								>
									Split
								</Text>
								<InfoPin articleId="splits" />
							</Pressable>

							{isSplitMode && (
								<View className="mt-3 overflow-hidden rounded-lg border border-paper-300 bg-paper-100">
									{splits.map((split, index) => {
										const splitEntity = split.toEntityId
											? entities.find((e) => e.id === split.toEntityId)
											: null;
										const typeColors = splitEntity
											? getEntityColors(splitEntity.type, splitEntity.color)
											: null;
										const IconComponent = splitEntity
											? getIcon(splitEntity.icon || 'circle')
											: null;
										const isAnchor = index === 0;

										return (
											<View
												key={split.id}
												className="flex-row items-center px-3 py-2.5"
												style={
													index > 0
														? {
																borderTopWidth: 1,
																borderTopColor: colors.border.light,
															}
														: undefined
												}
												testID={`split-row-${index}`}
											>
												{/* Entity chip */}
												<Pressable
													onPress={() => setActiveSplitIndex(index)}
													className="mr-3 flex-row items-center rounded-full bg-paper-200 px-2 py-1"
													style={{ maxWidth: 140 }}
													testID={`split-entity-${index}`}
												>
													{splitEntity && typeColors && IconComponent ? (
														<>
															<View
																className="mr-1.5 h-5 w-5 items-center justify-center rounded-full"
																style={{
																	backgroundColor:
																		typeColors.bgColor,
																}}
															>
																<IconComponent
																	size={11}
																	color={typeColors.iconColor}
																/>
															</View>
															<Text
																className="font-sans text-sm text-ink"
																numberOfLines={1}
																style={{ flexShrink: 1 }}
															>
																{splitEntity.name}
															</Text>
														</>
													) : (
														<Text className="font-sans text-sm text-ink-muted">
															Pick category
														</Text>
													)}
													<Pencil
														size={9}
														color={colors.ink.placeholder}
														style={{
															marginLeft: 4,
															flexShrink: 0,
														}}
													/>
												</Pressable>

												{/* Amount area */}
												{isAnchor ? (
													// Anchor: auto-computed, read-only
													<View
														className="flex-1 flex-row items-center justify-end"
														testID="split-anchor-amount"
													>
														<Text
															className="font-sans-semibold text-lg"
															style={{
																color:
																	anchorAmountMinor >= 0
																		? colors.ink.light
																		: colors.negative.DEFAULT,
															}}
														>
															{formatAmount(
																anchorAmountMinor,
																currency
															)}
														</Text>
														<Text className="ml-1 font-sans text-xs text-ink-muted">
															auto
														</Text>
													</View>
												) : (
													// Non-anchor: editable + "use remaining" chip
													<View className="flex-1 flex-row items-center justify-end">
														{!split.amount && anchorAmountMinor > 0 && (
															<Pressable
																onPress={() =>
																	handleSplitAmountChange(
																		index,
																		formatAmountForInput(
																			anchorAmountMinor,
																			currency
																		)
																	)
																}
																className="mr-2 rounded-full bg-paper-200 px-2 py-0.5"
																testID={`split-remaining-chip-${index}`}
															>
																<Text className="font-sans text-xs text-positive">
																	→{' '}
																	{formatAmount(
																		anchorAmountMinor,
																		currency
																	)}
																</Text>
															</Pressable>
														)}
														<TextInput
															{...sharedNumericTextInputProps}
															value={split.amount}
															onChangeText={(v) =>
																handleSplitAmountChange(index, v)
															}
															placeholder="0"
															keyboardType="numeric"
															className={
																textInputClassNames.inlineAmountInput
															}
															style={[
																styles.input,
																{
																	textAlign: 'right',
																	minWidth: 48,
																},
															]}
															placeholderTextColor={
																colors.ink.placeholder
															}
															testID={`split-amount-${index}`}
														/>
													</View>
												)}

												<Text className="ml-1 font-sans text-sm text-ink-muted">
													{getCurrencySymbol(currency)}
												</Text>

												{/* Remove (non-anchor only, disabled at minimum) */}
												{!isAnchor && (
													<Pressable
														onPress={() => handleRemoveSplit(index)}
														disabled={splits.length <= 2}
														hitSlop={12}
														className="ml-2"
														testID={`split-remove-${index}`}
													>
														<X
															size={16}
															color={
																splits.length <= 2
																	? colors.border.DEFAULT
																	: colors.ink.placeholder
															}
														/>
													</Pressable>
												)}
											</View>
										);
									})}

									{/* Add split */}
									<Pressable
										onPress={handleAddSplit}
										className="flex-row items-center px-3 py-2.5"
										style={{
											borderTopWidth: 1,
											borderTopColor: colors.border.light,
										}}
										testID="split-add-button"
									>
										<Plus size={14} color={colors.ink.muted} />
										<Text className="ml-2 font-sans text-sm text-ink-muted">
											Add split
										</Text>
									</Pressable>
								</View>
							)}
						</View>
					)}

				{/* Repeat — create mode only */}
				{!isEditing && (
					<View className="mb-6">
						<Pressable
							onPress={() => setIsRepeat((v) => !v)}
							className="flex-row items-center rounded-lg bg-paper-100 px-3 py-2.5"
							style={{
								borderWidth: 1,
								borderColor: isRepeat
									? colors.accent.DEFAULT
									: colors.border.dashed,
								borderStyle: isRepeat ? 'solid' : 'dashed',
							}}
							testID="repeat-toggle"
						>
							<Repeat
								size={14}
								color={isRepeat ? colors.accent.DEFAULT : colors.ink.muted}
							/>
							<Text
								className={`ml-2 font-sans text-sm ${isRepeat ? 'text-accent' : 'text-ink-muted'}`}
							>
								Repeat
							</Text>
							<InfoPin articleId="recurring" />
						</Pressable>

						{isRepeat && (
							<View className="mt-3 rounded-lg border border-paper-300 bg-paper-100 p-3">
								{/* Frequency */}
								<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
									Frequency
								</Text>
								<View className="mb-4 flex-row gap-2">
									{(['daily', 'weekly', 'monthly', 'yearly'] as const).map(
										(freq) => (
											<Pressable
												key={freq}
												onPress={() => setRepeatFrequency(freq)}
												className={`flex-1 items-center rounded-lg py-2 ${
													repeatFrequency === freq
														? 'bg-accent'
														: 'bg-paper-200'
												}`}
												testID={`repeat-freq-${freq}`}
											>
												<Text
													className={`font-sans text-sm capitalize ${
														repeatFrequency === freq
															? 'text-on-color'
															: 'text-ink-muted'
													}`}
												>
													{freq}
												</Text>
											</Pressable>
										)
									)}
								</View>

								{/* End condition */}
								<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
									Ends
								</Text>
								<View className="mb-4 flex-row gap-2">
									{(['never', 'until', 'count'] as const).map((mode) => (
										<Pressable
											key={mode}
											onPress={() => handleSelectRepeatEndMode(mode)}
											className={`flex-1 items-center rounded-lg py-2 ${
												repeatEndMode === mode
													? 'bg-accent'
													: 'bg-paper-200'
											}`}
											testID={`repeat-end-${mode}`}
										>
											<Text
												className={`font-sans text-sm ${
													repeatEndMode === mode
														? 'text-on-color'
														: 'text-ink-muted'
												}`}
											>
												{mode === 'never'
													? 'Never'
													: mode === 'until'
														? 'Until date'
														: 'After N'}
											</Text>
										</Pressable>
									))}
								</View>

								{repeatEndMode === 'until' && (
									<View className="mb-4">
										{/* `repeatEndDate ?? selectedDate` leaves every chip
										    unselected when no end date is set: all three presets
										    are strictly after the transaction date. */}
										<DateQuickPresets
											options={repeatEndPresets}
											value={repeatEndDate ?? selectedDate}
											onSelect={setRepeatEndDate}
											testIDPrefix="transaction-repeat-end-preset"
										/>
										{Platform.OS === 'ios' ? (
											<DateTimePicker
												value={repeatEndDate ?? new Date()}
												mode="date"
												display="compact"
												onChange={(_, date) =>
													date && setRepeatEndDate(date)
												}
												minimumDate={selectedDate}
												accentColor={colors.accent.deeper}
											/>
										) : (
											<>
												<Pressable
													onPress={() => setShowRepeatEndDatePicker(true)}
													className="flex-row items-center rounded-lg border border-paper-300 bg-paper-200 px-3 py-2"
												>
													<Calendar size={16} color={colors.ink.muted} />
													<Text className="ml-2 font-sans text-sm text-ink">
														{repeatEndDate
															? repeatEndDate.toLocaleDateString(
																	undefined,
																	{
																		month: 'short',
																		day: 'numeric',
																		year: 'numeric',
																	}
																)
															: 'Pick end date'}
													</Text>
												</Pressable>
												{showRepeatEndDatePicker && (
													<DateTimePicker
														value={repeatEndDate ?? new Date()}
														mode="date"
														display="default"
														onChange={(event, date) => {
															setShowRepeatEndDatePicker(false);
															if (event.type === 'set' && date) {
																setRepeatEndDate(date);
															}
														}}
														minimumDate={selectedDate}
													/>
												)}
											</>
										)}
									</View>
								)}

								{repeatEndMode === 'count' && (
									<View className="mb-4">
										<TextInput
											{...sharedNumericTextInputProps}
											value={repeatEndCount}
											onChangeText={setRepeatEndCount}
											placeholder="Number of times"
											keyboardType="number-pad"
											className={textInputClassNames.input}
											style={styles.input}
											placeholderTextColor={colors.ink.placeholder}
											testID="repeat-end-count-input"
										/>
									</View>
								)}
							</View>
						)}
					</View>
				)}

				{/* Confirm now — edit mode, unconfirmed only. Hidden in split mode:
				    saving a split replaces this transaction with N new rows, so there
				    is no single transaction left for "confirm this one" to name. */}
				{isEditing && existingTransaction?.is_confirmed === false && !isSplitMode && (
					<Pressable
						onPress={handleConfirmNow}
						// Confirm now saves first, so it carries Save's validation
						// verbatim — an invalid form must not reach the combined path.
						disabled={!canSave || isSubmitting}
						className={`mb-3 flex-row items-center justify-center gap-2 rounded-lg border py-3 ${
							canSave && !isSubmitting
								? 'border-info/30 bg-info/10'
								: 'border-paper-300 bg-paper-200'
						}`}
						testID="transaction-confirm-now-button"
					>
						<CircleCheck
							size={16}
							color={
								canSave && !isSubmitting ? colors.info.DEFAULT : colors.ink.muted
							}
						/>
						<Text
							className={`font-sans-semibold text-base ${canSave && !isSubmitting ? 'text-info' : 'text-ink-muted'}`}
						>
							Confirm now
						</Text>
					</Pressable>
				)}

				{/* Delete — edit mode only */}
				{isEditing && (
					<Pressable
						onPress={handleDelete}
						className="mb-8 items-center rounded-lg border border-negative/30 bg-negative/10 py-3"
						testID="transaction-delete-button"
					>
						<Text className="font-sans-semibold text-base text-negative">
							Delete Transaction
						</Text>
					</Pressable>
				)}
			</KeyboardAwareScrollView>

			<KeyboardExtender enabled={amountExpr.focused}>
				<OperatorToolbar
					onOperator={amountExpr.insertOperator}
					onEquals={amountExpr.resolve}
				/>
			</KeyboardExtender>

			{/* Entity pickers */}
			<EntitySelectionSheet
				visible={showFromSheet}
				title="Select Source"
				entities={quickAdd ? quickAddFromEntities : validFromEntities}
				selectedId={selectedFromId}
				onSelect={handleFromSelect}
				onClose={() => setShowFromSheet(false)}
				testID="entity-selection-sheet-from"
				testIDPrefix="from-option"
			/>
			<EntitySelectionSheet
				visible={showToSheet}
				title="Select Destination"
				entities={validToEntities}
				selectedId={selectedToId}
				onSelect={handleToSelect}
				onClose={() => setShowToSheet(false)}
				testID="entity-selection-sheet-to"
				testIDPrefix="to-option"
			/>

			{/* Split entity picker */}
			<EntitySelectionSheet
				visible={activeSplitIndex !== null}
				title="Select Category"
				entities={validSplitTargets}
				selectedId={
					activeSplitIndex !== null
						? (splits[activeSplitIndex]?.toEntityId ?? null)
						: null
				}
				onSelect={handleSplitEntitySelect}
				onClose={() => setActiveSplitIndex(null)}
			/>
		</PageSheetModal>
	);
}
