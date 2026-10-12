import type {
	Entity,
	EntityType,
	EntityWithBalance,
	Plan,
	Transaction,
	MarketValueSnapshot,
} from '@/src/types';
import { getPeriodRange } from '@/src/types';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { getTotalReservedForAccount } from './savings-transactions';
import { isDue } from './due';

export interface SummaryData {
	balance: number;
	expenses: number;
	remaining: number;
}

/** Dashboard headline numbers from already-derived account and category balances. */
export function computeSummary(
	accountsWithBalance: EntityWithBalance[],
	categoriesWithBalance: EntityWithBalance[]
): SummaryData {
	// Balance: sum of account actuals with include_in_total as true (default)
	const balance = accountsWithBalance
		.filter((a) => (a.include_in_total ?? true) && a.is_investment !== true)
		.reduce((sum, a) => sum + a.actual, 0);

	// Expenses: sum of category actuals
	const expenses = categoriesWithBalance.reduce((sum, c) => sum + c.actual, 0);

	// Remaining: how much is left to spend across categories that have a plan
	// Overspent categories contribute 0 (not negative) so they don't reduce the total
	const remaining = categoriesWithBalance
		.filter((c) => c.planned > 0)
		.reduce((sum, c) => sum + Math.max(0, c.planned - c.actual), 0);

	return { balance, expenses, remaining };
}

// Pure function to calculate balances for entities (testable without React)
export function getEntitiesWithBalance(
	entities: Entity[],
	plans: Plan[],
	transactions: Transaction[],
	currentPeriod: string,
	type: EntityType,
	marketValueSnapshots?: MarketValueSnapshot[],
	now: number = Date.now()
): EntityWithBalance[] {
	const { start, end } = getPeriodRange(currentPeriod);
	// Filter by type and exclude system entities (balance adjustments)
	const filteredEntities = entities
		.filter(
			(e) => e.type === type && e.id !== BALANCE_ADJUSTMENT_ENTITY_ID && e.is_deleted !== true
		)
		.sort((a, b) => a.row - b.row || a.position - b.position);

	// Accounts and savings use all transactions (all-time balance); income and
	// categories use the current period only.
	const useAllTime = type === 'account' || type === 'saving';

	// KII-124: single pass over `transactions` accumulating per-entity bucket
	// totals, replacing the previous per-entity filter/reduce. The old shape was
	// O(entities × transactions) — each entity re-walked the whole array (all of
	// it, for all-time account/saving) three times — which dominated the
	// month-switch cost on multi-year histories. This is O(transactions).
	const buckets = new Map<string, { actual: number; upcoming: number; unconfirmed: number }>();
	for (const entity of filteredEntities) {
		buckets.set(entity.id, { actual: 0, upcoming: 0, unconfirmed: 0 });
	}

	// Signed contribution of one transaction to one tracked entity, preserving
	// the previous `calcBalance` semantics exactly:
	// - account/saving: net flow — incoming (+), outgoing (-)
	// - income: money flowing OUT is positive (from +), in is negative (to -)
	// - category: only incoming counts (to +); as a source it contributes 0
	const contribution = (t: Transaction, entityId: string): number => {
		switch (type) {
			case 'account':
			case 'saving':
				if (t.from_entity_id === entityId) return -t.amount_minor;
				if (t.to_entity_id === entityId) return t.amount_minor;
				return 0;
			case 'income':
				if (t.from_entity_id === entityId) return t.amount_minor;
				if (t.to_entity_id === entityId) return -t.amount_minor;
				return 0;
			case 'category':
				return t.to_entity_id === entityId ? t.amount_minor : 0;
		}
	};

	for (const t of transactions) {
		// Income/categories are period-scoped; accounts/savings are all-time.
		if (!useAllTime && (t.timestamp < start || t.timestamp > end)) continue;

		// KII-132: `is_confirmed === undefined` is treated as confirmed here
		// (`!== false`) but as unconfirmed by the badge count (`=== false`).
		// Normalize to a non-optional boolean at the DB read boundary.
		let bucketKey: 'actual' | 'upcoming' | 'unconfirmed';
		if (!isDue(t.timestamp, now)) {
			// Future rows only count toward "upcoming" up to the period end;
			// anything past `end` is out of view for every bucket.
			if (t.timestamp > end) continue;
			bucketKey = 'upcoming';
		} else {
			bucketKey = t.is_confirmed !== false ? 'actual' : 'unconfirmed';
		}

		// A transaction can touch two tracked entities of the same type (e.g. an
		// account→account transfer): debit the source and credit the destination
		// from the same row. Validation rejects from===to (SAME_ENTITY), but guard
		// against degenerate/imported self-referential rows so a single bucket
		// isn't debited twice (from-branch matches first, doubling the outflow).
		const fromBucket = buckets.get(t.from_entity_id);
		if (fromBucket) fromBucket[bucketKey] += contribution(t, t.from_entity_id);
		if (t.to_entity_id !== t.from_entity_id) {
			const toBucket = buckets.get(t.to_entity_id);
			if (toBucket) toBucket[bucketKey] += contribution(t, t.to_entity_id);
		}
	}

	return filteredEntities.map((entity) => {
		// All plans use 'all-time' period - static budget/goal that applies every month
		const plan = plans.find((p) => p.entity_id === entity.id && p.period === 'all-time');
		const planned = plan?.planned_amount_minor ?? 0;

		const bucket = buckets.get(entity.id)!;

		// Track how much of the account's outflows went to savings (for funding-section breakdown)
		// Since KII-61 savings are real transactions already reflected in actual
		const reserved =
			entity.type === 'account'
				? getTotalReservedForAccount(transactions, entities, entity.id)
				: 0;

		// For investment accounts, find the latest market value snapshot
		let latestMarketValue: number | null = null;
		if (entity.type === 'account' && entity.is_investment && marketValueSnapshots) {
			const latest = marketValueSnapshots
				.filter((s) => s.entity_id === entity.id)
				.sort((a, b) => b.date - a.date)[0];
			if (latest) {
				latestMarketValue = latest.amount_minor;
			}
		}

		return {
			...entity,
			planned,
			actual: bucket.actual,
			upcoming: bucket.upcoming,
			unconfirmed: bucket.unconfirmed,
			reserved,
			latestMarketValue,
			remaining: planned - bucket.actual,
		};
	});
}
