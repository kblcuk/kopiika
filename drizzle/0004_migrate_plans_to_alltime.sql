-- Migration: Convert all plans to 'all-time' period
-- This keeps only the most recent plan per entity and updates period to 'all-time'
--
-- Context: Previously, plans could be either:
-- - period='month' with period_start='YYYY-MM' for monthly budgets
-- - period='all-time' with period_start='YYYY-MM' for cumulative goals (savings)
--
-- After this migration, all plans use period='all-time' representing a static
-- default budget/goal that applies the same way every month.

-- Step 1: Delete duplicate plans, keeping only the most recent per entity
-- If an entity has plans for Jan, Feb, Mar - we keep only the Mar plan
DELETE FROM plans
WHERE id NOT IN (
  SELECT id FROM plans p1
  WHERE period_start = (
    SELECT MAX(period_start) FROM plans p2 WHERE p2.entity_id = p1.entity_id
  )
);
--> statement-breakpoint

-- Step 2: Update all remaining plans to 'all-time'
UPDATE plans SET period = 'all-time';
