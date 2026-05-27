-- Add sort_order column to departments for sibling ordering (org-chart drag)
BEGIN;

ALTER TABLE "departments"
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Seed sort_order per sibling group by created_at, so existing siblings keep a stable order
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY created_at, id) - 1) * 10 AS new_order
  FROM "departments"
)
UPDATE "departments" d
SET "sort_order" = ranked.new_order
FROM ranked
WHERE d.id = ranked.id;

CREATE INDEX "departments_parent_id_sort_order_idx"
  ON "departments" ("parent_id", "sort_order");

COMMIT;
