import type { Entity, EntityWithBalance, Plan, Transaction } from '@/src/types';
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
const LESSONS: PracticeLesson[] = ['receive', 'spend', 'plan', 'save'];

export function createPracticeSession(currency: string, now = Date.now()): PracticeSession {
	const date = new Date(now);
	return {
		currency,
		now,
		period: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
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

export function getPracticeLessonPair(session: PracticeSession) {
	const pairs = {
		receive: { fromId: 'practice-income', toId: 'practice-account', amount: 1000 },
		spend: { fromId: 'practice-account', toId: 'practice-category', amount: 30 },
		plan: { fromId: 'practice-category', toId: 'practice-category', amount: 300 },
		save: { fromId: 'practice-account', toId: 'practice-saving', amount: 100 },
	};
	const pair = pairs[session.lesson];
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
	const pair = getPracticeLessonPair(session);
	const taughtPair = LESSONS.filter((lesson) => lesson !== 'plan').some((lesson) => {
		const p = getPracticeLessonPair({ ...session, lesson });
		return p.fromId === input.from_entity_id && p.toId === input.to_entity_id;
	});
	if (
		!taughtPair ||
		(session.phase === 'action' &&
			(pair.fromId !== input.from_entity_id || pair.toId !== input.to_entity_id))
	) {
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

export function advancePracticeLesson(session: PracticeSession): PracticeSession {
	if (session.phase !== 'feedback') return session;
	const next = LESSONS[LESSONS.indexOf(session.lesson) + 1];
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
