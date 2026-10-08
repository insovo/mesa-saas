CREATE TABLE "candidate_job_recommendations" (
    "id" SERIAL NOT NULL,
    "candidate_id" UUID NOT NULL,
    "job_id" UUID,
    "job_title" TEXT,
    "actor_id" UUID,
    "actor_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_job_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "candidate_job_recommendations_candidate_id_id_idx" ON "candidate_job_recommendations"("candidate_id", "id");

ALTER TABLE "candidate_job_recommendations" ADD CONSTRAINT "candidate_job_recommendations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
