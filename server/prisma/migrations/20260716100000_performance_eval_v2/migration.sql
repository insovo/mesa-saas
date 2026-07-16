-- AlterTable
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "areas_for_improvement" TEXT;

-- AlterTable: default template version for new rows
ALTER TABLE "performance_evaluations" ALTER COLUMN "template_version" SET DEFAULT 'v2';
