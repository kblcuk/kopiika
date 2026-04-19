# Repeatable Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to create recurring transactions (daily/weekly/monthly/yearly) that are pre-generated as real transaction rows, with series edit/delete support.

**Architecture:** New `recurrence_templates` table stores the recurrence rule; generated transactions reference it via `series_id` FK. A pure `generateOccurrences()` function produces timestamps from a rule. Backfill runs on app init to extend the horizon. The transaction modal gains a repeat toggle; edit/delete flows gain "This one only" / "All future" action sheets.

**Tech Stack:** SQLite + Drizzle ORM, Zustand, React Native, Expo Router, Bun test runner, Jest + RNTL for component tests.

**Spec:** `docs/superpowers/specs/2026-04-17-repeatable-transactions-design.md`

---

## File Map

### New files

| File                                            | Responsibility                                                  |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `src/types/recurrence.ts`                       | `RecurrenceRule`, `RecurrenceTemplate` types, horizon constants |
| `src/utils/recurrence.ts`                       | Pure `generateOccurrences()` + date math helpers                |
| `src/utils/__tests__/recurrence.test.ts`        | Unit tests for occurrence generation                            |
| `src/db/recurrence-templates.ts`                | CRUD for `recurrence_templates` table                           |
| `src/db/__tests__/recurrence-templates.test.ts` | DB layer tests                                                  |
| `src/components/series-action-sheet.tsx`        | "This one only" / "All future" action sheet                     |

### Modified files

| File                                   | Changes                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/drizzle-schema.ts`             | Add `recurrence_templates` table, `series_id` column on `transactions`                                                                      |
| `src/types/index.ts`                   | Add `series_id` to `Transaction` type                                                                                                       |
| `src/db/index.ts`                      | Re-export `recurrence-templates` module                                                                                                     |
| `src/db/transactions.ts`               | Add `getTransactionsBySeriesId`, `deleteTransactionsBySeriesFuture`, `updateTransactionsBySeriesFuture`, `createTransactionBatch`           |
| `src/store/index.ts`                   | Add `recurrenceTemplates` state, `backfillRecurrences()`, series-aware `updateTransaction`/`deleteTransaction`, `addRecurringTransaction()` |
| `src/components/transaction-modal.tsx` | Repeat toggle, frequency picker, end condition, horizon dropdown                                                                            |
| `src/components/transaction-row.tsx`   | Repeat icon (↻) for series transactions                                                                                                     |
| `app/(tabs)/history.tsx`               | Wire series action sheet for edit/delete of series transactions                                                                             |
| `drizzle/migrations.js`                | Add m0011 import                                                                                                                            |
| `drizzle/meta/_journal.json`           | Add entry for 0011                                                                                                                          |

### Generated files (via `bunx drizzle-kit generate`)

| File                              |                 |
| --------------------------------- | --------------- |
| `drizzle/0011_*.sql`              | Migration SQL   |
| `drizzle/meta/0011_snapshot.json` | Schema snapshot |

---

## Task 1: Schema & Types

**Files:**

- Modify: `src/db/drizzle-schema.ts`
- Create: `src/types/recurrence.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `recurrence_templates` table to Drizzle schema**

In `src/db/drizzle-schema.ts`, add after the `transactions` table definition:

```typescript
// Recurrence templates table
export const recurrenceTemplates = sqliteTable(
	'recurrence_templates',
	{
		id: text('id').primaryKey(),
		from_entity_id: text('from_entity_id')
			.notNull()
			.references(() => entities.id),
		to_entity_id: text('to_entity_id')
			.notNull()
			.references(() => entities.id),
		amount: real('amount').notNull(),
		currency: text('currency').notNull(),
		note: text('note'),
		rule: text('rule').notNull(), // JSON: { type: "daily" | "weekly" | "monthly" | "yearly" }
		start_date: integer('start_date').notNull(),
		end_date: integer('end_date'),
		end_count: integer('end_count'),
		horizon: integer('horizon').notNull(), // days ahead to generate
		exclusions: text('exclusions'), // JSON array of skipped timestamps
		is_deleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		created_at: integer('created_at').notNull(),
	},
	(table) => [index('idx_recurrence_templates_deleted').on(table.is_deleted)]
);
```

- [ ] **Step 2: Add `series_id` column to `transactions` table**

In `src/db/drizzle-schema.ts`, add to the `transactions` table columns:

```typescript
series_id: text('series_id'),
```

And add an index in the table's index function:

```typescript
index('idx_transactions_series').on(table.series_id),
```

- [ ] **Step 3: Add Drizzle relations for recurrence templates**

In `src/db/drizzle-schema.ts`, add after existing relations:

```typescript
export const recurrenceTemplatesRelations = relations(recurrenceTemplates, ({ one, many }) => ({
	fromEntity: one(entities, {
		fields: [recurrenceTemplates.from_entity_id],
		references: [entities.id],
		relationName: 'recurrence_from_entity',
	}),
	toEntity: one(entities, {
		fields: [recurrenceTemplates.to_entity_id],
		references: [entities.id],
		relationName: 'recurrence_to_entity',
	}),
	transactions: many(transactions, {
		relationName: 'recurrence_transactions',
	}),
}));
```

Also update `transactionsRelations` to include:

```typescript
recurrenceTemplate: one(recurrenceTemplates, {
	fields: [transactions.series_id],
	references: [recurrenceTemplates.id],
	relationName: 'recurrence_transactions',
}),
```

- [ ] **Step 4: Create recurrence types**

Create `src/types/recurrence.ts`:

```typescript
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
```

- [ ] **Step 5: Add `series_id` to Transaction type**

In `src/types/index.ts`, update the `Transaction` type:

```typescript
export type Transaction = Omit<DrizzleTransaction, 'note' | 'series_id'> & {
	note?: string | null;
	series_id?: string | null;
};
```

- [ ] **Step 6: Re-export recurrence types from `src/types/index.ts`**

Add at the bottom of `src/types/index.ts`:

```typescript
export type {
	RecurrenceFrequency,
	RecurrenceRule,
	RecurrenceRuleSimple,
	RecurrenceTemplate,
} from './recurrence';
export { HORIZON_OPTIONS, DEFAULT_HORIZON_DAYS } from './recurrence';
```

- [ ] **Step 7: Generate migration**

Run: `bunx drizzle-kit generate`

This auto-generates:

- `drizzle/0011_*.sql` with CREATE TABLE and ALTER TABLE statements
- `drizzle/meta/0011_snapshot.json`
- Updates `drizzle/meta/_journal.json`

- [ ] **Step 8: Update `drizzle/migrations.js`**

Add the new migration import. The exact filename depends on what `drizzle-kit generate` produces. The pattern is:

```javascript
import m0011 from './0011_<generated_name>.sql';

// In the migrations object, add:
m0011,
```

- [ ] **Step 9: Verify migration runs**

Run: `bun run test -- --filter transactions`

Expected: Existing transaction tests still pass (migration is backwards-compatible — `series_id` is nullable).

- [ ] **Step 10: Run type check**

Run: `bun run types`

Expected: No errors.

- [ ] **Step 11: Commit**

```bash
git add src/db/drizzle-schema.ts src/types/recurrence.ts src/types/index.ts drizzle/
git commit -m "feat(recurrence): add recurrence_templates schema and migration (KII-66)"
```

