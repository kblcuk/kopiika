import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
		owner_id: text('owner_id'),
		order: integer('order').notNull(),
		row: integer('row').notNull(),
		position: integer('position').notNull(),
		include_in_total: integer('include_in_total', { mode: 'boolean' }).notNull().default(true),
		is_deleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
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
	},
	(table) => [
		index('idx_transactions_timestamp').on(table.timestamp),
		index('idx_transactions_from').on(table.from_entity_id),
		index('idx_transactions_to').on(table.to_entity_id),
	]
);

// Reservations table — mutable account→saving money reservations
export const reservations = sqliteTable(
	'reservations',
	{
		id: text('id').primaryKey(),
		account_entity_id: text('account_entity_id')
			.notNull()
			.references(() => entities.id, { onDelete: 'cascade' }),
		saving_entity_id: text('saving_entity_id')
			.notNull()
			.references(() => entities.id, { onDelete: 'cascade' }),
		amount: real('amount').notNull(),
	},
	(table) => [
		index('idx_reservations_account').on(table.account_entity_id),
		index('idx_reservations_saving').on(table.saving_entity_id),
		uniqueIndex('unq_reservations_pair').on(table.account_entity_id, table.saving_entity_id),
	]
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
	reservationsAsAccount: many(reservations, {
		relationName: 'reservation_account',
	}),
	reservationsAsSaving: many(reservations, {
		relationName: 'reservation_saving',
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
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
	account: one(entities, {
		fields: [reservations.account_entity_id],
		references: [entities.id],
		relationName: 'reservation_account',
	}),
	saving: one(entities, {
		fields: [reservations.saving_entity_id],
		references: [entities.id],
		relationName: 'reservation_saving',
	}),
}));
