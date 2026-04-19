CREATE TABLE `recurrence_templates` (
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
	FOREIGN KEY (`from_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recurrence_templates_deleted` ON `recurrence_templates` (`is_deleted`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `series_id` text;--> statement-breakpoint
CREATE INDEX `idx_transactions_series` ON `transactions` (`series_id`);