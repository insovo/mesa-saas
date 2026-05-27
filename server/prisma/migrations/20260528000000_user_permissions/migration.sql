-- Add permissions to users for fine-grained capability flags (admin can grant to non-admin)
ALTER TABLE "users"
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
