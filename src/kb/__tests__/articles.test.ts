import { describe, test, expect } from 'bun:test';
import { KB_ARTICLES_META } from '../articles-meta';

describe('KB_ARTICLES registry', () => {
	test('contains 10 articles', () => {
		expect(KB_ARTICLES_META).toHaveLength(10);
	});

	test('all ids are unique', () => {
		const ids = KB_ARTICLES_META.map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test('every article has non-empty title and summary', () => {
		for (const article of KB_ARTICLES_META) {
			expect(article.title.length).toBeGreaterThan(0);
			expect(article.summary.length).toBeGreaterThan(0);
		}
	});

	test('all `related` references point to known article ids', () => {
		const ids = new Set(KB_ARTICLES_META.map((a) => a.id));
		for (const article of KB_ARTICLES_META) {
			for (const ref of article.related ?? []) {
				expect(ids).toContain(ref);
			}
		}
	});

	test('known ids are present', () => {
		const ids = KB_ARTICLES_META.map((a) => a.id);
		expect(ids).toEqual(
			expect.arrayContaining([
				'core-loop',
				'entity-types',
				'board-gestures',
				'transaction-types',
				'tabs-and-views',
				'reservations',
				'refunds',
				'recurring',
				'splits',
				'investment-accounts',
			])
		);
	});
});
