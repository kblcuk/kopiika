import { useMemo } from 'react';
import { useStore, useEntitiesWithBalance } from '@/src/store';
import { useConfirmTransaction } from '@/src/hooks/use-confirm-transaction';
import { TransactionForm, type TransactionFormProps } from './transaction-form';
export function TransactionModal(props: Omit<TransactionFormProps, 'bindings' | 'practice'>) {
	const createTransactionBatch = useStore((s) => s.createTransactionBatch);
	const updateTransaction = useStore((s) => s.updateTransaction);
	const updateTransactionWithScope = useStore((s) => s.updateTransactionWithScope);
	const deleteTransaction = useStore((s) => s.deleteTransaction);
	const deleteTransactionWithScope = useStore((s) => s.deleteTransactionWithScope);
	const materializeOccurrence = useStore((s) => s.materializeOccurrence);
	const excludeOccurrence = useStore((s) => s.excludeOccurrence);
	const replaceTransactionWithSplit = useStore((s) => s.replaceTransactionWithSplit);
	const addRecurringTransaction = useStore((s) => s.addRecurringTransaction);
	const appCurrency = useStore((s) => s.appCurrency);
	const transactions = useStore((s) => s.transactions);
	const accounts = useEntitiesWithBalance('account');
	const categories = useEntitiesWithBalance('category');
	const income = useEntitiesWithBalance('income');
	const savings = useEntitiesWithBalance('saving');
	const entities = useMemo(
		() => [...accounts, ...categories, ...income, ...savings],
		[accounts, categories, income, savings]
	);
	const confirmTransactionFlow = useConfirmTransaction();
	return (
		<TransactionForm
			{...props}
			bindings={{
				createTransactionBatch,
				updateTransaction,
				updateTransactionWithScope,
				deleteTransaction,
				deleteTransactionWithScope,
				materializeOccurrence,
				excludeOccurrence,
				replaceTransactionWithSplit,
				addRecurringTransaction,
				appCurrency,
				transactions,
				entities,
				confirmTransactionFlow,
				getEntities: () => useStore.getState().entities,
				getTransaction: (id) => useStore.getState().transactions.find((t) => t.id === id),
			}}
		/>
	);
}