---

## Task 2: Occurrence Generation Logic (TDD)

**Files:**

- Create: `src/utils/__tests__/recurrence.test.ts`
- Create: `src/utils/recurrence.ts`

- [ ] **Step 1: Write failing tests for `generateOccurrences`**

Create `src/utils/__tests__/recurrence.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test';
import { generateOccurrences, nextOccurrence } from '../recurrence';

// Helper: create a local-time timestamp for a specific date
function localTs(year: number, month: number, day: number, hour = 9): number {
	return new Date(year, month - 1, day, hour).getTime();
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('nextOccurrence', () => {
	test('daily: advances by 1 day', () => {
		const from = localTs(2026, 4, 1);
		const next = nextOccurrence(from, { type: 'daily' });
		expect(next).toBe(localTs(2026, 4, 2));
	});

	test('weekly: advances by 7 days', () => {
		const from = localTs(2026, 4, 1);
		const next = nextOccurrence(from, { type: 'weekly' });
		expect(next).toBe(localTs(2026, 4, 8));
	});

	test('monthly: same day next month', () => {
		const from = localTs(2026, 1, 15);
		const next = nextOccurrence(from, { type: 'monthly' });
		expect(new Date(next).getDate()).toBe(15);
		expect(new Date(next).getMonth()).toBe(1); // February
	});

	test('monthly: clamps day 31 to Feb 28', () => {
		const from = localTs(2026, 1, 31);
		const next = nextOccurrence(from, { type: 'monthly' });
		expect(new Date(next).getDate()).toBe(28);
		expect(new Date(next).getMonth()).toBe(1); // February
	});

	test('monthly: clamps day 31 to Feb 29 on leap year', () => {
		const from = localTs(2028, 1, 31); // 2028 is a leap year
		const next = nextOccurrence(from, { type: 'monthly' });
		expect(new Date(next).getDate()).toBe(29);
		expect(new Date(next).getMonth()).toBe(1);
	});

	test('yearly: same month and day', () => {
		const from = localTs(2026, 3, 15);
		const next = nextOccurrence(from, { type: 'yearly' });
		expect(new Date(next).getFullYear()).toBe(2027);
		expect(new Date(next).getMonth()).toBe(2); // March
		expect(new Date(next).getDate()).toBe(15);
	});

	test('yearly: Feb 29 clamps to Feb 28 on non-leap year', () => {
		const from = localTs(2028, 2, 29); // leap year
		const next = nextOccurrence(from, { type: 'yearly' });
		expect(new Date(next).getDate()).toBe(28);
		expect(new Date(next).getMonth()).toBe(1); // February
		expect(new Date(next).getFullYear()).toBe(2029);
	});
});

describe('generateOccurrences', () => {
	test('daily: generates correct number within horizon', () => {
		const start = localTs(2026, 4, 1);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 7,
			now: start,
		});
		// Day 1 through day 8 (start + 7 days of horizon)
		expect(result.length).toBe(8);
		expect(result[0]).toBe(start);
		expect(result[7]).toBe(localTs(2026, 4, 8));
	});

	test('weekly: generates 5 occurrences over 30 days', () => {
		const start = localTs(2026, 4, 1);
		const result = generateOccurrences({
			rule: { type: 'weekly' },
			startDate: start,
			horizonDays: 30,
			now: start,
		});
		expect(result.length).toBe(5); // Apr 1, 8, 15, 22, 29
	});

	test('monthly: generates 4 occurrences over 90 days', () => {
		const start = localTs(2026, 1, 15);
		const result = generateOccurrences({
			rule: { type: 'monthly' },
			startDate: start,
			horizonDays: 90,
			now: start,
		});
		// Jan 15, Feb 15, Mar 15, Apr 15
		expect(result.length).toBe(4);
	});

	test('respects end_date', () => {
		const start = localTs(2026, 4, 1);
		const endDate = localTs(2026, 4, 15);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 90,
			now: start,
			endDate,
		});
		expect(result.length).toBe(15); // Apr 1 through Apr 15
		expect(result[result.length - 1]).toBe(endDate);
	});

	test('respects end_count', () => {
		const start = localTs(2026, 4, 1);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 365,
			now: start,
			endCount: 5,
		});
		expect(result.length).toBe(5);
	});

	test('end_date and end_count: whichever hits first wins', () => {
		const start = localTs(2026, 4, 1);
		const endDate = localTs(2026, 4, 10);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 365,
			now: start,
			endDate,
			endCount: 3,
		});
		expect(result.length).toBe(3); // count (3) < date range (10)
	});

	test('skips exclusions but still counts them toward total slots', () => {
		const start = localTs(2026, 4, 1);
		const excluded = localTs(2026, 4, 3);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 5,
			now: start,
			exclusions: [excluded],
		});
		expect(result).not.toContain(excluded);
		expect(result.length).toBe(5); // 6 days minus 1 exclusion
	});

	test('exclusions count toward endCount', () => {
		const start = localTs(2026, 4, 1);
		const excluded = localTs(2026, 4, 2);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 365,
			now: start,
			endCount: 4,
			exclusions: [excluded],
		});
		// 4 slots total, 1 excluded = 3 actual timestamps
		expect(result.length).toBe(3);
		expect(result).not.toContain(excluded);
	});

	test('returns empty array when start_date is beyond horizon', () => {
		const now = localTs(2026, 1, 1);
		const start = localTs(2026, 12, 1);
		const result = generateOccurrences({
			rule: { type: 'daily' },
			startDate: start,
			horizonDays: 30,
			now,
		});
		expect(result.length).toBe(0);
	});

	test('generates past occurrences when start_date is before now', () => {
		const start = localTs(2026, 3, 1);
		const now = localTs(2026, 4, 1);
		const result = generateOccurrences({
			rule: { type: 'monthly' },
			startDate: start,
			horizonDays: 90,
			now,
		});
		// Mar 1 (past), Apr 1 (now), May 1, Jun 1 (within 90d of now)
		expect(result[0]).toBe(start);
		expect(result.length).toBe(4);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/utils/__tests__/recurrence.test.ts`

Expected: FAIL — module `../recurrence` not found.

- [ ] **Step 3: Implement `nextOccurrence` and `generateOccurrences`**

Create `src/utils/recurrence.ts`:

