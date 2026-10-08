ALTER TABLE "campus_applicants"
  ADD COLUMN "auto_evaluation_status" TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN "auto_evaluation_job_id" UUID,
  ADD COLUMN "auto_evaluation_version_id" UUID,
  ADD COLUMN "auto_evaluation_id" UUID,
  ADD COLUMN "auto_evaluation_task_id" TEXT,
  ADD COLUMN "auto_evaluation_error" TEXT;
