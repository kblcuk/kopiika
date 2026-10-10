import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	useReducedMotion,
	withTiming,
} from 'react-native-reanimated';
import type { PracticeSession } from '@/src/onboarding/practice-session';
import { getPracticeEntities } from '@/src/onboarding/practice-session';
import { formatAmount } from '@/src/utils/format';
import { TestIDs } from '@/e2e/support/test-ids';
import { Text } from './text';

const INSTRUCTIONS = {
	receive: 'Drag Salary onto Main account to record getting paid.',
	spend: 'Tap Groceries to record an expense.',
	save: 'Drag Main account onto Vacation to set money aside.',
};
const ACTIONS = { receive: 'Record income', spend: 'Record expense', save: 'Set money aside' };

export function PracticeGuidance({
	session,
	hint,
	onRecord,
	onNext,
	onFinish,
	onExplore,
	finishLabel,
}: {
	session: PracticeSession;
	hint: string;
	onRecord: () => void;
	onNext: () => void;
	onFinish: () => void;
	onExplore: () => void;
	finishLabel: string;
}) {
	const [demo, setDemo] = useState(0);
	const reducedMotion = useReducedMotion();
	const cue = useSharedValue(0);
	useEffect(() => {
		cue.value = 0;
		if (demo && !reducedMotion) cue.value = withTiming(1, { duration: 1600 });
	}, [demo, cue, reducedMotion]);
	const cueStyle = useAnimatedStyle(() => ({ transform: [{ translateX: cue.value * 120 }] }));
	const es = getPracticeEntities(session);
	const account = es.find((e) => e.type === 'account')!;
	const saving = es.find((e) => e.type === 'saving')!;
	const amount = (n: number) => formatAmount(n, session.currency);
	const feedback =
		session.lesson === 'receive'
			? `Income shows what you received this month. Your account holds that money: ${amount(account.actual)}.`
			: session.lesson === 'spend'
				? `Groceries tracks this month's spending. The expense also reduces your account balance, now ${amount(account.actual)}.`
				: `You've reserved ${amount(saving.actual)} for Vacation. Recording this doesn't move money at your bank. You have ${amount(account.actual)} available and ${amount(account.actual + (account.reserved ?? 0))} total.`;
	const done = session.phase === 'complete' || session.phase === 'explore';
	return (
		<View className="mx-4 mb-5 rounded-2xl border border-paper-300 bg-paper-100 p-5">
			<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
				{done
					? 'Your money map'
					: `${['receive', 'spend', 'save'].indexOf(session.lesson) + 1} of 3`}
			</Text>
			<Text accessibilityLiveRegion="polite" className="font-sans-semibold text-lg text-ink">
				{done
					? 'You know the three everyday moves.'
					: session.phase === 'feedback'
						? feedback
						: INSTRUCTIONS[session.lesson]}
			</Text>
			{done ? (
				<>
					<Text className="mt-3 font-sans text-sm text-ink-muted">
						Income and spending show this month. Account balances and savings carry
						forward.
					</Text>
					<Text className="mt-3 font-sans text-sm text-ink">
						Main account: {amount(account.actual)} available ·{' '}
						{amount(account.reserved ?? 0)} reserved ·{' '}
						{amount(account.actual + (account.reserved ?? 0))} total
					</Text>
					<Pressable
						accessibilityRole="button"
						testID={TestIDs.onboarding.practiceFinish}
						onPress={onFinish}
						className="mt-4 min-h-12 items-center justify-center rounded-2xl bg-ink px-4 py-3"
					>
						<Text className="font-sans-semibold text-paper-50">{finishLabel}</Text>
					</Pressable>
					{session.phase === 'complete' && (
						<Pressable
							accessibilityRole="button"
							testID={TestIDs.onboarding.practiceExplore}
							onPress={onExplore}
							className="mt-3 min-h-11 items-center justify-center"
						>
							<Text>Keep exploring</Text>
						</Pressable>
					)}
					{session.phase === 'explore' && (
						<Text className="mt-3 font-sans text-sm text-ink-muted">
							Tap a bubble to record more example income, spending, or savings. All of
							this stays in practice.
						</Text>
					)}
				</>
			) : session.phase === 'feedback' ? (
				<Pressable
					accessibilityRole="button"
					testID={TestIDs.onboarding.practiceNext}
					onPress={onNext}
					className="mt-4 min-h-12 items-center justify-center rounded-2xl bg-ink px-4 py-3"
				>
					<Text className="font-sans-semibold text-paper-50">
						{session.lesson === 'save' ? 'See what you learned' : 'Next lesson'}
					</Text>
				</Pressable>
			) : (
				<>
					<Text className="mt-2 font-sans text-sm text-ink-muted">
						Example amounts are ready to use. You can change them before saving.
					</Text>
					<Pressable
						accessibilityRole="button"
						testID={TestIDs.onboarding.practiceRecord}
						onPress={onRecord}
						className="mt-4 min-h-12 items-center justify-center rounded-2xl bg-ink px-4 py-3"
					>
						<Text className="font-sans-semibold text-paper-50">
							{ACTIONS[session.lesson]}
						</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						testID={TestIDs.onboarding.practiceDemo}
						onPress={() => setDemo((n) => n + 1)}
						className="mt-2 min-h-11 items-center justify-center"
					>
						<Text className="font-sans text-sm text-ink-muted">Show me how</Text>
					</Pressable>
					{!!demo && (
						<View
							accessible
							accessibilityLabel={INSTRUCTIONS[session.lesson]}
							className="mt-2"
						>
							<Text className="font-sans text-sm text-ink-muted">
								{session.lesson === 'receive'
									? 'Salary → Main account'
									: session.lesson === 'spend'
										? 'Tap Groceries, then Save'
										: 'Main account → Vacation'}
							</Text>
							{!reducedMotion && (
								<Animated.View
									pointerEvents="none"
									style={cueStyle}
									className="mt-2 h-3 w-3 rounded-full bg-ink"
								/>
							)}
						</View>
					)}
				</>
			)}
			{!!hint && (
				<Text
					accessibilityLiveRegion="polite"
					className="mt-3 font-sans text-sm text-ink-muted"
				>
					{hint}
				</Text>
			)}
		</View>
	);
}
