import type { ReactNode } from 'react';
import type { EntityWithBalance } from '@/src/types';
import {
	ensureValid,
	validateTransaction,
	type MutationInput,
} from '@/src/utils/transaction-validation';
import { TransactionForm } from './transaction-form';

interface CreateTransactionFormProps {
	visible: boolean;
	fromEntity: EntityWithBalance;
	toEntity: EntityWithBalance;
	entities: EntityWithBalance[];
	initialAmountMinor?: number;
	timestamp: number;
	onSubmit: (input: MutationInput) => Promise<void>;
	onClose: () => void;
	tutorialHeader?: ReactNode;
	guidance?: ReactNode;
}
const outsideExercise = async (): Promise<never> => {
	throw new Error('This option is outside this exercise.');
};

/** Binds the app's transaction sheet to example money, without importing personal state. */
export function CreateTransactionForm({
	visible,
	fromEntity,
	toEntity,
	entities,
	initialAmountMinor,
	timestamp,
	onSubmit,
	onClose,
	tutorialHeader,
	guidance,
}: CreateTransactionFormProps) {
	return (
		<TransactionForm
			visible={visible}
			fromEntity={fromEntity}
			toEntity={toEntity}
			onClose={onClose}
			practice={{ initialAmountMinor, timestamp, header: tutorialHeader, guidance }}
			bindings={{
				appCurrency: fromEntity.currency,
				entities,
				transactions: [],
				getEntities: () => entities,
				getTransaction: () => undefined,
				createTransactionBatch: async (rows) => {
					if (rows.length !== 1)
						throw new Error('Record one example movement at a time.');
					const row = rows[0]!;
					const input: MutationInput & { note?: string } = {
						from_entity_id: row.from_entity_id,
						to_entity_id: row.to_entity_id,
						currency: row.currency,
						amount_minor: row.amount_minor,
					};
					if (row.note) input.note = row.note;
					ensureValid(validateTransaction(input, entities));
					await onSubmit(input);
				},
				updateTransaction: outsideExercise,
				updateTransactionWithScope: outsideExercise,
				deleteTransaction: outsideExercise,
				deleteTransactionWithScope: outsideExercise,
				materializeOccurrence: outsideExercise,
				excludeOccurrence: outsideExercise,
				replaceTransactionWithSplit: outsideExercise,
				addRecurringTransaction: outsideExercise,
				confirmTransactionFlow: outsideExercise,
			}}
		/>
	);
}