```typescript
import type { RecurrenceRule } from '@/src/types/recurrence';

/**
 * Compute the next occurrence timestamp from a given timestamp using the rule.
 * All date math is in local time to avoid DST shifts.
 */
export function nextOccurrence(fromTimestamp: number, rule: RecurrenceRule): number {
	const d = new Date(fromTimestamp);

	switch (rule.type) {
		case 'daily':
			d.setDate(d.getDate() + 1);
			break;
		case 'weekly':
			d.setDate(d.getDate() + 7);
			break;
		case 'monthly': {
			const originalDay = d.getDate();
			d.setMonth(d.getMonth() + 1, 1); // move to 1st of next month
			const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
			d.setDate(Math.min(originalDay, maxDay));
			break;
		}
		case 'yearly': {
			const origMonth = d.getMonth();
			const origDay = d.getDate();
			d.setFullYear(d.getFullYear() + 1, origMonth, 1);
			const maxDay = new Date(d.getFullYear(), origMonth + 1, 0).getDate();
			d.setDate(Math.min(origDay, maxDay));
			break;
		}
	}

	return d.getTime();
}

interface GenerateOptions {
	rule: RecurrenceRule;
	startDate: number;
	horizonDays: number;
	now: number;
	endDate?: number | null;
	endCount?: number | null;
	exclusions?: number[];
}

/**
 * Generate all occurrence timestamps for a recurrence template.
 * Returns timestamps from startDate up to min(endDate, now + horizonDays).
 */
export function generateOccurrences(opts: GenerateOptions): number[] {
	const { rule, startDate, horizonDays, now, endDate, endCount, exclusions } = opts;

	const horizonEnd = now + horizonDays * 24 * 60 * 60 * 1000;
	const effectiveEnd = endDate != null ? Math.min(endDate, horizonEnd) : horizonEnd;
	const exclusionSet = new Set(exclusions ?? []);

	const timestamps: number[] = [];
	let current = startDate;
	let totalSlots = 0; // counts all slots including excluded ones

	while (current <= effectiveEnd) {
		totalSlots++;
		if (endCount != null && totalSlots > endCount) break;

		if (!exclusionSet.has(current)) {
			timestamps.push(current);
		}

		current = nextOccurrence(current, rule);
	}

	return timestamps;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/utils/__tests__/recurrence.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/recurrence.ts src/utils/__tests__/recurrence.test.ts
git commit -m "feat(recurrence): add occurrence generation logic with TDD (KII-66)"
```

---

## Task 3: DB Layer — Recurrence Template CRUD (TDD)

**Files:**

- Create: `src/db/__tests__/recurrence-templates.test.ts`
- Create: `src/db/recurrence-templates.ts`
- Modify: `src/db/index.ts`

- [ ] **Step 1: Write failing tests for recurrence template CRUD**

Create `src/db/__tests__/recurrence-templates.test.ts`:

```typescript
import { describe, expect, test, beforeEach } from 'bun:test';
import type { Entity } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	createRecurrenceTemplate,
	getAllRecurrenceTemplates,
	getRecurrenceTemplateById,
	updateRecurrenceTemplate,
	softDeleteRecurrenceTemplate,
	addExclusion,
	getActiveTemplatesForEntity,
} from '../recurrence-templates';
import { createEntity } from '../entities';
import { resetDrizzleDb } from '../drizzle-client';

const makeEntity = (id: string, type: Entity['type']): Entity => ({
	id,
	type,
	name: `Entity ${id}`,
	currency: 'USD',
	row: 0,
	position: 0,
	order: 0,
});

const baseTemplate: RecurrenceTemplate = {
	id: 'rec-1',
	from_entity_id: 'account-1',
	to_entity_id: 'category-1',
	amount: 50,
	currency: 'USD',
	rule: JSON.stringify({ type: 'monthly' }),
	start_date: Date.now(),
	horizon: 90,
	created_at: Date.now(),
};

describe('recurrence-templates.ts', () => {
	beforeEach(async () => {
		resetDrizzleDb();
		await createEntity(makeEntity('account-1', 'account'));
		await createEntity(makeEntity('category-1', 'category'));
		await createEntity(makeEntity('income-1', 'income'));
	});

	test('createRecurrenceTemplate + getById', async () => {
		await createRecurrenceTemplate(baseTemplate);
		const result = await getRecurrenceTemplateById('rec-1');
		expect(result).not.toBeNull();
		expect(result!.amount).toBe(50);
		expect(result!.rule).toBe(JSON.stringify({ type: 'monthly' }));
		expect(result!.is_deleted).toBe(false);
	});

	test('getAllRecurrenceTemplates excludes deleted', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await createRecurrenceTemplate({ ...baseTemplate, id: 'rec-2', is_deleted: true });
		const all = await getAllRecurrenceTemplates();
		expect(all.length).toBe(1);
		expect(all[0].id).toBe('rec-1');
	});

	test('updateRecurrenceTemplate', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await updateRecurrenceTemplate('rec-1', { amount: 100, note: 'Updated' });
		const result = await getRecurrenceTemplateById('rec-1');
		expect(result!.amount).toBe(100);
		expect(result!.note).toBe('Updated');
	});

	test('softDeleteRecurrenceTemplate', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await softDeleteRecurrenceTemplate('rec-1');
		const result = await getRecurrenceTemplateById('rec-1');
		expect(result!.is_deleted).toBe(true);
		const all = await getAllRecurrenceTemplates();
		expect(all.length).toBe(0);
	});

	test('addExclusion appends to exclusions array', async () => {
		await createRecurrenceTemplate(baseTemplate);
		const ts1 = 1000;
		const ts2 = 2000;
		await addExclusion('rec-1', ts1);
		await addExclusion('rec-1', ts2);
		const result = await getRecurrenceTemplateById('rec-1');
		const exclusions = JSON.parse(result!.exclusions ?? '[]');
		expect(exclusions).toEqual([ts1, ts2]);
	});

	test('getActiveTemplatesForEntity returns templates referencing entity', async () => {
		await createRecurrenceTemplate(baseTemplate);
		await createRecurrenceTemplate({
			...baseTemplate,
			id: 'rec-2',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
		});

		const forAccount = await getActiveTemplatesForEntity('account-1');
		expect(forAccount.length).toBe(2);

		const forCategory = await getActiveTemplatesForEntity('category-1');
		expect(forCategory.length).toBe(1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/db/__tests__/recurrence-templates.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement recurrence template CRUD**

Create `src/db/recurrence-templates.ts`:

```typescript
import { eq, and, or } from 'drizzle-orm';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import { getDrizzleDb } from './drizzle-client';
import { recurrenceTemplates } from './drizzle-schema';

export async function getAllRecurrenceTemplates(): Promise<RecurrenceTemplate[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(recurrenceTemplates)
		.where(eq(recurrenceTemplates.is_deleted, false));
}

export async function getRecurrenceTemplateById(id: string): Promise<RecurrenceTemplate | null> {
	const db = await getDrizzleDb();
	const result = await db
		.select()
		.from(recurrenceTemplates)
		.where(eq(recurrenceTemplates.id, id))
		.limit(1);
	return result[0] ?? null;
}

export async function createRecurrenceTemplate(template: RecurrenceTemplate): Promise<void> {
	const db = await getDrizzleDb();
	await db.insert(recurrenceTemplates).values({
		id: template.id,
		from_entity_id: template.from_entity_id,
		to_entity_id: template.to_entity_id,
		amount: template.amount,
		currency: template.currency,
		note: template.note ?? null,
		rule: template.rule,
		start_date: template.start_date,
		end_date: template.end_date ?? null,
		end_count: template.end_count ?? null,
		horizon: template.horizon,
		exclusions: template.exclusions ?? null,
		is_deleted: template.is_deleted ?? false,
		created_at: template.created_at,
	});
}

export async function updateRecurrenceTemplate(
	id: string,
	updates: Partial<Omit<RecurrenceTemplate, 'id'>>
): Promise<void> {
	const db = await getDrizzleDb();
	const updateData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) updateData[key] = value;
	}
	if (Object.keys(updateData).length > 0) {
		await db.update(recurrenceTemplates).set(updateData).where(eq(recurrenceTemplates.id, id));
	}
}

