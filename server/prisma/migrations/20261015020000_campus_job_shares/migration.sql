CREATE TABLE "campus_job_shares" (
  "id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "created_by" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_job_shares_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "campus_job_share_jobs" (
  "id" UUID NOT NULL,
  "share_id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  CONSTRAINT "campus_job_share_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campus_job_shares_token_key" ON "campus_job_shares"("token");
CREATE INDEX "campus_job_shares_created_by_created_at_idx" ON "campus_job_shares"("created_by", "created_at");
CREATE UNIQUE INDEX "campus_job_share_jobs_share_id_job_id_key" ON "campus_job_share_jobs"("share_id", "job_id");
CREATE INDEX "campus_job_share_jobs_job_id_idx" ON "campus_job_share_jobs"("job_id");
ALTER TABLE "campus_job_shares" ADD CONSTRAINT "campus_job_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campus_job_share_jobs" ADD CONSTRAINT "campus_job_share_jobs_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "campus_job_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campus_job_share_jobs" ADD CONSTRAINT "campus_job_share_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
