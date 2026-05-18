-- Migration: Drop orphan market_value_snapshots before FK enforcement.
--
-- Context: 0015 added the missing FOREIGN KEY (entity_id) REFERENCES
-- entities(id) ON DELETE CASCADE, but until db.native.ts now also enables
-- `PRAGMA foreign_keys = ON` at runtime, the cascade has been a no-op on
-- device. Any pre-existing snapshot whose entity_id no longer points at a
-- live row would be silently carried forward by 0015's table-rebuild copy.
-- Clear those orphans up-front so the first connection with FK enforcement
-- on doesn't trip over them (the FK alone won't reject existing rows, but
-- this also unblocks future hard-delete paths).
--
-- Idempotent: if no orphans exist (the expected case, since softDeleteEntity
-- cleans snapshots inline), this is a no-op.
DELETE FROM market_value_snapshots
WHERE entity_id NOT IN (SELECT id FROM entities);
