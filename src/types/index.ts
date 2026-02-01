import type { InferSelectModel } from 'drizzle-orm';
import * as schema from '@/src/db/drizzle-schema';

// Drizzle-inferred types with optional fields properly typed
// Drizzle returns `| null` for optional fields, but our app uses `| undefined`
type DrizzleEntity = InferSelectModel<typeof schema.entities>;
type DrizzlePlan = InferSelectModel<typeof schema.plans>;
type DrizzleTransaction = InferSelectModel<typeof schema.transactions>;

// Convert Drizzle's null types to optional (undefined) for better TypeScript ergonomics
export type Entity = Omit<DrizzleEntity, 'icon' | 'color' | 'owner_id' | 'include_in_total'> & {
	icon?: string | null;
	color?: string | null;
	owner_id?: string | null;
	include_in_total?: boolean;
};

export type Plan = DrizzlePlan;

export type Transaction = Omit<DrizzleTransaction, 'note'> & {
	note?: string | null;
};

// Extract EntityType from Drizzle schema
export type EntityType = Entity['type'];
export type PlanPeriod = 'month' | 'all-time';

// Period semantics:
// - period: 'month' = recurring monthly plan, period_start indicates which month (e.g., '2026-01')
// - period: 'all-time' = cumulative goal (e.g., savings), period_start indicates when goal was created (e.g., '2026-01')

// Derived types for UI
export interface EntityWithBalance extends Entity {
	planned: number;
	actual: number;
	remaining: number;
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
