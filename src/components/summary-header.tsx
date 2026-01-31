import { View, Text, Pressable } from 'react-native';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore, getEntitiesWithBalance } from '@/src/store';
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
		// Use getEntitiesWithBalance for correct balance calculation (handles both in/out transactions)
		const accountsWithBalance = getEntitiesWithBalance(
			entities,
			plans,
			transactions,
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

		// Balance: sum of all account actuals (total money across all accounts)
		const balance = accountsWithBalance.reduce((sum, a) => sum + a.actual, 0);

		// Expenses: sum of category actuals
		const expenses = categoriesWithBalance.reduce((sum, c) => sum + c.actual, 0);

		// Planned: sum of category plans
		const planned = categoriesWithBalance.reduce((sum, c) => sum + c.planned, 0);

		return { balance, expenses, planned };
	}, [entities, plans, transactions, currentPeriod]);
}

interface SummaryHeaderProps {
	onToggleIncome?: () => void;
}

export function SummaryHeader({ onToggleIncome }: SummaryHeaderProps) {
	const { balance, expenses, planned } = useSummary();
	const incomeVisible = useStore((state) => state.incomeVisible);
	const insets = useSafeAreaInsets();

	return (
		<View
			className="z-[1001] border-b border-paper-300 bg-paper-100"
			style={{ paddingTop: insets.top }}
		>
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
