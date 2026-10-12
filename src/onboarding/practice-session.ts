import type { Entity, EntityType, EntityWithBalance, Plan, Transaction } from '@/src/types';
import { getCurrentPeriod } from '@/src/types';
import { getEntitiesWithBalance } from '@/src/utils/entity-balances';
import { buildTransaction } from '@/src/utils/transaction-builder';
import {
	ensureValid,
	validateTransaction,
	type MutationInput,
} from '@/src/utils/transaction-validation';
import { toMinor } from '@/src/utils/money';

export type PracticeLesson = 'receive' | 'spend' | 'plan' | 'save';
type PracticePhase = 'action' | 'feedback' | 'complete' | 'explore';
export interface PracticeSession {
	entities: Entity[];
	transactions: Transaction[];
	plans: Plan[];
	currency: string;
	now: number;
	period: string;
	lesson: PracticeLesson;
	phase: PracticePhase;
	acceptedSubmissionIds: string[];
}
export const PRACTICE_LESSONS: PracticeLesson[] = ['receive', 'spend', 'plan', 'save'];
export const PRACTICE_PAIRS = {
	receive: { fromId: 'practice-income', toId: 'practice-account', amount: 1000 },
	spend: { fromId: 'practice-account', toId: 'practice-category', amount: 30 },
	plan: { fromId: 'practice-category', toId: 'practice-category', amount: 300 },
	save: { fromId: 'practice-account', toId: 'practice-saving', amount: 100 },
} as const satisfies Record<PracticeLesson, { fromId: string; toId: string; amount: number }>;
const MOVEMENT_LESSONS = PRACTICE_LESSONS.filter((lesson) => lesson !== 'plan');
const LESSON_FOR_TAP: Partial<Record<EntityType, PracticeLesson>> = {
	income: 'receive',
	category: 'spend',
	saving: 'save',
};

export const outsideExercise = async (): Promise<never> => {
	throw new Error('This option is outside this exercise.');
};

export function createPracticeSession(currency: string, now = Date.now()): PracticeSession {
	return {
		currency,
		now,
		period: getCurrentPeriod(now),
		lesson: 'receive',
		phase: 'action',
		transactions: [],
		plans: [],
		acceptedSubmissionIds: [],
		entities: [
			{
				id: 'practice-income',
				type: 'income',
				name: 'Salary',
				icon: 'briefcase',
				currency,
				row: 0,
				position: 0,
			},
			{
				id: 'practice-account',
				type: 'account',
				name: 'Main account',
				icon: 'wallet',
				currency,
				row: 0,
				position: 0,
			},
			{
				id: 'practice-category',
				type: 'category',
				name: 'Groceries',
				icon: 'shopping-cart',
				currency,
				row: 0,
				position: 0,
			},
			{
				id: 'practice-saving',
				type: 'saving',
				name: 'Vacation',
				icon: 'plane',
				currency,
				row: 0,
				position: 0,
			},
		],
	};
}

export function getPracticeLessonPair(session: Pick<PracticeSession, 'lesson' | 'currency'>) {
	const pair = PRACTICE_PAIRS[session.lesson];
	return {
		fromId: pair.fromId,
		toId: pair.toId,
		suggestedAmountMinor: toMinor(pair.amount, session.currency),
	};
}

export function submitPracticeMovement(
	session: PracticeSession,
	input: MutationInput,
	submissionId: string
): PracticeSession {
	if (session.acceptedSubmissionIds.includes(submissionId)) return session;
	if (session.phase !== 'action' && session.phase !== 'explore')
		throw new Error('Continue to the next lesson first.');
	ensureValid(validateTransaction(input, session.entities));
	const lesson = findPracticeMovementLesson(input.from_entity_id, input.to_entity_id);
	if (!lesson || (session.phase === 'action' && lesson !== session.lesson)) {
		throw new Error('Try the movement in this lesson.');
	}
	return {
		...session,
		transactions: [
			...session.transactions,
			buildTransaction({ ...input, timestamp: session.now, is_confirmed: true }, session.now),
		],
		acceptedSubmissionIds: [...session.acceptedSubmissionIds, submissionId],
		phase: session.phase === 'explore' ? 'explore' : 'feedback',
	};
}

/** The movement lesson a from→to pair teaches, or undefined when no lesson teaches it. */
export function findPracticeMovementLesson(fromId: string, toId: string) {
	return MOVEMENT_LESSONS.find(
		(lesson) => PRACTICE_PAIRS[lesson].fromId === fromId && PRACTICE_PAIRS[lesson].toId === toId
	);
}

/** The movement lesson that tapping a bubble of this type opens, if any. */
export function getPracticeTapLesson(type: EntityType) {
	return LESSON_FOR_TAP[type];
}

/** The board row the guidance tooltip sits beside. */
export function getPracticeGuidanceType(session: PracticeSession): EntityType {
	if (session.lesson === 'plan') return 'category';
	if (session.phase !== 'action') return 'account';
	if (session.lesson === 'receive') return 'income';
	return session.lesson === 'spend' ? 'category' : 'account';
}

export function advancePracticeLesson(session: PracticeSession): PracticeSession {
	if (session.phase !== 'feedback') return session;
	const next = PRACTICE_LESSONS[PRACTICE_LESSONS.indexOf(session.lesson) + 1];
	return next ? { ...session, lesson: next, phase: 'action' } : { ...session, phase: 'complete' };
}

export function startPracticeExploring(session: PracticeSession): PracticeSession {
	return session.phase === 'complete' ? { ...session, phase: 'explore' } : session;
}

export function getPracticeEntities(session: PracticeSession): EntityWithBalance[] {
	return (['income', 'account', 'category', 'saving'] as const).flatMap((type) =>
		getEntitiesWithBalance(
			session.entities,
			session.plans,
			session.transactions,
			session.period,
			type,
			undefined,
			session.now
		)
	);
}

export function submitPracticePlan(
	session: PracticeSession,
	plannedAmountMinor: number,
	submissionId: string
): PracticeSession {
	if (session.acceptedSubmissionIds.includes(submissionId)) return session;
	if (session.lesson !== 'plan' || session.phase !== 'action')
		throw new Error('Continue to the planning lesson first.');
	if (!Number.isSafeInteger(plannedAmountMinor) || plannedAmountMinor <= 0)
		throw new Error('Enter a positive plan amount.');
	return {
		...session,
		plans: [
			{
				id: 'practice-category-plan',
				entity_id: 'practice-category',
				period: 'all-time',
				period_start: session.period,
				planned_amount_minor: plannedAmountMinor,
			},
		],
		acceptedSubmissionIds: [...session.acceptedSubmissionIds, submissionId],
		phase: 'feedback',
	};
}
