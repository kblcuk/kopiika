import { View, Text } from 'react-native';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useStore } from '@/src/store';
import { getPeriodRange } from '@/src/types';
import { formatAmount } from '@/src/utils/format';

interface SummaryData {
	balance: number;
	expenses: number;
	planned: number;
}

// Hook to compute summary values
export function useSummary(): SummaryData {
	const { entities, plans, transactions, currentPeriod } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
			transactions: state.transactions,
			currentPeriod: state.currentPeriod,
		}))
	);

	return useMemo(() => {
		const { start, end } = getPeriodRange(currentPeriod);
		const periodTransactions = transactions.filter(
			(t) => t.timestamp >= start && t.timestamp <= end
		);

		// Get accounts
		const accounts = entities.filter((e) => e.type === 'account');
		const categories = entities.filter((e) => e.type === 'category');

		// Balance: sum of account remaining (planned - spent from accounts)
		let balance = 0;
		for (const account of accounts) {
			const plan = plans.find(
				(p) => p.entity_id === account.id && p.period_start === currentPeriod
			);
			const planned = plan?.planned_amount ?? 0;
			const spent = periodTransactions
				.filter((t) => t.from_entity_id === account.id)
				.reduce((sum, t) => sum + t.amount, 0);
			balance += planned - spent;
		}

		// Expenses: sum of category actuals
		let expenses = 0;
		for (const category of categories) {
			const spent = periodTransactions
				.filter((t) => t.to_entity_id === category.id)
				.reduce((sum, t) => sum + t.amount, 0);
			expenses += spent;
		}

		// Planned: sum of all plans for current period
		const planned = plans
			.filter((p) => p.period_start === currentPeriod)
			.reduce((sum, p) => sum + p.planned_amount, 0);

		return { balance, expenses, planned };
	}, [entities, plans, transactions, currentPeriod]);
}

export function SummaryHeader() {
	const { balance, expenses, planned } = useSummary();

	return (
		<View className="flex-row justify-between border-b border-paper-300 bg-paper-100 px-4 py-3">
			<SummaryItem label="Balance" value={balance} />
			<SummaryItem label="Expenses" value={expenses} />
			<SummaryItem label="Planned" value={planned} />
		</View>
	);
}

interface SummaryItemProps {
	label: string;
	value: number;
}

function SummaryItem({ label, value }: SummaryItemProps) {
	const isNegative = value < 0;

	return (
		<View className="items-center">
			<Text className="font-sans text-xs text-ink-muted">{label}</Text>
			<Text
				className={`font-sans-semibold text-base ${isNegative ? 'text-negative' : 'text-ink'}`}
			>
				{formatAmount(value)}
			</Text>
		</View>
	);
}
