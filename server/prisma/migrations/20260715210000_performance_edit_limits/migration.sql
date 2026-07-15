-- AlterTable
ALTER TABLE "performance_evaluations" ADD COLUMN "self_max_edits" INTEGER;
ALTER TABLE "performance_evaluations" ADD COLUMN "manager_max_edits" INTEGER;
ALTER TABLE "performance_evaluations" ADD COLUMN "self_edit_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "performance_evaluations" ADD COLUMN "manager_edit_count" INTEGER NOT NULL DEFAULT 0;
