import { useCallback, useMemo, useState } from 'react';

import type { EntityWithBalance, Transaction } from '@/src/types';

interface UseTransactionFlowParams {
	/** All board entities, used to resolve a picked refund transaction's endpoints. */
	allEntities: EntityWithBalance[];
}

interface TransactionModalProps {
	visible: boolean;
	fromEntity: EntityWithBalance | null;
	toEntity: EntityWithBalance | null;
	existingTransaction: Transaction | undefined;
	onClose: () => void;
}

interface RefundPickerProps {
	visible: boolean;
	originalFrom: EntityWithBalance | null;
	originalTo: EntityWithBalance | null;
	onSelect: (transaction: Transaction) => void;
	onClose: () => void;
}

export interface UseTransactionFlow {
	/** Open the transaction modal for a fresh money move from `from` to `to`. */
	open: (from: EntityWithBalance, to: EntityWithBalance) => void;
	/**
	 * Open the refund picker. `originalFrom`/`originalTo` describe the *original*
	 * transaction direction the refund reverses, not the drag direction.
	 */
	openRefund: (originalFrom: EntityWithBalance, originalTo: EntityWithBalance) => void;
	transactionModalProps: TransactionModalProps;
	refundPickerProps: RefundPickerProps;
}

/**
 * Owns the transaction modal and the refund picker together, because they share
 * a handoff: picking a transaction in the refund picker closes it and opens the
 * transaction modal in edit mode for that transaction. Splitting them would force
 * the shared from/to/editing state to live elsewhere, so they stay one hook.
 */
export function useTransactionFlow({ allEntities }: UseTransactionFlowParams): UseTransactionFlow {
	const [modalVisible, setModalVisible] = useState(false);
	const [fromEntity, setFromEntity] = useState<EntityWithBalance | null>(null);
	const [toEntity, setToEntity] = useState<EntityWithBalance | null>(null);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

	// Refund picker state — originalFrom/originalTo reflect the direction of original transactions
	const [refundPickerVisible, setRefundPickerVisible] = useState(false);
	const [refundOriginalFrom, setRefundOriginalFrom] = useState<EntityWithBalance | null>(null);
	const [refundOriginalTo, setRefundOriginalTo] = useState<EntityWithBalance | null>(null);

	const open = useCallback((from: EntityWithBalance, to: EntityWithBalance) => {
		setFromEntity(from);
		setToEntity(to);
		setModalVisible(true);
	}, []);

	const openRefund = useCallback(
		(originalFrom: EntityWithBalance, originalTo: EntityWithBalance) => {
			setRefundOriginalFrom(originalFrom);
			setRefundOriginalTo(originalTo);
			setRefundPickerVisible(true);
		},
		[]
	);

	const handleCloseModal = useCallback(() => {
		setModalVisible(false);
		setFromEntity(null);
		setToEntity(null);
		setEditingTransaction(null);
		setRefundOriginalFrom(null);
		setRefundOriginalTo(null);
	}, []);

	const handleRefundSelect = useCallback(
		(transaction: Transaction) => {
			setRefundPickerVisible(false);
			// Open edit modal for the selected transaction
			const from = allEntities.find((e) => e.id === transaction.from_entity_id) ?? null;
			const to = allEntities.find((e) => e.id === transaction.to_entity_id) ?? null;
			setFromEntity(from);
			setToEntity(to);
			setEditingTransaction(transaction);
			setModalVisible(true);
		},
		[allEntities]
	);

	const handleCloseRefundPicker = useCallback(() => {
		setRefundPickerVisible(false);
		setRefundOriginalFrom(null);
		setRefundOriginalTo(null);
	}, []);

	const transactionModalProps = useMemo<TransactionModalProps>(
		() => ({
			visible: modalVisible,
			fromEntity,
			toEntity,
			existingTransaction: editingTransaction ?? undefined,
			onClose: handleCloseModal,
		}),
		[modalVisible, fromEntity, toEntity, editingTransaction, handleCloseModal]
	);

	const refundPickerProps = useMemo<RefundPickerProps>(
		() => ({
			visible: refundPickerVisible,
			originalFrom: refundOriginalFrom,
			originalTo: refundOriginalTo,
			onSelect: handleRefundSelect,
			onClose: handleCloseRefundPicker,
		}),
		[
			refundPickerVisible,
			refundOriginalFrom,
			refundOriginalTo,
			handleRefundSelect,
			handleCloseRefundPicker,
		]
	);

	return { open, openRefund, transactionModalProps, refundPickerProps };
}
