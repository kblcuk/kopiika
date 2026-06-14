-- Migration: drop legacy materialized FUTURE recurrence occurrences (KII-136)
--
-- Before de-materialization, future recurring occurrences were stored as real
-- `transactions` rows (series_id set, is_confirmed = 0, timestamp > now),
-- pre-generated up to now + horizon. They are now derived on demand, so any
-- lingering future phantom rows would double-count against derived occurrences
-- (their random legacy ids don't dedup against the new deterministic ids).
--
-- Delete only unconfirmed FUTURE series rows. Past-due (timestamp <= now) and
-- confirmed rows are real history and are preserved, as are future-dated
-- one-off transactions (series_id IS NULL). "now" is the user's clock at
-- upgrade time via strftime, so the cutoff matches their current moment.
DELETE FROM transactions
WHERE series_id IS NOT NULL
  AND is_confirmed = 0
  AND timestamp > (CAST(strftime('%s', 'now') AS INTEGER) * 1000);
