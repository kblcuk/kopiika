import type { InferSelectModel } from 'drizzle-orm';
import * as schema from '@/src/db/drizzle-schema';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface RecurrenceRuleSimple {
	type: RecurrenceFrequency;
}

// Future-proofing: custom patterns will extend this union
export type RecurrenceRule = RecurrenceRuleSimple;

type DrizzleRecurrenceTemplate = InferSelectModel<typeof schema.recurrenceTemplates>;

// KII-123: `exclusions` is no longer a column on `recurrence_templates` — it
// lives in the normalized `recurrence_exclusions` table. We still attach it
// to the in-memory shape so consumers (backfill, occurrence generation,
// CSV export) can treat a template as a self-contained unit. Hydration
// joins the two tables in the store; DB writes go through the dedicated
// `addExclusion` helper, never as part of a template-row update.
export type RecurrenceTemplate = Omit<
	DrizzleRecurrenceTemplate,
	'note' | 'end_date' | 'end_count' | 'is_deleted' | 'updated_at'
> & {
	note?: string | null;
	end_date?: number | null;
	end_count?: number | null;
	exclusions?: number[];
	is_deleted?: boolean;
	updated_at?: number;
};
