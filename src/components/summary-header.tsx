import { View, Text, Pressable } from 'react-native';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { useStore } from '@/src/store';
import { getPeriodRange } from '@/src/types';
import { formatAmount } from '@/src/utils/format';
import type { EntityWithBalance } from '@/src/types';

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

interface SummaryHeaderProps {
	fromEntity?: EntityWithBalance | null;
	onToggleIncome?: () => void;
}

export function SummaryHeader({ fromEntity, onToggleIncome }: SummaryHeaderProps) {
	const { balance, expenses, planned } = useSummary();
	const incomeVisible = useStore((state) => state.incomeVisible);

	return (
		<View className="border-b border-paper-300 bg-paper-100">
			{/* Main summary row */}
			<View className="flex-row items-center justify-between px-4 py-2">
				<View className="flex-1 flex-row justify-between">
					<SummaryItem label="Balance" value={balance} />
					<SummaryItem label="Expenses" value={expenses} />
					<SummaryItem label="Planned" value={planned} />
				</View>

				{/* Income toggle button */}
				<Pressable
					onPress={onToggleIncome}
					hitSlop={8}
					className="ml-4 h-6 w-6 items-center justify-center"
				>
					{incomeVisible ? (
						<ChevronUp size={18} color="#6B5D4A" />
					) : (
						<ChevronDown size={18} color="#6B5D4A" />
					)}
				</Pressable>
			</View>

			{/* Selection indicator */}
			{fromEntity && (
				<View className="border-t border-accent/20 bg-accent/5 px-4 py-1.5">
					<Text className="font-sans text-xs text-accent">
						{fromEntity.name} → Tap or drag to another
					</Text>
				</View>
			)}
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
