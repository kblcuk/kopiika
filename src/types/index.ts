import type { InferSelectModel } from 'drizzle-orm';
import * as schema from '@/src/db/drizzle-schema';

// Drizzle-inferred types with optional fields properly typed
// Drizzle returns `| null` for optional fields, but our app uses `| undefined`
type DrizzleEntity = InferSelectModel<typeof schema.entities>;
type DrizzlePlan = InferSelectModel<typeof schema.plans>;
type DrizzleTransaction = InferSelectModel<typeof schema.transactions>;

// Convert Drizzle's null types to optional (undefined) for better TypeScript ergonomics
// KII-132: the boolean fields below are made optional via `Omit + &`, which
// forces `!== false` checks scattered throughout the codebase (e.g.
// `utils/export.ts:33`). Default them at the DB read boundary instead and
// keep these non-optional booleans on `Entity`.
//
// `created_at`/`updated_at` are also marked optional: callers don't supply
// them (DB helpers stamp `Date.now()` on insert and bump on every update via
// `$onUpdate`). Reads still see them as required because the DB columns are
// NOT NULL, but TypeScript can't express "required on read, optional on
// write" without two types — keeping them optional is the simpler trade-off.
export type Entity = Omit<
	DrizzleEntity,
	| 'icon'
	| 'color'
	| 'include_in_total'
	| 'is_deleted'
	| 'is_default'
	| 'is_investment'
	| 'created_at'
	| 'updated_at'
> & {
	icon?: string | null;
	color?: string | null;
	include_in_total?: boolean;
	is_deleted?: boolean;
	is_default?: boolean;
	is_investment?: boolean;
	created_at?: number;
	updated_at?: number;
};

export type Plan = Omit<DrizzlePlan, 'created_at' | 'updated_at'> & {
	created_at?: number;
	updated_at?: number;
};

export type Transaction = Omit<
	DrizzleTransaction,
	'note' | 'series_id' | 'is_confirmed' | 'notification_id' | 'created_at' | 'updated_at'
> & {
	note?: string | null;
	series_id?: string | null;
	is_confirmed?: boolean;
	notification_id?: string | null;
	created_at?: number;
	updated_at?: number;
	/** In-memory ONLY — never persisted. Set on derived future recurrence
	 * occurrences so the UI can materialize them on edit/delete/confirm. DB
	 * write paths must never read or write this. */
	isVirtual?: boolean;
};

export type MarketValueSnapshot = {
	id: string;
	entity_id: string;
	// KII-120: integer minor units (cents for EUR). Use toMinor/toMajor at the
	// UI boundary.
	amount_minor: number;
	currency: string;
	date: number;
	created_at?: number;
	updated_at?: number;
};

// Extract EntityType from Drizzle schema
export type EntityType = Entity['type'];

export type EntityColorKey =
	| 'amethyst'
	| 'emerald'
	| 'sapphire'
	| 'ruby'
	| 'jade'
	| 'amber'
	| 'lilac'
	| 'teal';

/** A staged entity awaiting commit. `EntityCreateModal`'s staging mode emits
 * this instead of writing to the store, letting callers (onboarding, bank
 * import) persist it atomically later. */
export interface EntityDraft {
	type: EntityType;
	name: string;
	icon: string;
	color: EntityColorKey | null;
	isInvestment: boolean;
	// KII-120: integer minor units (cents for EUR). `null` if the user left
	// the planned-amount input empty.
	plannedAmountMinor: number | null;
}
// Period semantics:
// All plans use period='all-time' - a static budget/goal that applies the same way every month.
// The period_start field indicates when the plan was created (YYYY-MM format).
// Transaction actuals are still calculated per-month for income/categories.

// Derived types for UI
// KII-120: All monetary fields below are integer minor units. Use
// `formatAmount(value, currency)` for display.
export interface EntityWithBalance extends Entity {
	planned: number;
	actual: number;
	remaining: number;
	upcoming: number; // sum of future-dated transactions (timestamp > now)
	unconfirmed?: number; // sum of past-due unconfirmed transactions
	reserved?: number; // accounts only: total reserved across savings goals
	latestMarketValue?: number | null; // accounts only: latest market value snapshot
}

// KII-132: `getCurrentPeriod` / `getPeriodRange` are runtime helpers living in
// the types barrel. Move to `src/utils/period.ts` (or merge into `format.ts`)
// so this file stays types-only.
// Helper to get current period in YYYY-MM format
export function getCurrentPeriod(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Helper to get period start/end timestamps
export function getPeriodRange(period: string): { start: number; end: number } {
	const [year, month] = period.split('-').map(Number) as [number, number];
	const start = new Date(year, month - 1, 1).getTime();
	const end = new Date(year, month, 0, 23, 59, 59, 999).getTime();
	return { start, end };
}
