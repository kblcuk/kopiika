import { describe, expect, test } from 'bun:test';
import {
	createPracticeSession,
	submitPracticePlan,
	submitPracticeMovement,
	advancePracticeLesson,
	startPracticeExploring,
	getPracticeEntities,
	getPracticeLessonPair,
} from '../practice-session';

const now = new Date(2026, 9, 31, 23, 59).getTime();
function save(session: ReturnType<typeof createPracticeSession>, amount: number, id: string) {
	const pair = getPracticeLessonPair(session);
	return submitPracticeMovement(
		session,
		{
			from_entity_id: pair.fromId,
			to_entity_id: pair.toId,
			amount_minor: amount,
			currency: session.currency,
		},
		id
	);
}

describe('practice session', () => {
	test.each([
		['EUR', 100000, 3000, 10000],
		['JPY', 1000, 30, 100],
		['KWD', 1000000, 30000, 100000],
	] as const)(
		'%s converts suggested major units at each lesson',
		(currency, income, expense, saving) => {
			let s = createPracticeSession(currency, now);
			expect(s.transactions).toEqual([]);
			expect(getPracticeLessonPair(s).suggestedAmountMinor).toBe(income);
			s = advancePracticeLesson(save(s, income, 'a'));
			expect(getPracticeLessonPair(s).suggestedAmountMinor).toBe(expense);
			s = advancePracticeLesson(save(s, expense, 'b'));
			s = advancePracticeLesson(
				submitPracticePlan(
					s,
					300 * (currency === 'JPY' ? 1 : currency === 'KWD' ? 1000 : 100),
					'plan'
				)
			);
			expect(getPracticeLessonPair(s).suggestedAmountMinor).toBe(saving);
		}
	);
	test('receive, spend, and reserve derive available, reserved and total without changing earlier sessions', () => {
		const initial = createPracticeSession('EUR', now);
		let s = save(initial, 100000, 'a');
		expect(s.phase).toBe('feedback');
		expect(initial.transactions).toEqual([]);
		s = advancePracticeLesson(s);
		s = advancePracticeLesson(save(s, 3000, 'b'));
		s = advancePracticeLesson(submitPracticePlan(s, 30000, 'plan'));
		s = save(s, 10000, 'c');
		const byName = new Map(getPracticeEntities(s).map((e) => [e.name, e]));
		expect(byName.get('Salary')?.actual).toBe(100000);
		expect(byName.get('Groceries')?.actual).toBe(3000);
		expect(byName.get('Main account')?.actual).toBe(87000);
		expect(byName.get('Main account')?.reserved).toBe(10000);
		expect(byName.get('Vacation')?.actual).toBe(10000);
		expect(advancePracticeLesson(s).phase).toBe('complete');
		expect(s.transactions.every((t) => t.timestamp === now && t.is_confirmed)).toBe(true);
		expect(s.period).toBe('2026-10');
	});
	test('requires a successful current-pair save and prevents duplicate or premature advancement', () => {
		const initial = createPracticeSession('EUR', now);
		expect(advancePracticeLesson(initial)).toBe(initial);
		const pair = getPracticeLessonPair(initial);
		expect(() => save(initial, 0, 'bad')).toThrow();
		expect(() =>
			submitPracticeMovement(
				initial,
				{
					from_entity_id: pair.toId,
					to_entity_id: pair.fromId,
					amount_minor: 100,
					currency: 'EUR',
				},
				'bad'
			)
		).toThrow();
		const s = save(initial, 12345, 'one');
		expect(save(s, 12345, 'one')).toBe(s);
		expect(() => save(s, 12345, 'two')).toThrow();
		expect(getPracticeEntities(s).find((e) => e.name === 'Main account')?.actual).toBe(12345);
	});
	test('exploring permits only taught pairs and keeps editable overspending visible', () => {
		let s = createPracticeSession('EUR', now);
		s = advancePracticeLesson(save(s, 1000, 'a'));
		s = advancePracticeLesson(save(s, 3000, 'b'));
		s = advancePracticeLesson(submitPracticePlan(s, 30000, 'plan'));
		s = advancePracticeLesson(save(s, 100, 'c'));
		s = startPracticeExploring(s);
		const es = getPracticeEntities(s);
		expect(es.find((e) => e.name === 'Main account')?.actual).toBe(-2100);
		const salary = es.find((e) => e.name === 'Salary')!;
		const account = es.find((e) => e.name === 'Main account')!;
		s = submitPracticeMovement(
			s,
			{
				from_entity_id: salary.id,
				to_entity_id: account.id,
				amount_minor: 5000,
				currency: 'EUR',
			},
			'd'
		);
		expect(s.phase).toBe('explore');
		expect(() =>
			submitPracticeMovement(
				s,
				{
					from_entity_id: account.id,
					to_entity_id: salary.id,
					amount_minor: 100,
					currency: 'EUR',
				},
				'e'
			)
		).toThrow();
	});
});

test('a plan reduces remaining spending without moving money', () => {
	let s = createPracticeSession('EUR', now);
	s = advancePracticeLesson(save(s, 100000, 'income'));
	s = advancePracticeLesson(save(s, 3000, 'expense'));
	expect(s.lesson).toBe('plan');
	const transactions = s.transactions;
	const accountBefore = getPracticeEntities(s).find((e) => e.id === 'practice-account')!.actual;
	const planned = submitPracticePlan(s, 30000, 'plan');
	expect(planned.plans).toHaveLength(1);
	expect(s.plans).toEqual([]);
	expect(planned.transactions).toBe(transactions);
	expect(getPracticeEntities(planned).find((e) => e.id === 'practice-account')!.actual).toBe(
		accountBefore
	);
	expect(getPracticeEntities(planned).find((e) => e.id === 'practice-category')).toMatchObject({
		planned: 30000,
		actual: 3000,
		remaining: 27000,
	});
	expect(submitPracticePlan(planned, 30000, 'plan')).toBe(planned);
	expect(() => submitPracticePlan(s, NaN, 'invalid')).toThrow();
	expect(() => submitPracticePlan(s, 0, 'zero')).toThrow();
	expect(advancePracticeLesson(planned).lesson).toBe('save');
});

test('a plan below spending keeps overspending visible without changing cash', () => {
	let s = advancePracticeLesson(save(createPracticeSession('EUR', now), 100000, 'income'));
	s = advancePracticeLesson(save(s, 3000, 'expense'));
	s = submitPracticePlan(s, 2000, 'budget');
	expect(getPracticeEntities(s).find((e) => e.id === 'practice-category')!.remaining).toBe(-1000);
	expect(getPracticeEntities(s).find((e) => e.id === 'practice-account')!.actual).toBe(97000);
});
