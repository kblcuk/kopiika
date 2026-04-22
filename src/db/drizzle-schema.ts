import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

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
		planned_amount: real('planned_amount').notNull(),
	},
	(table) => [index('idx_plans_entity_period').on(table.entity_id, table.period_start)]
);

// Transactions table
export const transactions = sqliteTable(
	'transactions',
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
		timestamp: integer('timestamp').notNull(),
		note: text('note'),
		// No FK constraint: transactions can outlive a soft-deleted template
		series_id: text('series_id'),
		is_confirmed: integer('is_confirmed', { mode: 'boolean' }).notNull().default(true),
		notification_id: text('notification_id'),
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
}));
