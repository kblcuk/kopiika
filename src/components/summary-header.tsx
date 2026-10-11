import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, getEntitiesWithBalance } from '@/src/store';
import { SummaryHeaderView, type SummaryHeaderViewProps } from './summary-header-view';
export { HEADER_TOGGLE_GAP } from './summary-header-view';
interface SummaryData {
	balance: number;
	expenses: number;
	remaining: number;
}

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

		// Balance: sum of account actuals with include_in_total as true (default)
		const balance = accountsWithBalance
			.filter((a) => (a.include_in_total ?? true) && a.is_investment !== true)
			.reduce((sum, a) => sum + a.actual, 0);

		// Expenses: sum of category actuals
		const expenses = categoriesWithBalance.reduce((sum, c) => sum + c.actual, 0);

		// Remaining: how much is left to spend across categories that have a plan
		// Overspent categories contribute 0 (not negative) so they don't reduce the total
		const remaining = categoriesWithBalance
			.filter((c) => c.planned > 0)
			.reduce((sum, c) => sum + Math.max(0, c.planned - c.actual), 0);

		return { balance, expenses, remaining };
	}, [entities, plans, transactions, balanceSeed, currentPeriod]);
}

export function SummaryHeader(
	props: Omit<SummaryHeaderViewProps, 'summary' | 'incomeVisible' | 'topInset' | 'editDisabled'>
) {
	const summary = useSummary();
	const incomeVisible = useStore((s) => s.incomeVisible);
	return <SummaryHeaderView {...props} summary={summary} incomeVisible={incomeVisible} />;
}
