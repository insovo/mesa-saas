-- AlterTable
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "self_access_key_hash" TEXT;
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "manager_access_key_hash" TEXT;
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "self_access_key_fail_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "manager_access_key_fail_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "self_access_key_locked_until" TIMESTAMP(3);
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "manager_access_key_locked_until" TIMESTAMP(3);
