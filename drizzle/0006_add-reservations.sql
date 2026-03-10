CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_entity_id` text NOT NULL,
	`saving_entity_id` text NOT NULL,
	`amount` real NOT NULL,
	FOREIGN KEY (`account_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`saving_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_reservations_account` ON `reservations` (`account_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_reservations_saving` ON `reservations` (`saving_entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unq_reservations_pair` ON `reservations` (`account_entity_id`,`saving_entity_id`);--> statement-breakpoint
-- Collapse existing account→saving transactions into reservations
INSERT OR IGNORE INTO `reservations` (`id`, `account_entity_id`, `saving_entity_id`, `amount`)
SELECT
	'migrated-' || `from_entity_id` || '-' || `to_entity_id`,
	`from_entity_id`,
	`to_entity_id`,
	SUM(`amount`)
FROM `transactions`
WHERE
	`from_entity_id` IN (SELECT `id` FROM `entities` WHERE `type` = 'account')
	AND `to_entity_id` IN (SELECT `id` FROM `entities` WHERE `type` = 'saving')
GROUP BY `from_entity_id`, `to_entity_id`;
--> statement-breakpoint
-- Delete account→saving transactions now that they live in reservations
DELETE FROM `transactions`
WHERE
	`from_entity_id` IN (SELECT `id` FROM `entities` WHERE `type` = 'account')
	AND `to_entity_id` IN (SELECT `id` FROM `entities` WHERE `type` = 'saving');