-- Migration: backfill `split_id` on pre-existing split legs (KII-146)
--
-- Before this column, a split was N rows sharing `from_entity_id`, `timestamp`
-- and `note`, distributing one charge across pairwise-distinct categories.
-- `reconcile.ts` inferred that grouping at read time; this stamps it once so
-- the runtime heuristic can be deleted, with identical results on old data.
--
-- The id is a deterministic concatenation, not a random value, for two
-- reasons: SQLite has no hash function, and the group key is already unique
-- per group by construction. Determinism also means two devices holding the
-- same pre-migration history compute the same id, so household sync never
-- sees one logical split under two values.
--
-- `updated_at` is deliberately NOT bumped: a migration must not look like a
-- user edit to last-write-wins.
--
-- Conservative by design, matching the heuristic it replaces. A group with a
-- repeated category is skipped, because two same-category rows sharing a
-- timestamp and note are indistinguishable from two separate identical
-- charges — and mis-folding those would break dedup on re-import. Skipped
-- groups keep today's behavior: their total surfaces as `new` in review.
UPDATE transactions
SET split_id = 'sp:' || from_entity_id || ':' || timestamp || ':' || ifnull(note, '')
WHERE id IN (
  SELECT t.id FROM transactions t
  JOIN (
    SELECT from_entity_id AS fid, timestamp AS ts, ifnull(note, '') AS nt
    FROM transactions
    GROUP BY from_entity_id, timestamp, ifnull(note, '')
    HAVING COUNT(*) >= 2 AND COUNT(DISTINCT to_entity_id) = COUNT(*)
  ) g ON t.from_entity_id = g.fid AND t.timestamp = g.ts AND ifnull(t.note, '') = g.nt
);
