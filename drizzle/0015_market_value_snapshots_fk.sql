PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_market_value_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_market_value_snapshots`("id", "entity_id", "amount", "currency", "date") SELECT "id", "entity_id", "amount", "currency", "date" FROM `market_value_snapshots`;--> statement-breakpoint
DROP TABLE `market_value_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_market_value_snapshots` RENAME TO `market_value_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_market_value_snapshots_entity` ON `market_value_snapshots` (`entity_id`);