export async function softDeleteRecurrenceTemplate(id: string): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.update(recurrenceTemplates)
		.set({ is_deleted: true })
		.where(eq(recurrenceTemplates.id, id));
}

export async function addExclusion(templateId: string, timestamp: number): Promise<void> {
	const template = await getRecurrenceTemplateById(templateId);
	if (!template) return;

	const exclusions: number[] = JSON.parse(template.exclusions ?? '[]');
	exclusions.push(timestamp);

	const db = await getDrizzleDb();
	await db
		.update(recurrenceTemplates)
		.set({ exclusions: JSON.stringify(exclusions) })
		.where(eq(recurrenceTemplates.id, templateId));
}

export async function getActiveTemplatesForEntity(entityId: string): Promise<RecurrenceTemplate[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(recurrenceTemplates)
		.where(
			and(
				eq(recurrenceTemplates.is_deleted, false),
				or(
					eq(recurrenceTemplates.from_entity_id, entityId),
					eq(recurrenceTemplates.to_entity_id, entityId)
				)
			)
		);
}
```

- [ ] **Step 4: Update `src/db/index.ts`**

Add:

```typescript
export * from './recurrence-templates';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/db/__tests__/recurrence-templates.test.ts`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/recurrence-templates.ts src/db/__tests__/recurrence-templates.test.ts src/db/index.ts
git commit -m "feat(recurrence): add recurrence template CRUD with TDD (KII-66)"
```

---

## Task 4: Series-Aware Transaction Queries (TDD)

**Files:**

- Modify: `src/db/__tests__/transactions.test.ts`
- Modify: `src/db/transactions.ts`

- [ ] **Step 1: Write failing tests for series-aware queries**

Append to `src/db/__tests__/transactions.test.ts`:

```typescript
describe('series-aware queries', () => {
	const seriesId = 'series-1';

	beforeEach(async () => {
		// Create series transactions: past and future
		const now = Date.now();
		for (let i = 0; i < 5; i++) {
			await createTransaction({
				id: `series-tx-${i}`,
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: now + i * 86400000, // daily, starting from now
				series_id: seriesId,
			});
		}
		// Non-series transaction
		await createTransaction({
			id: 'standalone-tx',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 100,
			currency: 'USD',
			timestamp: now,
		});
	});

	test('getTransactionsBySeriesId returns only series transactions', async () => {
		const result = await getTransactionsBySeriesId(seriesId);
		expect(result.length).toBe(5);
		expect(result.every((t) => t.series_id === seriesId)).toBe(true);
	});

	test('deleteTransactionsBySeriesFuture deletes from cutoff onward', async () => {
		const now = Date.now();
		const cutoff = now + 2 * 86400000; // 2 days from now
		await deleteTransactionsBySeriesFuture(seriesId, cutoff);
		const remaining = await getTransactionsBySeriesId(seriesId);
		expect(remaining.length).toBe(2); // only tx-0 and tx-1
		expect(remaining.every((t) => t.timestamp < cutoff)).toBe(true);
	});

	test('updateTransactionsBySeriesFuture updates from cutoff onward', async () => {
		const now = Date.now();
		const cutoff = now + 2 * 86400000;
		await updateTransactionsBySeriesFuture(seriesId, cutoff, { amount: 999 });
		const all = await getTransactionsBySeriesId(seriesId);
		const updated = all.filter((t) => t.timestamp >= cutoff);
		const unchanged = all.filter((t) => t.timestamp < cutoff);
		expect(updated.every((t) => t.amount === 999)).toBe(true);
		expect(unchanged.every((t) => t.amount === 50)).toBe(true);
	});

	test('createTransactionBatch inserts multiple transactions', async () => {
		const batch = [
			{
				id: 'batch-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 10,
				currency: 'USD',
				timestamp: Date.now(),
				series_id: 'series-2',
			},
			{
				id: 'batch-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 20,
				currency: 'USD',
				timestamp: Date.now() + 86400000,
				series_id: 'series-2',
			},
		];
		await createTransactionBatch(batch);
		const result = await getTransactionsBySeriesId('series-2');
		expect(result.length).toBe(2);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/db/__tests__/transactions.test.ts`

Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement series-aware queries**

Add to `src/db/transactions.ts`:

```typescript
import { gte } from 'drizzle-orm';
```

(Add `gte` to the existing import from `drizzle-orm`.)

Then add these functions:

```typescript
export async function getTransactionsBySeriesId(seriesId: string): Promise<Transaction[]> {
	const db = await getDrizzleDb();
	return await db
		.select()
		.from(transactions)
		.where(eq(transactions.series_id, seriesId))
		.orderBy(transactions.timestamp);
}

export async function deleteTransactionsBySeriesFuture(
	seriesId: string,
	fromTimestamp: number
): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.delete(transactions)
		.where(
			and(eq(transactions.series_id, seriesId), gte(transactions.timestamp, fromTimestamp))
		);
}

export async function updateTransactionsBySeriesFuture(
	seriesId: string,
	fromTimestamp: number,
	updates: Omit<Partial<Transaction>, 'id'>
): Promise<void> {
	const db = await getDrizzleDb();
	const updateData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) updateData[key] = value;
	}
	if (Object.keys(updateData).length > 0) {
		await db
			.update(transactions)
			.set(updateData)
			.where(
				and(
					eq(transactions.series_id, seriesId),
					gte(transactions.timestamp, fromTimestamp)
				)
			);
	}
}

export async function createTransactionBatch(txns: Transaction[]): Promise<void> {
	if (txns.length === 0) return;
	const db = await getDrizzleDb();
	for (const txn of txns) {
		await db.insert(transactions).values({
			id: txn.id,
			from_entity_id: txn.from_entity_id,
			to_entity_id: txn.to_entity_id,
			amount: txn.amount,
			currency: txn.currency,
			timestamp: txn.timestamp,
			note: txn.note ?? null,
			series_id: txn.series_id ?? null,
		});
	}
}
```

Also update `createTransaction` to include `series_id`:

```typescript
export async function createTransaction(transaction: Transaction): Promise<void> {
	const db = await getDrizzleDb();
	await db.insert(transactions).values({
		id: transaction.id,
		from_entity_id: transaction.from_entity_id,
		to_entity_id: transaction.to_entity_id,
		amount: transaction.amount,
		currency: transaction.currency,
		timestamp: transaction.timestamp,
		note: transaction.note ?? null,
		series_id: transaction.series_id ?? null,
	});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/db/__tests__/transactions.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/transactions.ts src/db/__tests__/transactions.test.ts
git commit -m "feat(recurrence): add series-aware transaction queries with TDD (KII-66)"
```

---

## Task 5: Zustand Store — Recurrence State & Backfill

**Files:**

- Modify: `src/store/index.ts`
- Modify: `src/store/__tests__/store.test.ts`

- [ ] **Step 1: Add recurrence state and types to store interface**

In `src/store/index.ts`, add to imports:

```typescript
import type { RecurrenceTemplate, RecurrenceRule } from '@/src/types/recurrence';
import { generateOccurrences } from '@/src/utils/recurrence';
```

Add to `AppState` interface:

