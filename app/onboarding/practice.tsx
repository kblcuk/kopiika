import { useCallback, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useStore } from '@/src/store';
import {
	createPracticeSession,
	findPracticeMovementLesson,
	getPracticeEntities,
	getPracticeGuidanceType,
	getPracticeLessonPair,
	getPracticeTapLesson,
	submitPracticeMovement,
	submitPracticePlan,
	advancePracticeLesson,
	startPracticeExploring,
	type PracticeLesson,
} from '@/src/onboarding/practice-session';
import type { EntityWithBalance } from '@/src/types';
import type { MutationInput } from '@/src/utils/transaction-validation';
import { createDropZoneRegistry } from '@/src/utils/drop-zone';
import { computeSummary } from '@/src/utils/entity-balances';
import { generateId } from '@/src/utils/ids';
import { getReservationForPair } from '@/src/utils/savings-transactions';
import { Text } from '@/src/components/text';
import { SummaryHeaderView } from '@/src/components/summary-header-view';
import { PracticeBoard } from '@/src/components/practice-board';
import { PracticeGuidance, PracticeNote } from '@/src/components/practice-guidance';
import { CreateTransactionForm } from '@/src/components/create-transaction-form';
import { PracticePlanForm } from '@/src/components/practice-plan-form';
import { ReservationForm } from '@/src/components/reservation-form';
import { TestIDs } from '@/e2e/support/test-ids';

const FIXED_OPTIONS_NOTE =
	'Change the example amount if you like, then Save. Other options stay fixed for this exercise.';
const FINISH_LABEL: Record<string, string> = {
	settings: 'Back to Settings',
	help: 'Back to Help',
};

function PracticeChrome({ exitTestID, onExit }: { exitTestID: string; onExit: () => void }) {
	return (
		<View className="flex-row items-center justify-between border-b border-paper-300 px-4 py-4">
			<Text className="mr-3 flex-1 font-sans-semibold text-sm text-ink-muted">
				Practice · example money
			</Text>
			<Pressable accessibilityRole="button" testID={exitTestID} onPress={onExit} hitSlop={12}>
				<Text className="font-sans text-sm text-ink">Exit tutorial</Text>
			</Pressable>
		</View>
	);
}

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
	const [demo, setDemo] = useState(0);
	const [editMode, setEditMode] = useState(false);
	const [incomeVisible, setIncomeVisible] = useState(true);
	const [form, setForm] = useState<{ lesson: PracticeLesson; submissionId: string } | null>(null);
	const update = (next: typeof session) => {
		setDemo(0);
		setEditMode(false);
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
	const entities = useMemo(() => getPracticeEntities(session), [session]);
	const summary = useMemo(
		() =>
			computeSummary(
				entities.filter((e) => e.type === 'account'),
				entities.filter((e) => e.type === 'category')
			),
		[entities]
	);
	const pair = getPracticeLessonPair(form ? { ...session, lesson: form.lesson } : session);
	const from = entities.find((e) => e.id === pair.fromId)!;
	const to = entities.find((e) => e.id === pair.toId)!;
	const open = (lesson = session.lesson) => {
		if (form || !active.current) return;
		if (session.phase !== 'action' && session.phase !== 'explore') {
			setHint('See the result beside Main account, then continue.');
			return;
		}
		setHint('');
		setDemo(0);
		setForm({ lesson, submissionId: generateId() });
	};
	const tap = (entity: EntityWithBalance) => {
		if (session.lesson === 'plan' && session.phase === 'action') {
			if (editMode && entity.id === 'practice-category') open('plan');
			else setHint('Tap Edit board (the pencil above), then Groceries.');
			return;
		}

		const lesson = getPracticeTapLesson(entity.type);
		if (lesson && (session.phase === 'explore' || lesson === session.lesson)) open(lesson);
		else setHint('Try the highlighted movement, or use the action beside it.');
	};
	const drop = (entity: EntityWithBalance, targetId: string | null) => {
		if (!targetId) return;
		const lesson = findPracticeMovementLesson(entity.id, targetId);
		if (lesson && (session.phase === 'explore' || lesson === session.lesson)) open(lesson);
		else setHint('Try the highlighted movement, or use the action beside it.');
	};
	const submit = async (input: MutationInput) => {
		if (!active.current || !form) throw new Error('This practice session has ended.');
		update(submitPracticeMovement(sessionRef.current, input, form.submissionId));
	};
	const label = (replay && FINISH_LABEL[origin!]) || 'Create my board';
	const sheetChrome = (
		<PracticeChrome exitTestID={TestIDs.onboarding.practiceSheetExit} onExit={exit} />
	);
	return (
		<SafeAreaView className="flex-1 bg-paper-50" edges={['top', 'bottom']}>
			<PracticeChrome exitTestID={TestIDs.onboarding.practiceExit} onExit={exit} />
			<SummaryHeaderView
				currency={session.currency}
				summary={summary}
				incomeVisible={incomeVisible}
				topInset={false}
				editMode={editMode}
				editDisabled={session.lesson !== 'plan' || session.phase !== 'action'}
				onToggleEditMode={() => setEditMode((value) => !value)}
				onToggleIncome={() => {
					if (session.lesson === 'receive' && session.phase === 'action') {
						setHint('Keep Income visible for this lesson.');
						return;
					}
					setIncomeVisible((value) => !value);
				}}
			/>
			<PracticeBoard
				entities={entities}
				highlightedIds={session.phase === 'action' ? [pair.fromId, pair.toId] : []}
				dropZones={dropZones}
				onTap={tap}
				onDrop={drop}
				incomeVisible={incomeVisible}
				lesson={session.lesson}
				editMode={editMode}
				demo={demo}
				guidanceType={getPracticeGuidanceType(session)}
				guidance={
					<PracticeGuidance
						session={session}
						entities={entities}
						editMode={editMode}
						hint={hint}
						onRecord={() => {
							if (session.lesson === 'plan') setEditMode(true);
							open();
						}}
						onNext={() => update(advancePracticeLesson(sessionRef.current))}
						onFinish={exit}
						onExplore={() => update(startPracticeExploring(sessionRef.current))}
						finishLabel={label}
						onDemo={() =>
							session.lesson === 'plan'
								? setHint(
										'Use the pencil above to enter edit mode, then tap Groceries. Planned Amount is the only field to change here.'
									)
								: setDemo((n) => n + 1)
						}
					/>
				}
			/>

			{form &&
				(form.lesson === 'plan' ? (
					<PracticePlanForm
						visible
						entity={from}
						period={session.period}
						initialPlannedMinor={pair.suggestedAmountMinor}
						onClose={() => setForm(null)}
						tutorialHeader={sheetChrome}
						guidance={
							<PracticeNote>
								Set the monthly Planned Amount, then Save. A plan is your spending
								target; it doesn&apos;t move or reserve money.
							</PracticeNote>
						}
						onSubmit={async (amount) => {
							if (!active.current)
								throw new Error('This practice session has ended.');
							update(
								submitPracticePlan(sessionRef.current, amount, form.submissionId)
							);
						}}
					/>
				) : form.lesson === 'save' ? (
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
						tutorialHeader={sheetChrome}
						guidance={<PracticeNote>{FIXED_OPTIONS_NOTE}</PracticeNote>}
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
						tutorialHeader={sheetChrome}
						guidance={<PracticeNote>{FIXED_OPTIONS_NOTE}</PracticeNote>}
					/>
				))}
		</SafeAreaView>
	);
}
