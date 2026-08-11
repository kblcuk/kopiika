import { describe, expect, test } from 'bun:test';
import {
	generatePerfFixture,
	REALISTIC_COUNTS,
	type PerfFixtureCounts,
} from '../../../scripts/gen-perf-fixture';

const countByType = (fixture: ReturnType<typeof generatePerfFixture>) => ({
	income: fixture.entities.filter((e) => e.type === 'income').length,
	accounts: fixture.entities.filter((e) => e.type === 'account').length,
	categories: fixture.entities.filter((e) => e.type === 'category').length,
	savings: fixture.entities.filter((e) => e.type === 'saving').length,
});

describe('generatePerfFixture entity-count variants', () => {
	test('defaults are unchanged by the counts refactor (KII-124 fixture stays byte-identical)', () => {
		const implicit = generatePerfFixture({ years: 1 });
		const explicit = generatePerfFixture({
			years: 1,
			counts: { income: 4, accounts: 10, categories: 30, savings: 20 },
		});
		expect(countByType(implicit)).toEqual({
			income: 4,
			accounts: 10,
			categories: 30,
			savings: 20,
		});
		expect(explicit.entities).toEqual(implicit.entities);
		expect(explicit.transactions).toEqual(implicit.transactions);
	});

	test('realistic counts shape the entity set and keep transactions valid', () => {
		const counts: PerfFixtureCounts = REALISTIC_COUNTS;
		const fixture = generatePerfFixture({ years: 1, counts });
		expect(countByType(fixture)).toEqual({
			income: 2,
			accounts: 4,
			categories: 12,
			savings: 6,
		});
		const ids = new Set(fixture.entities.map((e) => e.id));
		for (const t of fixture.transactions) {
			expect(ids.has(t.from_entity_id)).toBe(true);
			expect(ids.has(t.to_entity_id)).toBe(true);
		}
	});
});
