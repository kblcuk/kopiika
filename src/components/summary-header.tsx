import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@/src/store';
import {
	computeSummary,
	getEntitiesWithBalance,
	type SummaryData,
} from '@/src/utils/entity-balances';
import { SummaryHeaderView, type SummaryHeaderViewProps } from './summary-header-view';

// Hook to compute summary values
export function useSummary(): SummaryData {
	const { entities, plans, transactions, balanceSeed, currentPeriod } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
			transactions: state.transactions,
			balanceSeed: state.balanceSeed,
			currentPeriod: state.currentPeriod,
		}))
	);

	return useMemo(() => {
		// Use getEntitiesWithBalance for correct balance calculation (handles both in/out transactions)
		// KII-144: accounts are all-time, so during the phase-2 hydration window
		// they must also see `balanceSeed` — the pre-period confirmed history
		// collapsed into synthetic aggregate rows — or the headline balance
		// undercounts by exactly that history until the background swap lands.
		// Categories are period-scoped and never see seed rows (they're always
		// pre-period), so they're left on `transactions` alone.
		const accountsWithBalance = getEntitiesWithBalance(
			entities,
			plans,
			[...transactions, ...balanceSeed],
			currentPeriod,
			'account'
		);
		const categoriesWithBalance = getEntitiesWithBalance(
			entities,
			plans,
			transactions,
			currentPeriod,
			'category'
		);
		return computeSummary(accountsWithBalance, categoriesWithBalance);
	}, [entities, plans, transactions, balanceSeed, currentPeriod]);
}

export function SummaryHeader(
	props: Omit<SummaryHeaderViewProps, 'summary' | 'incomeVisible' | 'topInset' | 'editDisabled'>
) {
	const summary = useSummary();
	const incomeVisible = useStore((s) => s.incomeVisible);
	return <SummaryHeaderView {...props} summary={summary} incomeVisible={incomeVisible} />;
}
