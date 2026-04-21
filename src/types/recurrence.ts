import type { InferSelectModel } from 'drizzle-orm';
import * as schema from '@/src/db/drizzle-schema';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRuleSimple {
	type: RecurrenceFrequency;
}

// Future-proofing: custom patterns will extend this union
export type RecurrenceRule = RecurrenceRuleSimple;

export const HORIZON_OPTIONS = [
	{ label: '1 month', days: 30 },
	{ label: '3 months', days: 90 },
	{ label: '6 months', days: 180 },
	{ label: '1 year', days: 365 },
] as const;

export const DEFAULT_HORIZON_DAYS = 90;

type DrizzleRecurrenceTemplate = InferSelectModel<typeof schema.recurrenceTemplates>;

export type RecurrenceTemplate = Omit<
	DrizzleRecurrenceTemplate,
	'note' | 'end_date' | 'end_count' | 'exclusions' | 'is_deleted'
> & {
	note?: string | null;
	end_date?: number | null;
	end_count?: number | null;
	exclusions?: string | null;
	is_deleted?: boolean;
};
