ALTER TABLE "jobs" ADD COLUMN "recruitment_type" TEXT NOT NULL DEFAULT 'social';
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recruitment_type_check" CHECK ("recruitment_type" IN ('social', 'campus'));

UPDATE "jobs" AS j SET "recruitment_type" = 'campus'
WHERE EXISTS (SELECT 1 FROM "campus_session_jobs" AS sj WHERE sj."job_id" = j."id")
   OR EXISTS (
     SELECT 1 FROM "audit_logs" AS log
     WHERE log."action" = 'campus.job.create'
       AND log."entity_type" = 'Job'
       AND log."entity_id" = j."id"::text
   );

CREATE INDEX "jobs_recruitment_type_idx" ON "jobs"("recruitment_type");