```typescript
// Recurrence data
recurrenceTemplates: RecurrenceTemplate[];

// Recurrence actions
addRecurringTransaction: (
	transaction: Omit<Transaction, 'id' | 'series_id'>,
	recurrence: {
		rule: RecurrenceRule;
		endDate?: number | null;
		endCount?: number | null;
		horizon: number;
	}
) => Promise<void>;
updateTransactionWithScope: (
	id: string,
	updates: Omit<Partial<Transaction>, 'id'>,
	scope: 'single' | 'future'
) => Promise<void>;
deleteTransactionWithScope: (
	id: string,
	scope: 'single' | 'future'
) => Promise<void>;
```

- [ ] **Step 2: Initialize recurrence templates in state**

Add `recurrenceTemplates: []` to initial state.

Update `initialize` to load templates and run backfill:

```typescript
const [entities, plans, transactions, recurrenceTemplates] = await Promise.all([
	db.getAllEntities(),
	db.getAllPlans(),
	db.getAllTransactions(),
	db.getAllRecurrenceTemplates(),
]);
```

After setting state, add backfill call:

```typescript
// Backfill recurrence occurrences
await backfillRecurrences(recurrenceTemplates, transactions, set, get);
```

- [ ] **Step 3: Implement `backfillRecurrences` helper**

Add above the `useStore` create call:

```typescript
async function backfillRecurrences(
	templates: RecurrenceTemplate[],
	existingTransactions: Transaction[],
	set: (fn: (state: AppState) => Partial<AppState>) => void,
	get: () => AppState
): Promise<void> {
	const now = Date.now();
	const newTransactions: Transaction[] = [];

	for (const template of templates) {
		if (template.is_deleted) continue;

		const rule: RecurrenceRule = JSON.parse(template.rule);
		const exclusions: number[] = JSON.parse(template.exclusions ?? '[]');

		const expectedTimestamps = generateOccurrences({
			rule,
			startDate: template.start_date,
			horizonDays: template.horizon,
			now,
			endDate: template.end_date,
			endCount: template.end_count,
			exclusions,
		});

		// Find which timestamps already have transactions
		const existingTimestamps = new Set(
			existingTransactions.filter((t) => t.series_id === template.id).map((t) => t.timestamp)
		);

		for (const ts of expectedTimestamps) {
			if (!existingTimestamps.has(ts)) {
				newTransactions.push({
					id: generateId(),
					from_entity_id: template.from_entity_id,
					to_entity_id: template.to_entity_id,
					amount: template.amount,
					currency: template.currency,
					timestamp: ts,
					note: template.note,
					series_id: template.id,
				});
			}
		}
	}

	if (newTransactions.length > 0) {
		await db.createTransactionBatch(newTransactions);
		set((state) => ({
			transactions: [...newTransactions, ...state.transactions],
		}));
	}
}
```

- [ ] **Step 4: Implement `addRecurringTransaction`**

Add to the store:

```typescript
addRecurringTransaction: async (transaction, recurrence) => {
	const state = get();
	const fromExists = hasActiveEntity(state.entities, transaction.from_entity_id);
	const toExists = hasActiveEntity(state.entities, transaction.to_entity_id);
	if (!fromExists || !toExists) return;

	const templateId = generateId();
	const template: RecurrenceTemplate = {
		id: templateId,
		from_entity_id: transaction.from_entity_id,
		to_entity_id: transaction.to_entity_id,
		amount: transaction.amount,
		currency: transaction.currency,
		note: transaction.note,
		rule: JSON.stringify(recurrence.rule),
		start_date: transaction.timestamp,
		end_date: recurrence.endDate ?? null,
		end_count: recurrence.endCount ?? null,
		horizon: recurrence.horizon,
		created_at: Date.now(),
	};

	await db.createRecurrenceTemplate(template);

	const rule = recurrence.rule;
	const occurrences = generateOccurrences({
		rule,
		startDate: transaction.timestamp,
		horizonDays: recurrence.horizon,
		now: Date.now(),
		endDate: recurrence.endDate,
		endCount: recurrence.endCount,
	});

	const txns: Transaction[] = occurrences.map((ts) => ({
		id: generateId(),
		from_entity_id: transaction.from_entity_id,
		to_entity_id: transaction.to_entity_id,
		amount: transaction.amount,
		currency: transaction.currency,
		timestamp: ts,
		note: transaction.note,
		series_id: templateId,
	}));

	if (txns.length > 0) {
		await db.createTransactionBatch(txns);
		set((state) => ({
			recurrenceTemplates: [...state.recurrenceTemplates, template],
			transactions: [...txns, ...state.transactions],
		}));
	}
},
```

- [ ] **Step 5: Implement `updateTransactionWithScope`**

```typescript
updateTransactionWithScope: async (id, updates, scope) => {
	const state = get();
	const transaction = state.transactions.find((t) => t.id === id);
	if (!transaction) return;

	if (scope === 'single' || !transaction.series_id) {
		// Delegate to existing updateTransaction
		await get().updateTransaction(id, updates);
		return;
	}

	// scope === 'future': update template + all future transactions
	const seriesId = transaction.series_id;
	const template = state.recurrenceTemplates.find((t) => t.id === seriesId);

	if (template) {
		const templateUpdates: Partial<RecurrenceTemplate> = {};
		if (updates.amount !== undefined) templateUpdates.amount = updates.amount;
		if (updates.from_entity_id !== undefined)
			templateUpdates.from_entity_id = updates.from_entity_id;
		if (updates.to_entity_id !== undefined)
			templateUpdates.to_entity_id = updates.to_entity_id;
		if (updates.note !== undefined) templateUpdates.note = updates.note;

		const ruleChanged = false; // Rule changes not supported in edit modal MVP

		if (ruleChanged) {
			// Delete future occurrences and regenerate
			await db.deleteTransactionsBySeriesFuture(seriesId, transaction.timestamp);
			const rule: RecurrenceRule = JSON.parse(template.rule);
			const exclusions: number[] = JSON.parse(template.exclusions ?? '[]');
			const newTimestamps = generateOccurrences({
				rule,
				startDate: transaction.timestamp,
				horizonDays: template.horizon,
				now: Date.now(),
				endDate: template.end_date,
				endCount: template.end_count,
				exclusions,
			});

			const txns: Transaction[] = newTimestamps.map((ts) => ({
				id: generateId(),
				from_entity_id: templateUpdates.from_entity_id ?? template.from_entity_id,
				to_entity_id: templateUpdates.to_entity_id ?? template.to_entity_id,
				amount: templateUpdates.amount ?? template.amount,
				currency: template.currency,
				timestamp: ts,
				note: templateUpdates.note ?? template.note,
				series_id: seriesId,
			}));

			await db.createTransactionBatch(txns);
			await db.updateRecurrenceTemplate(seriesId, templateUpdates);

			// Reload all state to keep consistent
			const allTransactions = await db.getAllTransactions();
			const allTemplates = await db.getAllRecurrenceTemplates();
			set({ transactions: allTransactions, recurrenceTemplates: allTemplates });
		} else {
			// Just update template + future transactions in place
			await db.updateRecurrenceTemplate(seriesId, templateUpdates);
			await db.updateTransactionsBySeriesFuture(seriesId, transaction.timestamp, updates);

			// Optimistically update local state
			const updatedTemplate = { ...template, ...templateUpdates };
			set((state) => ({
				recurrenceTemplates: state.recurrenceTemplates.map((t) =>
					t.id === seriesId ? updatedTemplate : t
				),
				transactions: state.transactions.map((t) =>
					t.series_id === seriesId && t.timestamp >= transaction.timestamp
						? { ...t, ...updates }
						: t
				),
			}));
		}
	}
},
```

