import { View, Pressable } from 'react-native';
import { Text } from './text';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/src/theme/colors';

import { useStore, getEntitiesWithBalance } from '@/src/store';
import { formatAmount } from '@/src/utils/format';

interface SummaryData {
	balance: number;
	expenses: number;
	remaining: number;
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

		// Balance: sum of account actuals with include_in_total as true (default)
		const balance = accountsWithBalance
			.filter((a) => a.include_in_total ?? true)
			.reduce((sum, a) => sum + a.actual, 0);

		// Expenses: sum of category actuals
		const expenses = categoriesWithBalance.reduce((sum, c) => sum + c.actual, 0);

		// Remaining: how much is left to spend across categories that have a plan
		// Overspent categories contribute 0 (not negative) so they don't reduce the total
		const remaining = categoriesWithBalance
			.filter((c) => c.planned > 0)
			.reduce((sum, c) => sum + Math.max(0, c.planned - c.actual), 0);

		return { balance, expenses, remaining };
	}, [entities, plans, transactions, currentPeriod]);
}

interface SummaryHeaderProps {
	onToggleIncome?: () => void;
}

export function SummaryHeader({ onToggleIncome }: SummaryHeaderProps) {
	const { balance, expenses, remaining } = useSummary();
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
					<SummaryItem label="Planned" value={remaining} />
				</View>

				{/* Income toggle button */}
				<Pressable
					onPress={onToggleIncome}
					hitSlop={8}
					testID="income-toggle-button"
					className="ml-4 h-6 w-6 items-center justify-center"
				>
					{incomeVisible ? (
						<ChevronUp size={18} color={colors.ink.muted} />
					) : (
						<ChevronDown size={18} color={colors.ink.muted} />
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
