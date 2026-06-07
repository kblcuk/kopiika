-- KII-120: Move monetary columns from REAL to INTEGER minor units.
--
-- Why: SQLite REAL is IEEE 754 double. `SUM` over many rows accumulates
-- ulp-level drift; identical op-logs on two devices (KII-96) can produce
-- different balances. Integer minor units (cents for EUR) are exact under
-- both `SUM` and replay-order permutation.
--
-- Backfill assumption: EUR (2 decimals) for all rows. The default currency
-- has been EUR since 0005_default-currency-to-eur.sql; pre-launch test DBs
-- have no other currencies in practice. `ROUND` handles existing float
-- drift correctly (e.g. 43.21000000001 → 4321).
--
-- IRREVERSIBLE: the old REAL columns are dropped. Roll back by restoring
-- a pre-migration backup, not by reversing this SQL.
--
-- Pattern modelled on 0018_add_updated_at.sql (table rebuild with FK toggle).

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- ── plans ─────────────────────────────────────────────────────────────────
CREATE TABLE `__new_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`period` text NOT NULL,
	`period_start` text NOT NULL,
	`planned_amount_minor` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_plans`(
	"id", "entity_id", "period", "period_start", "planned_amount_minor",
	"created_at", "updated_at"
) SELECT
	"id", "entity_id", "period", "period_start",
	CAST(ROUND("planned_amount" * 100) AS INTEGER),
	"created_at", "updated_at"
FROM `plans`;--> statement-breakpoint
DROP TABLE `plans`;--> statement-breakpoint
ALTER TABLE `__new_plans` RENAME TO `plans`;--> statement-breakpoint
CREATE UNIQUE INDEX `unq_plans_entity_period` ON `plans` (`entity_id`, `period_start`);--> statement-breakpoint

-- ── transactions ─────────────────────────────────────────────────────────
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`from_entity_id` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`timestamp` integer NOT NULL,
	`note` text,
	`series_id` text,
	`is_confirmed` integer DEFAULT true NOT NULL,
	`notification_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`from_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transactions`(
	"id", "from_entity_id", "to_entity_id", "amount_minor", "currency", "timestamp",
	"note", "series_id", "is_confirmed", "notification_id",
	"created_at", "updated_at"
) SELECT
	"id", "from_entity_id", "to_entity_id",
	CAST(ROUND("amount" * 100) AS INTEGER),
	"currency", "timestamp",
	"note", "series_id", "is_confirmed", "notification_id",
	"created_at", "updated_at"
FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE INDEX `idx_transactions_timestamp` ON `transactions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_transactions_from` ON `transactions` (`from_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_to` ON `transactions` (`to_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_series` ON `transactions` (`series_id`);--> statement-breakpoint

-- ── recurrence_templates ─────────────────────────────────────────────────
CREATE TABLE `__new_recurrence_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`from_entity_id` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`note` text,
	`rule` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`end_count` integer,
	`horizon` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`from_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_recurrence_templates`(
	"id", "from_entity_id", "to_entity_id", "amount_minor", "currency", "note",
	"rule", "start_date", "end_date", "end_count", "horizon",
	"is_deleted", "created_at", "updated_at"
) SELECT
	"id", "from_entity_id", "to_entity_id",
	CAST(ROUND("amount" * 100) AS INTEGER),
	"currency", "note",
	"rule", "start_date", "end_date", "end_count", "horizon",
	"is_deleted", "created_at", "updated_at"
FROM `recurrence_templates`;--> statement-breakpoint
DROP TABLE `recurrence_templates`;--> statement-breakpoint
ALTER TABLE `__new_recurrence_templates` RENAME TO `recurrence_templates`;--> statement-breakpoint
CREATE INDEX `idx_recurrence_templates_deleted` ON `recurrence_templates` (`is_deleted`);--> statement-breakpoint

-- ── market_value_snapshots ───────────────────────────────────────────────
CREATE TABLE `__new_market_value_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`date` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_market_value_snapshots`(
	"id", "entity_id", "amount_minor", "currency", "date",
	"created_at", "updated_at"
) SELECT
	"id", "entity_id",
	CAST(ROUND("amount" * 100) AS INTEGER),
	"currency", "date",
	"created_at", "updated_at"
FROM `market_value_snapshots`;--> statement-breakpoint
DROP TABLE `market_value_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_market_value_snapshots` RENAME TO `market_value_snapshots`;--> statement-breakpoint
CREATE INDEX `idx_market_value_snapshots_entity` ON `market_value_snapshots` (`entity_id`);--> statement-breakpoint

PRAGMA foreign_keys=ON;
