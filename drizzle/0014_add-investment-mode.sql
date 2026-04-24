ALTER TABLE `entities` ADD `is_investment` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `market_value_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`date` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_market_value_snapshots_entity` ON `market_value_snapshots` (`entity_id`);