- [ ] **Step 6: Implement `deleteTransactionWithScope`**

```typescript
deleteTransactionWithScope: async (id, scope) => {
	const state = get();
	const transaction = state.transactions.find((t) => t.id === id);
	if (!transaction) return;

	if (scope === 'single' || !transaction.series_id) {
		// Delete single + add exclusion if part of series
		await db.deleteTransaction(id);
		if (transaction.series_id) {
			await db.addExclusion(transaction.series_id, transaction.timestamp);
		}
		set((state) => ({
			transactions: state.transactions.filter((t) => t.id !== id),
		}));
		return;
	}

	// scope === 'future': delete all from this timestamp onward
	const seriesId = transaction.series_id;
	await db.deleteTransactionsBySeriesFuture(seriesId, transaction.timestamp);

	// Check if any past transactions remain in the series
	const remaining = state.transactions.filter(
		(t) => t.series_id === seriesId && t.timestamp < transaction.timestamp
	);

	if (remaining.length === 0) {
		// No past transactions — deactivate template
		await db.softDeleteRecurrenceTemplate(seriesId);
		set((state) => ({
			transactions: state.transactions.filter(
				(t) => !(t.series_id === seriesId && t.timestamp >= transaction.timestamp)
			),
			recurrenceTemplates: state.recurrenceTemplates.map((t) =>
				t.id === seriesId ? { ...t, is_deleted: true } : t
			),
		}));
	} else {
		// Set end_date to the last remaining occurrence
		const lastRemaining = Math.max(...remaining.map((t) => t.timestamp));
		await db.updateRecurrenceTemplate(seriesId, { end_date: lastRemaining });
		set((state) => ({
			transactions: state.transactions.filter(
				(t) => !(t.series_id === seriesId && t.timestamp >= transaction.timestamp)
			),
			recurrenceTemplates: state.recurrenceTemplates.map((t) =>
				t.id === seriesId ? { ...t, end_date: lastRemaining } : t
			),
		}));
	}
},
```

- [ ] **Step 7: Update `replaceAllData` to handle recurrence templates**

In `replaceAllData`, add deletion and re-insertion of recurrence templates within the transaction block. Also reload them when re-reading state. For now, CSV import doesn't include templates — just ensure the new table is cleared to avoid FK issues:

```typescript
tx.delete(schema.transactions).run();
tx.delete(schema.plans).run();
tx.delete(schema.recurrenceTemplates).run(); // Add this line
tx.delete(schema.entities).run();
```

And when re-reading:

```typescript
const [entities, plans, transactions, recurrenceTemplates] = await Promise.all([
	db.getAllEntities(),
	db.getAllPlans(),
	db.getAllTransactions(),
	db.getAllRecurrenceTemplates(),
]);
set({ entities, plans, transactions, recurrenceTemplates });
```

- [ ] **Step 8: Run all store tests**

Run: `bun test src/store/__tests__/store.test.ts`

Expected: All existing tests PASS. New recurrence state initializes to `[]`.

- [ ] **Step 9: Run full test suite**

Run: `bun run test`

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/store/index.ts src/store/__tests__/store.test.ts
git commit -m "feat(recurrence): add recurrence state, backfill, and series actions to store (KII-66)"
```

---

## Task 6: Transaction Modal — Repeat UI

**Files:**

- Modify: `src/components/transaction-modal.tsx`

- [ ] **Step 1: Add repeat state variables**

Add state in `TransactionModal` component, near existing state declarations:

```typescript
import { Repeat } from 'lucide-react-native';
import type { RecurrenceFrequency } from '@/src/types/recurrence';
import { HORIZON_OPTIONS, DEFAULT_HORIZON_DAYS } from '@/src/types/recurrence';

// Inside component:
const [isRepeat, setIsRepeat] = useState(false);
const [repeatFrequency, setRepeatFrequency] = useState<RecurrenceFrequency>('monthly');
const [repeatEndMode, setRepeatEndMode] = useState<'never' | 'until' | 'count'>('never');
const [repeatEndDate, setRepeatEndDate] = useState<Date | null>(null);
const [repeatEndCount, setRepeatEndCount] = useState('');
const [repeatHorizon, setRepeatHorizon] = useState(DEFAULT_HORIZON_DAYS);
```

Also add store action:

```typescript
const addRecurringTransaction = useStore((state) => state.addRecurringTransaction);
```

- [ ] **Step 2: Reset repeat state on modal open**

In the `useEffect` that runs when `visible` changes, add to the reset block:

```typescript
setIsRepeat(false);
setRepeatFrequency('monthly');
setRepeatEndMode('never');
setRepeatEndDate(null);
setRepeatEndCount('');
setRepeatHorizon(DEFAULT_HORIZON_DAYS);
```

- [ ] **Step 3: Add repeat UI section below date picker**

Insert between the Date section and Note section in the JSX. Place it after the `{/* Date */}` block's closing `</View>`:

```tsx
{
	/* Repeat — create mode only */
}
{
	!isEditing && (
		<View className="mb-6">
			<Pressable
				onPress={() => setIsRepeat((v) => !v)}
				className="flex-row items-center rounded-lg bg-paper-100 px-3 py-2.5"
				style={{
					borderWidth: 1,
					borderColor: isRepeat ? colors.accent.DEFAULT : colors.border.dashed,
					borderStyle: isRepeat ? 'solid' : 'dashed',
				}}
				testID="repeat-toggle"
			>
				<Repeat size={14} color={isRepeat ? colors.accent.DEFAULT : colors.ink.muted} />
				<Text
					className={`ml-2 font-sans text-sm ${isRepeat ? 'text-accent' : 'text-ink-muted'}`}
				>
					Repeat
				</Text>
			</Pressable>

			{isRepeat && (
				<View className="mt-3 rounded-lg border border-paper-300 bg-paper-100 p-3">
					{/* Frequency */}
					<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
						Frequency
					</Text>
					<View className="mb-4 flex-row gap-2">
						{(['daily', 'weekly', 'monthly', 'yearly'] as const).map((freq) => (
							<Pressable
								key={freq}
								onPress={() => setRepeatFrequency(freq)}
								className={`flex-1 items-center rounded-lg py-2 ${
									repeatFrequency === freq ? 'bg-accent' : 'bg-paper-200'
								}`}
								testID={`repeat-freq-${freq}`}
							>
								<Text
									className={`font-sans text-sm capitalize ${
										repeatFrequency === freq
											? 'text-on-color'
											: 'text-ink-muted'
									}`}
								>
									{freq}
								</Text>
							</Pressable>
						))}
					</View>

					{/* End condition */}
					<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
						Ends
					</Text>
					<View className="mb-4 flex-row gap-2">
						{(['never', 'until', 'count'] as const).map((mode) => (
							<Pressable
								key={mode}
								onPress={() => setRepeatEndMode(mode)}
								className={`flex-1 items-center rounded-lg py-2 ${
									repeatEndMode === mode ? 'bg-accent' : 'bg-paper-200'
								}`}
								testID={`repeat-end-${mode}`}
							>
								<Text
									className={`font-sans text-sm ${
										repeatEndMode === mode ? 'text-on-color' : 'text-ink-muted'
									}`}
								>
									{mode === 'never'
										? 'Never'
										: mode === 'until'
											? 'Until date'
											: 'After N'}
								</Text>
							</Pressable>
						))}
					</View>

					{repeatEndMode === 'until' && (
						<View className="mb-4">
							<DateTimePicker
								value={repeatEndDate ?? new Date()}
								mode="date"
								display={Platform.OS === 'ios' ? 'compact' : 'default'}
								onChange={(_, date) => date && setRepeatEndDate(date)}
								minimumDate={selectedDate}
								accentColor={colors.accent.deeper}
							/>
						</View>
					)}

					{repeatEndMode === 'count' && (
						<View className="mb-4">
							<TextInput
								{...sharedNumericTextInputProps}
								value={repeatEndCount}
								onChangeText={setRepeatEndCount}
								placeholder="Number of times"
								keyboardType="number-pad"
								className={textInputClassNames.input}
								style={styles.input}
								placeholderTextColor={colors.ink.placeholder}
								testID="repeat-end-count-input"
							/>
						</View>
					)}

					{/* Horizon */}
					<Text className="mb-2 font-sans text-xs uppercase tracking-wider text-ink-muted">
						Generate ahead
					</Text>
					<View className="flex-row gap-2">
						{HORIZON_OPTIONS.map((opt) => (
							<Pressable
								key={opt.days}
								onPress={() => setRepeatHorizon(opt.days)}
								className={`flex-1 items-center rounded-lg py-2 ${
									repeatHorizon === opt.days ? 'bg-accent' : 'bg-paper-200'
								}`}
								testID={`repeat-horizon-${opt.days}`}
							>
								<Text
									className={`font-sans text-xs ${
										repeatHorizon === opt.days
											? 'text-on-color'
											: 'text-ink-muted'
									}`}
								>
									{opt.label}
								</Text>
							</Pressable>
						))}
					</View>
				</View>
			)}
		</View>
	);
}
```

- [ ] **Step 4: Update `handleSubmit` to handle repeat mode**

In `handleSubmit`, after the single-transaction creation block (the `else if (selectedFromEntity && selectedToEntity)` block), replace it with logic that checks `isRepeat`:

```typescript
} else if (selectedFromEntity && selectedToEntity) {
	if (isRepeat) {
		await addRecurringTransaction(
			{
				from_entity_id: selectedFromEntity.id,
				to_entity_id: selectedToEntity.id,
				amount: numAmount,
				currency: selectedFromEntity.currency,
				timestamp,
				note: note.trim() || undefined,
			},
			{
				rule: { type: repeatFrequency },
				endDate:
					repeatEndMode === 'until' && repeatEndDate
						? repeatEndDate.getTime()
						: null,
				endCount:
					repeatEndMode === 'count' && repeatEndCount
						? parseInt(repeatEndCount, 10)
						: null,
				horizon: repeatHorizon,
			}
		);
	} else {
		await addTransaction({
			id: generateId(),
			from_entity_id: selectedFromEntity.id,
			to_entity_id: selectedToEntity.id,
			amount: numAmount,
			currency: selectedFromEntity.currency,
			timestamp,
			note: note.trim() || undefined,
		});
	}
}
```

- [ ] **Step 5: Run type check and linter**

Run: `bun run types && bun run lint`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/transaction-modal.tsx
git commit -m "feat(recurrence): add repeat UI to transaction modal (KII-66)"
```

