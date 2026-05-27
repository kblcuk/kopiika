-- KII-126: Add `created_at` and `updated_at` to mutable tables for sync ordering (KII-96).
--
-- Why table-rebuild and not `ALTER TABLE ADD COLUMN`:
--   1. SQLite rejects `DEFAULT (unixepoch() * 1000)` on `ADD COLUMN`
--      ("Cannot add a column with non-constant default"), so ADD COLUMN
--      forces a constant fallback like `DEFAULT 0`. That makes the actual
--      SQLite column default permanently disagree with the schema snapshot's
--      stated `(unixepoch() * 1000)`, and any future raw INSERT that omits
--      the column would silently store `0`.
--   2. Rebuilding lets us set the canonical SQL default once and backfill
--      with whatever expression we want.
--
-- Backfill strategy: `created_at` and `updated_at` are write-time stamps.
-- We deliberately do NOT seed them from domain timestamps (`transactions
-- .timestamp`, `market_value_snapshots.date`) — those are event-time, and a
-- future-dated scheduled transaction would otherwise hand us an
-- `updated_at` months ahead, breaking any sync cursor based on
-- `MAX(updated_at)`. We use the migration moment (`unixepoch() * 1000`)
-- uniformly. The one exception is `recurrence_templates`, which already
-- carries an app-supplied `created_at` (real write-time) — we mirror that
-- into the new `updated_at` instead of stomping it.
--
-- Pattern modelled after `drizzle/0015_market_value_snapshots_fk.sql`.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- ── entities ──────────────────────────────────────────────────────────────
CREATE TABLE `__new_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`icon` text,
	`color` text,
	`order` integer NOT NULL,
	`row` integer NOT NULL,
	`position` integer NOT NULL,
	`include_in_total` integer DEFAULT true NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_investment` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_entities`(
	"id", "type", "name", "currency", "icon", "color", "order", "row", "position",
	"include_in_total", "is_deleted", "is_default", "is_investment",
	"created_at", "updated_at"
) SELECT
	"id", "type", "name", "currency", "icon", "color", "order", "row", "position",
	"include_in_total", "is_deleted", "is_default", "is_investment",
	(unixepoch() * 1000), (unixepoch() * 1000)
FROM `entities`;--> statement-breakpoint
DROP TABLE `entities`;--> statement-breakpoint
ALTER TABLE `__new_entities` RENAME TO `entities`;--> statement-breakpoint
CREATE INDEX `idx_entities_type` ON `entities` (`type`);--> statement-breakpoint
CREATE INDEX `idx_entities_type_row_position` ON `entities` (`type`, `row`, `position`);--> statement-breakpoint

-- ── plans ─────────────────────────────────────────────────────────────────
CREATE TABLE `__new_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`period` text NOT NULL,
	`period_start` text NOT NULL,
	`planned_amount` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_plans`(
	"id", "entity_id", "period", "period_start", "planned_amount",
	"created_at", "updated_at"
) SELECT
	"id", "entity_id", "period", "period_start", "planned_amount",
	(unixepoch() * 1000), (unixepoch() * 1000)
FROM `plans`;--> statement-breakpoint
DROP TABLE `plans`;--> statement-breakpoint
ALTER TABLE `__new_plans` RENAME TO `plans`;--> statement-breakpoint
CREATE UNIQUE INDEX `unq_plans_entity_period` ON `plans` (`entity_id`, `period_start`);--> statement-breakpoint

-- ── transactions ─────────────────────────────────────────────────────────
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`from_entity_id` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`amount` real NOT NULL,
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
	"id", "from_entity_id", "to_entity_id", "amount", "currency", "timestamp",
	"note", "series_id", "is_confirmed", "notification_id",
	"created_at", "updated_at"
) SELECT
	"id", "from_entity_id", "to_entity_id", "amount", "currency", "timestamp",
	"note", "series_id", "is_confirmed", "notification_id",
	(unixepoch() * 1000), (unixepoch() * 1000)
FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE INDEX `idx_transactions_timestamp` ON `transactions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_transactions_from` ON `transactions` (`from_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_to` ON `transactions` (`to_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_series` ON `transactions` (`series_id`);--> statement-breakpoint

-- ── recurrence_templates ─────────────────────────────────────────────────
-- `created_at` here is app-supplied (existed before KII-126); we only ADD
-- `updated_at`. We still rebuild the table so the new column gets the
-- canonical `(unixepoch() * 1000)` SQL default rather than the constant
-- fallback that `ALTER TABLE ADD COLUMN` would force.
CREATE TABLE `__new_recurrence_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`from_entity_id` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`note` text,
	`rule` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`end_count` integer,
	`horizon` integer NOT NULL,
	`exclusions` text,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`from_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_recurrence_templates`(
	"id", "from_entity_id", "to_entity_id", "amount", "currency", "note",
	"rule", "start_date", "end_date", "end_count", "horizon", "exclusions",
	"is_deleted", "created_at", "updated_at"
) SELECT
	"id", "from_entity_id", "to_entity_id", "amount", "currency", "note",
	"rule", "start_date", "end_date", "end_count", "horizon", "exclusions",
	"is_deleted", "created_at", "created_at"
FROM `recurrence_templates`;--> statement-breakpoint
DROP TABLE `recurrence_templates`;--> statement-breakpoint
ALTER TABLE `__new_recurrence_templates` RENAME TO `recurrence_templates`;--> statement-breakpoint
CREATE INDEX `idx_recurrence_templates_deleted` ON `recurrence_templates` (`is_deleted`);--> statement-breakpoint

-- ── market_value_snapshots ───────────────────────────────────────────────
CREATE TABLE `__new_market_value_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`date` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_market_value_snapshots`(
	"id", "entity_id", "amount", "currency", "date",
	"created_at", "updated_at"
) SELECT
	"id", "entity_id", "amount", "currency", "date",
	(unixepoch() * 1000), (unixepoch() * 1000)
FROM `market_value_snapshots`;--> statement-breakpoint
DROP TABLE `market_value_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_market_value_snapshots` RENAME TO `market_value_snapshots`;--> statement-breakpoint
CREATE INDEX `idx_market_value_snapshots_entity` ON `market_value_snapshots` (`entity_id`);--> statement-breakpoint

PRAGMA foreign_keys=ON;
