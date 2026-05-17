-- Migration: Enforce one plan per (entity_id, period_start)
--
-- Context: upsertPlan previously conflicted on the PK (`id`), so two plans
-- with the same entity+period but different generated ids could both insert.
-- This migration de-dupes existing duplicates and promotes the helper index
-- to a UNIQUE index so the composite acts as the natural key.

-- Step 1: Dedupe — keep the latest-inserted row per (entity_id, period_start).
-- The plans table has no updated_at column; MAX(rowid) is the closest proxy
-- for "most recently written" since rowid increases on every insert.
DELETE FROM plans
WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM plans GROUP BY entity_id, period_start
);
--> statement-breakpoint

-- Step 2: Promote the helper index to a UNIQUE constraint.
DROP INDEX `idx_plans_entity_period`;--> statement-breakpoint
CREATE UNIQUE INDEX `unq_plans_entity_period` ON `plans` (`entity_id`,`period_start`);
