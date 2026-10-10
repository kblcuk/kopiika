import type { Entity, EntityWithBalance, Transaction } from '@/src/types';
import { getEntitiesWithBalance } from '@/src/utils/entity-balances';
import { buildTransaction } from '@/src/utils/transaction-builder';
import {
	ensureValid,
	validateTransaction,
	type MutationInput,
} from '@/src/utils/transaction-validation';
import { toMinor } from '@/src/utils/money';

export type PracticeLesson = 'receive' | 'spend' | 'save';
export type PracticePhase = 'action' | 'feedback' | 'complete' | 'explore';
export interface PracticeSession {
	entities: Entity[];
	transactions: Transaction[];
	currency: string;
	now: number;
	period: string;
	lesson: PracticeLesson;
	phase: PracticePhase;
	acceptedSubmissionIds: string[];
}
const LESSONS: PracticeLesson[] = ['receive', 'spend', 'save'];

export function createPracticeSession(currency: string, now = Date.now()): PracticeSession {
	const date = new Date(now);
	return {
		currency,
		now,
		period: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
		lesson: 'receive',
		phase: 'action',
		transactions: [],
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
	const taughtPair = LESSONS.some((lesson) => {
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
			[],
			session.transactions,
			session.period,
			type,
			undefined,
			session.now
		)
	);
}
