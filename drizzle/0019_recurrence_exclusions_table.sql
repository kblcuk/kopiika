-- KII-123: Normalize recurrence exclusions into their own table.
--
-- The old `recurrence_templates.exclusions` column was a JSON array of
-- skipped timestamps mutated via read-modify-write
-- (`JSON.parse → push → JSON.stringify`). That has two problems:
--   1. Two concurrent writers (background notification confirm + foreground
--      user action) can both load the same snapshot, both append, and the
--      second `stringify` clobbers the first's addition.
--   2. JSON-blob merge can't express "add exclusion X" as a discrete op for
--      household-sync replay (KII-96) — diverging device states collide on
--      the entire blob instead of producing a set-union.
--
-- The new `recurrence_exclusions` table makes "add exclusion X" a single
-- INSERT OR IGNORE. The composite PK gives free set-union semantics across
-- replicas.

CREATE TABLE `recurrence_exclusions` (
	`template_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	PRIMARY KEY(`template_id`, `timestamp`),
	FOREIGN KEY (`template_id`) REFERENCES `recurrence_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
-- No secondary index on `template_id`: the composite PK already physically
-- orders rows by (template_id, timestamp), so leftmost-prefix scans on
-- `template_id` alone are served directly by the PK B-tree.
--> statement-breakpoint

-- Backfill: parse the JSON array from each existing template and INSERT one
-- row per timestamp. `json_each` returns an empty rowset for `NULL` / `'[]'`
-- so those templates contribute no rows. `INSERT OR IGNORE` guards against
-- duplicate timestamps within a single JSON blob (set-union semantics).
INSERT OR IGNORE INTO `recurrence_exclusions` (`template_id`, `timestamp`)
SELECT
	`recurrence_templates`.`id`,
	CAST(`json_each`.`value` AS INTEGER)
FROM `recurrence_templates`, `json_each`(`recurrence_templates`.`exclusions`)
WHERE
	`recurrence_templates`.`exclusions` IS NOT NULL
	AND `json_valid`(`recurrence_templates`.`exclusions`)
	AND `json_type`(`recurrence_templates`.`exclusions`) = 'array';
--> statement-breakpoint

ALTER TABLE `recurrence_templates` DROP COLUMN `exclusions`;
