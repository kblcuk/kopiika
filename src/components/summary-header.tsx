import { View, Pressable } from 'react-native';
import { Text } from './text';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '@/src/theme/colors';
import { TestIDs } from '@/e2e/support/test-ids';

import { useStore, getEntitiesWithBalance } from '@/src/store';
import { formatAmount } from '@/src/utils/format';

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

/**
 * Horizontal gap between the two header toggles, in points.
 *
 * KII-148: these two controls sit side by side in a corner with very little
 * room, so their geometry is spelled out here rather than left to utility
 * classes — the invariant that matters (their hit regions must not overlap)
 * is a relationship between this gap and the facing `hitSlop` edges, and it
 * has a test that reads both.
 */
export const HEADER_TOGGLE_GAP = 16;

/**
 * Touch-target box for each header toggle, in points.
 *
 * Deliberately smaller than the 44pt platform minimum — two 44pt boxes plus the
 * gap would not fit beside the three summary figures. The outward `hitSlop`
 * below is what carries each control up to 44, and the test asserts that sum
 * against a literal 44 rather than against these constants.
 */
const HEADER_TOGGLE_SIZE = { width: 32, height: 40 };

/** Slop on each toggle's outward-facing edge; the facing edges get none. */
const TOGGLE_SLOP_OUTER = 12;
const TOGGLE_SLOP_VERTICAL = 10;

interface SummaryHeaderProps {
	currency: string;
	onToggleIncome?: () => void;
	/** KII-148: whether the board is in edit mode, for the pencil's on-state. */
	editMode: boolean;
	/**
	 * Flips the whole board in and out of edit mode. Required: the pencil is
	 * rendered unconditionally, so an optional handler would ship a control that
	 * fires haptics and announces `selected` while doing nothing.
	 */
	onToggleEditMode: () => void;
}

export function SummaryHeader({
	currency,
	onToggleIncome,
	editMode,
	onToggleEditMode,
}: SummaryHeaderProps) {
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
					<SummaryItem label="Balance" value={balance} currency={currency} />
					<SummaryItem label="Expenses" value={expenses} currency={currency} />
					<SummaryItem label="Planned" value={remaining} currency={currency} />
				</View>

				<View className="ml-4 flex-row items-center" style={{ gap: HEADER_TOGGLE_GAP }}>
					{/* Income toggle button. Slop reaches left and vertically but
					    never right — the pencil is that way. */}
					<Pressable
						onPress={onToggleIncome}
						hitSlop={{
							top: TOGGLE_SLOP_VERTICAL,
							bottom: TOGGLE_SLOP_VERTICAL,
							left: TOGGLE_SLOP_OUTER,
							right: 0,
						}}
						testID={TestIDs.incomeToggleButton}
						style={HEADER_TOGGLE_SIZE}
						className="items-center justify-center"
					>
						{incomeVisible ? (
							<ChevronUp size={18} color={colors.ink.muted} />
						) : (
							<ChevronDown size={18} color={colors.ink.muted} />
						)}
					</Pressable>

					{/* KII-148: board-wide edit mode. Testers read the old per-section
					    pencil/checkmark pair as a status indicator, so the action moved
					    here — one control, always in the same corner, wearing a filled
					    circle while it's on. `accessibilityState.selected` carries that
					    on-state for screen readers (and for tests, since the pill is a
					    NativeWind class and NativeWind is mocked under Jest).

					    The pill is an inner view, not the Pressable itself: the touch
					    box is deliberately taller than it is wide, and `rounded-full`
					    on that would render a stadium rather than the circle the
					    design calls for. */}
					<Pressable
						onPress={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onToggleEditMode();
						}}
						hitSlop={{
							top: TOGGLE_SLOP_VERTICAL,
							bottom: TOGGLE_SLOP_VERTICAL,
							left: 0,
							right: TOGGLE_SLOP_OUTER,
						}}
						testID={TestIDs.boardEditToggle}
						accessibilityRole="button"
						accessibilityLabel="Edit board"
						accessibilityState={{ selected: editMode }}
						style={HEADER_TOGGLE_SIZE}
						className="items-center justify-center"
					>
						<View
							className={`h-7 w-7 items-center justify-center rounded-full ${
								editMode ? 'bg-accent/20' : 'bg-transparent'
							}`}
						>
							<Pencil
								size={16}
								color={editMode ? colors.accent.DEFAULT : colors.ink.muted}
								strokeWidth={editMode ? 2.5 : 2}
							/>
						</View>
					</Pressable>
				</View>
			</View>
		</View>
	);
}

interface SummaryItemProps {
	label: string;
	value: number;
	currency: string;
}

function SummaryItem({ label, value, currency }: SummaryItemProps) {
	const isNegative = value < 0;

	return (
		<View className="items-center">
			<Text className="font-sans text-xs text-ink-muted">{label}</Text>
			<Text
				className={`font-sans-semibold text-base ${isNegative ? 'text-negative' : 'text-ink'}`}
			>
				{formatAmount(value, currency)}
			</Text>
		</View>
	);
}