---

## Task 7: Transaction Row — Repeat Icon

**Files:**

- Modify: `src/components/transaction-row.tsx`

- [ ] **Step 1: Add repeat icon import**

Add to the lucide imports:

```typescript
import { Clock, Trash2, Repeat } from 'lucide-react-native';
```

- [ ] **Step 2: Show repeat icon for series transactions**

In the `TransactionRow` component, find the amount display area (the `<View className="ml-3 items-end">` block). Update to show the repeat icon alongside the clock icon:

```tsx
<View className="ml-3 items-end">
	<View className="flex-row items-center gap-1" style={{ marginBottom: 2 }}>
		{transaction.series_id && <Repeat size={12} color={colors.info.DEFAULT} />}
		{isUpcoming && <Clock size={12} color={colors.info.DEFAULT} />}
	</View>
	<Text className={`font-sans-semibold text-base ${isUpcoming ? 'text-info' : 'text-ink'}`}>
		{formatAmount(transaction.amount, transaction.currency)}{' '}
		<Text className="font-sans text-sm text-ink-muted">
			{getCurrencySymbol(transaction.currency)}
		</Text>
	</Text>
</View>
```

Note: The existing `{isUpcoming && (<Clock .../>)}` block with its `style={{ marginBottom: 2 }}` is now inside the `flex-row` wrapper, so move `marginBottom` to the wrapper `View`.

- [ ] **Step 3: Run type check**

Run: `bun run types`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/transaction-row.tsx
git commit -m "feat(recurrence): show repeat icon on series transactions (KII-66)"
```

---

## Task 8: Series Action Sheet for Edit/Delete

**Files:**

- Create: `src/components/series-action-sheet.tsx`
- Modify: `app/(tabs)/history.tsx`
- Modify: `src/components/transaction-row.tsx`

- [ ] **Step 1: Create series action sheet component**

Create `src/components/series-action-sheet.tsx`:

```typescript
import { Alert } from 'react-native';

export type SeriesScope = 'single' | 'future';

/**
 * Show an action sheet asking the user whether to apply an action
 * to a single occurrence or all future occurrences.
 */
export function showSeriesScopeAlert(
	action: 'edit' | 'delete',
	onSelect: (scope: SeriesScope) => void
): void {
	const title = action === 'edit' ? 'Edit Recurring Transaction' : 'Delete Recurring Transaction';
	const message =
		action === 'edit'
			? 'Apply changes to this transaction only, or this and all future occurrences?'
			: 'Delete this transaction only, or this and all future occurrences?';

	Alert.alert(title, message, [
		{ text: 'Cancel', style: 'cancel' },
		{
			text: 'This one only',
			onPress: () => onSelect('single'),
		},
		{
			text: 'All future',
			style: action === 'delete' ? 'destructive' : 'default',
			onPress: () => onSelect('future'),
		},
	]);
}
```

- [ ] **Step 2: Update `TransactionRow` delete to use series scope**

In `src/components/transaction-row.tsx`, import the new component:

```typescript
import { showSeriesScopeAlert } from './series-action-sheet';
```

Add the store actions:

```typescript
const deleteTransactionWithScope = useStore((state) => state.deleteTransactionWithScope);
```

Update `confirmDelete` to check for `series_id`:

```typescript
const confirmDelete = useCallback(() => {
	if (transaction.series_id) {
		showSeriesScopeAlert('delete', (scope) => {
			deleteTransactionWithScope(transaction.id, scope);
		});
	} else {
		Alert.alert(
			'Delete Transaction',
			`Delete ${formatAmount(transaction.amount, transaction.currency)} from ${fromLabel} to ${toLabel}?`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => deleteTransaction(transaction.id),
				},
			]
		);
	}
}, [transaction, fromLabel, toLabel, deleteTransaction, deleteTransactionWithScope]);
```

- [ ] **Step 3: Update History tab edit flow to use series scope**

In `app/(tabs)/history.tsx`, import:

```typescript
import { showSeriesScopeAlert, type SeriesScope } from '@/src/components/series-action-sheet';
```

Add store action:

```typescript
const { transactions, entities } = useStore(
	useShallow((state) => ({
		transactions: state.transactions,
		entities: state.entities,
	}))
);
const updateTransactionWithScope = useStore((state) => state.updateTransactionWithScope);
```

Update `handleEdit` — when the transaction has a `series_id`, the edit modal should pass scope info. The simplest approach: add state to track edit scope.

```typescript
const [editScope, setEditScope] = useState<SeriesScope>('single');

