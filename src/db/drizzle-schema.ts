import {
	sqliteTable,
	text,
	integer,
	index,
	uniqueIndex,
	primaryKey,
} from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// Per-row write-time columns used by sync (KII-126, KII-96):
// - `created_at` is set once on insert (SQL default) and never bumped.
// - `updated_at` defaults on insert and is bumped on every UPDATE via
//   Drizzle's `$onUpdate`. Write helpers also pass it explicitly as a
//   belt-and-suspenders against code paths that bypass column-level updates
//   (e.g. `onConflictDoUpdate`).
//
// Hard-delete caveat (KII-96 follow-up): `transactions`, `plans`, and
// `market_value_snapshots` are hard-deleted (rows disappear). Sync replay
// alone — comparing `updated_at` across devices — can't recover the
// "this row was deleted" signal, since the row is gone. When the op-log
// ships, deletes will need to flow as explicit operations (tombstones in
// the op-log, not in the schema). `entities` and `recurrence_templates`
// already use `is_deleted` soft-delete and are safe.
const createdAt = () =>
	integer('created_at')
		.notNull()
		.default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
	integer('updated_at')
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
		.$onUpdate(() => Date.now());

// Entities table
export const entities = sqliteTable(
	'entities',
	{
		id: text('id').primaryKey(),
		type: text('type', {
			enum: ['income', 'account', 'category', 'saving'],
		}).notNull(),
		name: text('name').notNull(),
		currency: text('currency').notNull(),
		icon: text('icon'),
		color: text('color'),
		order: integer('order').notNull(),
		row: integer('row').notNull(),
		position: integer('position').notNull(),
		include_in_total: integer('include_in_total', { mode: 'boolean' }).notNull().default(true),
		is_deleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		is_default: integer('is_default', { mode: 'boolean' }).notNull().default(false),
		is_investment: integer('is_investment', { mode: 'boolean' }).notNull().default(false),
		created_at: createdAt(),
		updated_at: updatedAt(),
	},
	(table) => [
		index('idx_entities_type').on(table.type),
		index('idx_entities_type_row_position').on(table.type, table.row, table.position),
	]
);

// Plans table
export const plans = sqliteTable(
	'plans',
	{
		id: text('id').primaryKey(),
		entity_id: text('entity_id')
			.notNull()
			.references(() => entities.id, { onDelete: 'cascade' }),
		period: text('period').notNull(),
		period_start: text('period_start').notNull(),
		// KII-120: integer minor units (cents for EUR). Use toMinor/toMajor at the
		// UI boundary. SUM is now exact; balance math is bit-stable across devices,
		// which matters for KII-96 op-log replay.
		planned_amount_minor: integer('planned_amount_minor').notNull(),
		created_at: createdAt(),
		updated_at: updatedAt(),
	},
	(table) => [uniqueIndex('unq_plans_entity_period').on(table.entity_id, table.period_start)]
);

// Transactions table
export const transactions = sqliteTable(
	'transactions',
	{
		id: text('id').primaryKey(),
		// RESTRICT FK (no onDelete): with PRAGMA foreign_keys=ON, hard-deleting a
		// referenced entity row throws. The app soft-deletes entities, so this is
		// usually irrelevant; bulk wipes (replaceAllData) must delete in FK-safe
		// order: snapshots → transactions → recurrence_templates → plans → entities.
		from_entity_id: text('from_entity_id')
			.notNull()
			.references(() => entities.id),
		to_entity_id: text('to_entity_id')
			.notNull()
			.references(() => entities.id),
		// KII-120: see plans.planned_amount_minor for rationale.
		amount_minor: integer('amount_minor').notNull(),
		currency: text('currency').notNull(),
		timestamp: integer('timestamp').notNull(),
		note: text('note'),
		// No FK constraint: transactions can outlive a soft-deleted template
		series_id: text('series_id'),
		is_confirmed: integer('is_confirmed', { mode: 'boolean' }).notNull().default(true),
		notification_id: text('notification_id'),
		created_at: createdAt(),
		updated_at: updatedAt(),
	},
	(table) => [
		index('idx_transactions_timestamp').on(table.timestamp),
		index('idx_transactions_from').on(table.from_entity_id),
		index('idx_transactions_to').on(table.to_entity_id),
		index('idx_transactions_series').on(table.series_id),
	]
);

