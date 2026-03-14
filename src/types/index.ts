import type { InferSelectModel } from 'drizzle-orm';
import * as schema from '@/src/db/drizzle-schema';

// Drizzle-inferred types with optional fields properly typed
// Drizzle returns `| null` for optional fields, but our app uses `| undefined`
type DrizzleEntity = InferSelectModel<typeof schema.entities>;
type DrizzlePlan = InferSelectModel<typeof schema.plans>;
type DrizzleTransaction = InferSelectModel<typeof schema.transactions>;

// Convert Drizzle's null types to optional (undefined) for better TypeScript ergonomics
export type Entity = Omit<
	DrizzleEntity,
	'icon' | 'color' | 'owner_id' | 'include_in_total' | 'is_deleted'
> & {
	icon?: string | null;
	color?: string | null;
	owner_id?: string | null;
	include_in_total?: boolean;
	is_deleted?: boolean;
};

export type Plan = DrizzlePlan;

export type Transaction = Omit<DrizzleTransaction, 'note'> & {
	note?: string | null;
};

export type { Reservation } from '@/src/db/reservations';

// Extract EntityType from Drizzle schema
export type EntityType = Entity['type'];
// Period type kept for backwards compatibility - all plans now use 'all-time'
export type PlanPeriod = 'month' | 'all-time';

// Period semantics:
// All plans use period='all-time' - a static budget/goal that applies the same way every month.
// The period_start field indicates when the plan was created (YYYY-MM format).
// Transaction actuals are still calculated per-month for income/categories.

// Derived types for UI
export interface EntityWithBalance extends Entity {
	planned: number;
	actual: number;
	remaining: number;
	upcoming: number; // sum of future-dated transactions (timestamp > now)
	reserved?: number; // accounts only: total reserved across savings goals
}

// Helper to get current period in YYYY-MM format
export function getCurrentPeriod(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Helper to get period start/end timestamps
export function getPeriodRange(period: string): { start: number; end: number } {
	const [year, month] = period.split('-').map(Number);
	const start = new Date(year, month - 1, 1).getTime();
	const end = new Date(year, month, 0, 23, 59, 59, 999).getTime();
	return { start, end };
}
