import { Pressable, View } from 'react-native';
import type { EntityWithBalance } from '@/src/types';
import { PRACTICE_LESSONS, type PracticeSession } from '@/src/onboarding/practice-session';
import { formatAmount } from '@/src/utils/format';
import { TestIDs } from '@/e2e/support/test-ids';
import { Text } from './text';

const INSTRUCTIONS = {
	receive: 'Drag Salary onto Main account to record getting paid.',
	spend: 'Tap Groceries to record an expense.',
	plan: 'Tap Edit board (the pencil above), then Groceries to set its monthly plan.',
	save: 'Drag Main account onto Vacation to set money aside.',
};
const ACTIONS = {
	receive: 'Record income',
	spend: 'Record expense',
	save: 'Set money aside',
	plan: 'Set a spending plan',
};

/** Short guidance card shown inside a practice sheet. */
export function PracticeNote({ children }: { children: string }) {
	return (
		<View className="my-3 rounded-xl border border-accent/30 bg-paper-100 p-3">
			<Text className="font-sans text-sm">{children}</Text>
		</View>
	);
}

export function PracticeGuidance({
	session,
	entities,
	hint,
	onRecord,
	onNext,
	onFinish,
	onExplore,
	finishLabel,
	onDemo,
	editMode = false,
}: {
	session: PracticeSession;
	entities: EntityWithBalance[];
	hint: string;
	onRecord: () => void;
	onNext: () => void;
	onFinish: () => void;
	onExplore: () => void;
	finishLabel: string;
	onDemo: () => void;
	editMode?: boolean;
}) {
	const account = entities.find((e) => e.type === 'account')!;
	const category = entities.find((e) => e.type === 'category')!;
	const saving = entities.find((e) => e.type === 'saving')!;
	const amount = (n: number) => formatAmount(n, session.currency);
	const done = session.phase === 'complete' || session.phase === 'explore';
	const feedback =
		session.lesson === 'receive'
			? `Your account now holds ${amount(account.actual)}. Income tracks what you received this month.`
			: session.lesson === 'spend'
				? `Your account has ${amount(account.actual)} left. Groceries tracks this month's spending.`
				: session.lesson === 'plan'
					? category.remaining >= 0
						? `Groceries: ${amount(category.planned)} planned − ${amount(category.actual)} spent = ${amount(category.remaining)} left to spend. Dashboard Planned includes this remaining amount. A plan doesn't move or reserve money.`
						: `Groceries is ${amount(-category.remaining)} over its ${amount(category.planned)} plan. Dashboard Planned shows zero remaining for this category. Your account balance hasn't changed.`
					: `${amount(saving.actual)} is reserved for Vacation. You have ${amount(account.actual)} available; ${amount(account.actual + (account.reserved ?? 0))} total. Your bank balance hasn't changed.`;
	const button = (label: string, id: string, onPress: () => void) => (
		<Pressable
			accessibilityRole="button"
			testID={id}
			onPress={onPress}
			className="min-h-11 justify-center py-2"
		>
			<Text className="font-sans-semibold text-sm text-accent">{label}</Text>
		</Pressable>
	);
	return (
		<View
			className="rounded-xl border border-accent/30 bg-paper-100 px-3 py-2"
			testID="practice-guidance"
		>
			<Text className="mb-1 font-sans text-xs text-ink-muted">
				{done
					? 'Your money map'
					: `${PRACTICE_LESSONS.indexOf(session.lesson) + 1} of ${PRACTICE_LESSONS.length}`}
			</Text>
			<Text accessibilityLiveRegion="polite" className="font-sans text-sm text-ink">
				{done
					? 'You know how to record money and plan your spending.'
					: session.phase === 'feedback'
						? feedback
						: session.lesson === 'plan' && editMode
							? 'Tap Groceries to set Planned Amount for this month.'
							: INSTRUCTIONS[session.lesson]}
			</Text>
			{done ? (
				<>
					<Text className="mt-2 font-sans text-xs text-ink-muted">
						Income and spending show this month. Account balances and savings carry
						forward.
					</Text>
					<Text className="mt-2 font-sans text-sm">
						Main account: {amount(account.actual)} available ·{' '}
						{amount(account.reserved ?? 0)} reserved ·{' '}
						{amount(account.actual + (account.reserved ?? 0))} total
					</Text>
					{button(finishLabel, TestIDs.onboarding.practiceFinish, onFinish)}
					{session.phase === 'complete' ? (
						button('Keep exploring', TestIDs.onboarding.practiceExplore, onExplore)
					) : (
						<Text className="font-sans text-xs text-ink-muted">
							Tap a bubble to record more example money. Editing is available on your
							own board.
						</Text>
					)}
				</>
			) : session.phase === 'feedback' ? (
				button(
					session.lesson === 'save' ? 'See what you learned' : 'Next lesson',
					TestIDs.onboarding.practiceNext,
					onNext
				)
			) : (
				<>
					{button('Show me how', TestIDs.onboarding.practiceDemo, onDemo)}
					{button(
						`${ACTIONS[session.lesson]} instead`,
						TestIDs.onboarding.practiceRecord,
						onRecord
					)}
				</>
			)}
			{!!hint && (
				<Text
					accessibilityLiveRegion="polite"
					className="mt-1 font-sans text-xs text-ink-muted"
				>
					{hint}
				</Text>
			)}
		</View>
	);
}
