-- Create new table with row/position schema
CREATE TABLE entities_new (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('income', 'account', 'category', 'saving')),
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    owner_id TEXT,
    row INTEGER NOT NULL,
    position INTEGER NOT NULL,
    'order' INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint

-- Migrate categories distributed across 3 rows per_row = CEIL(count / 3), using integer math: (count + 2) / 3
INSERT INTO entities_new (id, type, name, currency, icon, color, owner_id, row, position)
WITH category_stats AS (
    SELECT MAX(1, (COUNT(*) + 2) / 3) as per_row
    FROM entities
    WHERE type = 'category'
),
categories_indexed AS (
    SELECT
        id, type, name, currency, icon, color, owner_id,
        (ROW_NUMBER() OVER (ORDER BY "order") - 1) as idx
    FROM entities
    WHERE type = 'category'
)
SELECT
    c.id, c.type, c.name, c.currency, c.icon, c.color, c.owner_id,
    c.idx / s.per_row as row,
    c.idx % s.per_row as position
FROM categories_indexed c
CROSS JOIN category_stats s;
--> statement-breakpoint

-- Migrate non-category entities to row 0
INSERT INTO entities_new (id, type, name, currency, icon, color, owner_id, row, position)
SELECT
    id, type, name, currency, icon, color, owner_id,
    0 as row,
    (ROW_NUMBER() OVER (ORDER BY "order") - 1) as position
FROM entities
WHERE type != 'category';
--> statement-breakpoint

-- Drop old table and rename new one
DROP TABLE entities;
--> statement-breakpoint
ALTER TABLE entities_new RENAME TO entities;
--> statement-breakpoint

-- Recreate indices
CREATE INDEX idx_entities_type ON entities(type);
--> statement-breakpoint
CREATE INDEX idx_entities_type_row_position ON entities(type, row, position);
