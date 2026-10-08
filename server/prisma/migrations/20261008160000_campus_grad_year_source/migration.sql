ALTER TABLE "campus_applicants" ADD COLUMN "grad_year_source" TEXT NOT NULL DEFAULT 'default';

UPDATE "campus_applicants" SET "grad_year_source" = 'manual' WHERE "grad_year" IS NOT NULL;
UPDATE "campus_applicants" SET "grad_year" = 2026 WHERE "grad_year" IS NULL;

ALTER TABLE "campus_applicants" ALTER COLUMN "grad_year" SET DEFAULT 2026;
ALTER TABLE "campus_applicants" ADD CONSTRAINT "campus_applicants_grad_year_source_check" CHECK ("grad_year_source" IN ('default', 'resume', 'manual'));