// Recurrence templates table
export const recurrenceTemplates = sqliteTable(
	'recurrence_templates',
	{
		id: text('id').primaryKey(),
		// RESTRICT FK — see transactions.from_entity_id comment above.
		from_entity_id: text('from_entity_id')
			.notNull()
			.references(() => entities.id),
		to_entity_id: text('to_entity_id')
			.notNull()
			.references(() => entities.id),
		// KII-120: see plans.planned_amount_minor for rationale.
		amount_minor: integer('amount_minor').notNull(),
		currency: text('currency').notNull(),
		note: text('note'),
		rule: text('rule').notNull(), // JSON: { type: "daily" | "weekly" | "monthly" | "yearly" }
		start_date: integer('start_date').notNull(),
		end_date: integer('end_date'),
		end_count: integer('end_count'),
		horizon: integer('horizon').notNull(), // days ahead to generate
		is_deleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		// Pre-existing column (app-supplied). No SQL default — kept as-is to
		// avoid migration churn. New tables use the shared `createdAt()` helper.
		created_at: integer('created_at').notNull(),
		updated_at: updatedAt(),
	},
	(table) => [index('idx_recurrence_templates_deleted').on(table.is_deleted)]
);

// KII-123: Exclusions live in their own table so:
//   1. Adding an exclusion is a single INSERT (no JSON read-modify-write race
//      between background notification confirms and foreground user actions).
//   2. Concurrent inserts on multiple devices produce a clean set-union
//      (composite PK + INSERT OR IGNORE) for op-log replay (KII-96).
export const recurrenceExclusions = sqliteTable(
	'recurrence_exclusions',
	{
		template_id: text('template_id')
			.notNull()
			.references(() => recurrenceTemplates.id, { onDelete: 'cascade' }),
		timestamp: integer('timestamp').notNull(),
	},
	// No secondary index on `template_id`: the composite PK already physically
	// orders rows by `(template_id, timestamp)`, so a leftmost-prefix scan on
	// `template_id` alone is served directly by the PK B-tree.
	(table) => [primaryKey({ columns: [table.template_id, table.timestamp] })]
);

// Market value snapshots table (for investment accounts)
export const marketValueSnapshots = sqliteTable(
	'market_value_snapshots',
	{
		id: text('id').primaryKey(),
		entity_id: text('entity_id')
			.notNull()
			.references(() => entities.id, { onDelete: 'cascade' }),
		// KII-120: see plans.planned_amount_minor for rationale.
		amount_minor: integer('amount_minor').notNull(),
		currency: text('currency').notNull(),
		date: integer('date').notNull(),
		created_at: createdAt(),
		updated_at: updatedAt(),
	},
	(table) => [index('idx_market_value_snapshots_entity').on(table.entity_id)]
);

// Relations for cascade deletes and joins
export const entitiesRelations = relations(entities, ({ many }) => ({
	plans: many(plans),
	transactionsFrom: many(transactions, {
		relationName: 'from_entity',
	}),
	transactionsTo: many(transactions, {
		relationName: 'to_entity',
	}),
	recurrenceTemplatesFrom: many(recurrenceTemplates, {
		relationName: 'recurrence_from_entity',
	}),
	recurrenceTemplatesTo: many(recurrenceTemplates, {
		relationName: 'recurrence_to_entity',
	}),
	marketValueSnapshots: many(marketValueSnapshots, {
		relationName: 'entity_market_values',
	}),
}));

export const plansRelations = relations(plans, ({ one }) => ({
	entity: one(entities, {
		fields: [plans.entity_id],
		references: [entities.id],
	}),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
	fromEntity: one(entities, {
		fields: [transactions.from_entity_id],
		references: [entities.id],
		relationName: 'from_entity',
	}),
	toEntity: one(entities, {
		fields: [transactions.to_entity_id],
		references: [entities.id],
		relationName: 'to_entity',
	}),
	recurrenceTemplate: one(recurrenceTemplates, {
		fields: [transactions.series_id],
		references: [recurrenceTemplates.id],
		relationName: 'recurrence_transactions',
	}),
}));

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
	exclusions: many(recurrenceExclusions, {
		relationName: 'template_exclusions',
	}),
}));

export const recurrenceExclusionsRelations = relations(recurrenceExclusions, ({ one }) => ({
	template: one(recurrenceTemplates, {
		fields: [recurrenceExclusions.template_id],
		references: [recurrenceTemplates.id],
		relationName: 'template_exclusions',
	}),
}));
