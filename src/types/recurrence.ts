import type { InferSelectModel } from 'drizzle-orm';
import * as schema from '@/src/db/drizzle-schema';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface RecurrenceRuleSimple {
	type: RecurrenceFrequency;
}

// Future-proofing: custom patterns will extend this union
export type RecurrenceRule = RecurrenceRuleSimple;

type DrizzleRecurrenceTemplate = InferSelectModel<typeof schema.recurrenceTemplates>;

export type RecurrenceTemplate = Omit<
	DrizzleRecurrenceTemplate,
	'note' | 'end_date' | 'end_count' | 'exclusions' | 'is_deleted' | 'updated_at'
> & {
	note?: string | null;
	end_date?: number | null;
	end_count?: number | null;
	exclusions?: string | null;
	is_deleted?: boolean;
	updated_at?: number;
};