const handleEdit = useCallback((transaction: Transaction) => {
	if (transaction.series_id) {
		showSeriesScopeAlert('edit', (scope) => {
			setEditScope(scope);
			setEditingTransaction(transaction);
		});
	} else {
		setEditingTransaction(transaction);
	}
}, []);
```

Then pass `editScope` down to the modal. Update the `TransactionModal` call to include a new prop:

```tsx
{
	editingTransaction && (
		<TransactionModal
			visible={true}
			fromEntity={getEntityWithBalance(editingTransaction.from_entity_id)}
			toEntity={getEntityWithBalance(editingTransaction.to_entity_id)}
			onClose={handleCloseEdit}
			existingTransaction={editingTransaction}
			seriesScope={editingTransaction.series_id ? editScope : undefined}
		/>
	);
}
```

- [ ] **Step 4: Update `TransactionModal` to accept and use `seriesScope`**

In `src/components/transaction-modal.tsx`, add prop:

```typescript
interface TransactionModalProps {
	// ... existing props
	seriesScope?: 'single' | 'future';
}
```

Destructure in component:

```typescript
export function TransactionModal({
	// ... existing
	seriesScope,
}: TransactionModalProps) {
```

Add store action:

```typescript
const updateTransactionWithScope = useStore((state) => state.updateTransactionWithScope);
```

In `handleSubmit`, update the editing branch to use scope when present:

```typescript
if (isEditing && existingTransaction) {
	const updates: {
		amount?: number;
		note?: string;
		timestamp?: number;
		from_entity_id?: string;
		to_entity_id?: string;
	} = { amount: numAmount, note: note.trim() || undefined, timestamp };
	if (selectedFromId && selectedFromId !== existingTransaction.from_entity_id)
		updates.from_entity_id = selectedFromId;
	if (selectedToId && selectedToId !== existingTransaction.to_entity_id)
		updates.to_entity_id = selectedToId;

	if (seriesScope) {
		await updateTransactionWithScope(existingTransaction.id, updates, seriesScope);
	} else {
		await updateTransaction(existingTransaction.id, updates);
	}
}
```

Also add a visual indicator when editing a series transaction:

```tsx
{
	/* Series indicator */
}
{
	isEditing && existingTransaction?.series_id && (
		<View className="mb-4 rounded-lg bg-info/10 px-3 py-2">
			<Text className="font-sans text-sm text-info">
				Part of a recurring series
				{seriesScope === 'future' ? ' — editing all future' : ' — editing this one'}
			</Text>
		</View>
	);
}
```

Place this after the `{/* From → To */}` block.

- [ ] **Step 5: Run type check and linter**

Run: `bun run types && bun run lint`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/series-action-sheet.tsx src/components/transaction-row.tsx src/components/transaction-modal.tsx app/\(tabs\)/history.tsx
git commit -m "feat(recurrence): add series action sheets for edit/delete (KII-66)"
```

---

## Task 9: Entity Deletion — Template Prompt

**Files:**

- Modify: `src/store/index.ts`

- [ ] **Step 1: Update `deleteEntity` to check for active templates**

The entity deletion prompt needs to happen at the UI level (where `Alert.alert` is available), not in the store. However, we can add a helper to the store that the UI can call.

Add a new action to `AppState`:

```typescript
deactivateTemplatesForEntity: (entityId: string) => Promise<void>;
```

Implement:

```typescript
deactivateTemplatesForEntity: async (entityId) => {
	const state = get();
	const templates = state.recurrenceTemplates.filter(
		(t) =>
			!t.is_deleted &&
			(t.from_entity_id === entityId || t.to_entity_id === entityId)
	);

	for (const template of templates) {
		// Delete future transactions
		await db.deleteTransactionsBySeriesFuture(template.id, Date.now());
		// Soft-delete template
		await db.softDeleteRecurrenceTemplate(template.id);
	}

	if (templates.length > 0) {
		const templateIds = new Set(templates.map((t) => t.id));
		const now = Date.now();
		set((state) => ({
			transactions: state.transactions.filter(
				(t) => !(t.series_id && templateIds.has(t.series_id) && t.timestamp >= now)
			),
			recurrenceTemplates: state.recurrenceTemplates.map((t) =>
				templateIds.has(t.id) ? { ...t, is_deleted: true } : t
			),
		}));
	}
},
```

- [ ] **Step 2: Add the entity deletion prompt at the UI callsite**

The entity deletion is triggered from the Summary screen entity management. Find where `deleteEntity` is called and wrap it with a check. This will depend on the exact UI component — likely in an entity edit/management modal.

Search for `deleteEntity` usage in components and add the prompt there. The pattern:

```typescript
const recurrenceTemplates = useStore((state) => state.recurrenceTemplates);
const deactivateTemplatesForEntity = useStore((state) => state.deactivateTemplatesForEntity);

// Before calling deleteEntity:
const activeTemplates = recurrenceTemplates.filter(
	(t) => !t.is_deleted && (t.from_entity_id === entityId || t.to_entity_id === entityId)
);

if (activeTemplates.length > 0) {
	Alert.alert(
		'Entity Used in Recurring Transactions',
		`This entity is used in ${activeTemplates.length} recurring transaction series. Also delete future occurrences and stop the recurrence?`,
		[
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Keep recurring',
				onPress: () => deleteEntity(entityId),
			},
			{
				text: 'Stop & delete future',
				style: 'destructive',
				onPress: async () => {
					await deactivateTemplatesForEntity(entityId);
					await deleteEntity(entityId);
				},
			},
		]
	);
} else {
	// Existing delete flow
	deleteEntity(entityId);
}
```

The exact file to modify depends on where entity deletion is triggered — find it by searching for `deleteEntity` in component files.

- [ ] **Step 3: Run type check**

Run: `bun run types`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(recurrence): add entity deletion prompt for active templates (KII-66)"
```

---

## Task 10: Final Integration & Cleanup

**Files:**

- All modified files

- [ ] **Step 1: Run full test suite**

Run: `bun run test`

Expected: All tests PASS.

- [ ] **Step 2: Run linter**

Run: `bun run lint`

Expected: No warnings or errors.

- [ ] **Step 3: Run type check**

Run: `bun run types`

Expected: No errors.

- [ ] **Step 4: Run formatter**

Run: `bun run format`

- [ ] **Step 5: Update export/import to handle `series_id`**

In `src/utils/export.ts`, update `transactionsToCsv` to include `series_id` in the CSV headers and row values.

In `src/utils/import.ts`, update the transaction parser to read `series_id` (nullable).

- [ ] **Step 6: Run tests again after export/import changes**

Run: `bun run test`

Expected: All tests PASS.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(recurrence): final integration and export/import support (KII-66)"
```
