import { useCallback, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useStore } from '@/src/store';
import {
	createPracticeSession,
	getPracticeEntities,
	getPracticeLessonPair,
	submitPracticeMovement,
	advancePracticeLesson,
	startPracticeExploring,
	type PracticeLesson,
} from '@/src/onboarding/practice-session';
import type { EntityWithBalance } from '@/src/types';
import type { MutationInput } from '@/src/utils/transaction-validation';
import { createDropZoneRegistry } from '@/src/utils/drop-zone';
import { generateId } from '@/src/utils/ids';
import { getReservationForPair } from '@/src/utils/savings-transactions';
import { Text } from '@/src/components/text';
import { PracticeBoard } from '@/src/components/practice-board';
import { PracticeGuidance } from '@/src/components/practice-guidance';
import { CreateTransactionForm } from '@/src/components/create-transaction-form';
import { ReservationForm } from '@/src/components/reservation-form';
import { TestIDs } from '@/e2e/support/test-ids';

export default function PracticeScreen() {
	const router = useRouter();
	const { origin } = useLocalSearchParams<{ origin?: string }>();
	const replay = origin === 'settings' || origin === 'help';
	const [session, setSession] = useState(() =>
		createPracticeSession(useStore.getState().appCurrency)
	);
	const sessionRef = useRef(session);
	const active = useRef(true);
	const [dropZones] = useState(createDropZoneRegistry);
	const [hint, setHint] = useState('');
	const [form, setForm] = useState<{ lesson: PracticeLesson; submissionId: string } | null>(null);
	const update = (next: typeof session) => {
		sessionRef.current = next;
		setSession(next);
		setHint('');
	};
	const exit = useCallback(() => {
		active.current = false;
		setForm(null);
		if (!replay) router.replace('/onboarding/setup');
		else if (router.canGoBack()) router.back();
		else router.replace(origin === 'settings' ? '/(tabs)/settings' : '/help');
	}, [router, replay, origin]);
	useFocusEffect(
		useCallback(() => {
			active.current = true;
			const sub = BackHandler.addEventListener('hardwareBackPress', () => {
				exit();
				return true;
			});
			return () => {
				active.current = false;
				sub.remove();
			};
		}, [exit])
	);
	const entities = getPracticeEntities(session);
	const pair = getPracticeLessonPair(form ? { ...session, lesson: form.lesson } : session);
	const from = entities.find((e) => e.id === pair.fromId)!;
	const to = entities.find((e) => e.id === pair.toId)!;
	const open = (lesson = session.lesson) => {
		if (form || !active.current) return;
		if (session.phase !== 'action' && session.phase !== 'explore') {
			setHint('See the result, then continue below.');
			return;
		}
		setHint('');
		setForm({ lesson, submissionId: generateId() });
	};
	const tap = (entity: EntityWithBalance) => {
		const lesson =
			entity.type === 'income'
				? 'receive'
				: entity.type === 'saving'
					? 'save'
					: entity.type === 'category'
						? 'spend'
						: null;
		if (lesson && (session.phase === 'explore' || lesson === session.lesson)) open(lesson);
		else setHint('Try the highlighted movement, or use the action button above.');
	};
	const drop = (entity: EntityWithBalance, targetId: string | null) => {
		if (!targetId) return;
		const lessons: PracticeLesson[] = ['receive', 'spend', 'save'];
		const lesson = lessons.find((l) => {
			const p = getPracticeLessonPair({ ...session, lesson: l });
			return p.fromId === entity.id && p.toId === targetId;
		});
		if (lesson && (session.phase === 'explore' || lesson === session.lesson)) open(lesson);
		else setHint('Try the highlighted movement, or use the action button above.');
	};
	const submit = async (input: MutationInput) => {
		if (!active.current || !form) throw new Error('This practice session has ended.');
		update(submitPracticeMovement(sessionRef.current, input, form.submissionId));
	};
	const label = replay
		? origin === 'settings'
			? 'Back to Settings'
			: 'Back to Help'
		: 'Create my board';
	const chrome = (sheet = false) => (
		<View className="flex-row items-center justify-between border-b border-paper-300 px-4 py-4">
			<Text className="mr-3 flex-1 font-sans-semibold text-sm text-ink-muted">
				Practice · example money
			</Text>
			<Pressable
				accessibilityRole="button"
				testID={
					sheet ? TestIDs.onboarding.practiceSheetExit : TestIDs.onboarding.practiceExit
				}
				onPress={exit}
				hitSlop={12}
			>
				<Text className="font-sans text-sm text-ink">Exit tutorial</Text>
			</Pressable>
		</View>
	);
	return (
		<SafeAreaView className="flex-1 bg-paper-50" edges={['top', 'bottom']}>
			{chrome()}
			<ScrollView
				testID={TestIDs.onboarding.practiceScreen}
				contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
				onScroll={dropZones.remeasureAllDropZones}
				onContentSizeChange={dropZones.remeasureAllDropZones}
				scrollEventThrottle={32}
			>
				<PracticeGuidance
					key={`${session.lesson}-${session.phase}`}
					session={session}
					hint={hint}
					onRecord={() => open()}
					onNext={() => update(advancePracticeLesson(sessionRef.current))}
					onFinish={exit}
					onExplore={() => update(startPracticeExploring(sessionRef.current))}
					finishLabel={label}
				/>
				<PracticeBoard
					entities={entities}
					highlightedIds={session.phase === 'action' ? [pair.fromId, pair.toId] : []}
					dropZones={dropZones}
					onTap={tap}
					onDrop={drop}
				/>
				<Text className="mx-5 mt-3 font-sans text-xs text-ink-muted">
					Practice uses tap to record. Your own board&apos;s gesture setting stays the
					same.
				</Text>
			</ScrollView>
			{form &&
				(form.lesson === 'save' ? (
					<ReservationForm
						visible
						account={from}
						saving={to}
						currentNetMinor={getReservationForPair(
							session.transactions,
							from.id,
							to.id
						)}
						initialAmountMinor={pair.suggestedAmountMinor}
						onSubmit={(total) =>
							submit({
								from_entity_id: from.id,
								to_entity_id: to.id,
								currency: session.currency,
								amount_minor:
									total -
									getReservationForPair(
										sessionRef.current.transactions,
										from.id,
										to.id
									),
							})
						}
						onClose={() => setForm(null)}
						tutorialHeader={chrome(true)}
						allowClear={false}
					/>
				) : (
					<CreateTransactionForm
						visible
						fromEntity={from}
						toEntity={to}
						entities={[from, to]}
						initialAmountMinor={pair.suggestedAmountMinor}
						timestamp={session.now}
						onSubmit={submit}
						onClose={() => setForm(null)}
						tutorialHeader={chrome(true)}
					/>
				))}
		</SafeAreaView>
	);
}
