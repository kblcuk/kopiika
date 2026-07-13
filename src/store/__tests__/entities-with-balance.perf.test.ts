import { describe, test, expect } from 'bun:test';
import { generatePerfFixture } from '@/scripts/gen-perf-fixture';
import { getEntitiesWithBalance } from '../index';

// KII-124: regression guard for the single-pass balance derivation. The old
// implementation was O(entities × transactions) — each entity re-walked the
// whole array — which made a Summary month switch cost ~340ms on this dataset
// and blocked the JS thread. The single-pass rewrite is O(transactions).
//
// The dataset (~14.7k transactions, 64 entities) is generated deterministically
// at test time (not checked in). The bound is deliberately generous — the
// single-pass path does this in single-digit ms in Node, so 1s can't flake on
// CI, but a regression to the old per-entity / O(n²) shape would blow past it.
const BUDGET_MS = 1000;

describe('getEntitiesWithBalance performance', () => {
	test('six summary-style derivations over ~14.7k transactions stay well under budget', () => {
		const { entities, transactions } = generatePerfFixture();
		expect(transactions.length).toBeGreaterThan(10_000);

		const plans: never[] = [];
		const period = '2026-05';
		// warm up (module JIT) so the timed section reflects steady state
		getEntitiesWithBalance(entities, plans, transactions, period, 'saving');

		const start = Date.now();
		// mirror a Summary month switch: category + saving + 4× sparkline trend
		getEntitiesWithBalance(entities, plans, transactions, period, 'category');
		getEntitiesWithBalance(entities, plans, transactions, period, 'saving');
		for (const p of ['2026-02', '2026-03', '2026-04', '2026-05']) {
			getEntitiesWithBalance(entities, plans, transactions, p, 'category');
		}
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(BUDGET_MS);
	});
});
