-- CreateTable
CREATE TABLE "interview_evaluations" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "interview_id" UUID,
    "job_id" UUID,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'link_sent',
    "expires_at" TIMESTAMP(3),
    "candidate_name" TEXT NOT NULL,
    "position" TEXT,
    "region" TEXT,
    "interview_date" TIMESTAMP(3),
    "interviewer" TEXT NOT NULL,
    "language_strength" TEXT,
    "current_city" TEXT,
    "department" TEXT,
    "timezone_collaboration" TEXT,
    "scores" JSONB NOT NULL DEFAULT '[]',
    "strengths" TEXT,
    "risks" TEXT,
    "follow_up_questions" TEXT,
    "final_opinion" TEXT,
    "total_score" DOUBLE PRECISION,
    "recommendation" TEXT,
    "template_version" TEXT NOT NULL DEFAULT 'v1',
    "template_file_hash" TEXT,
    "created_by" UUID,
    "submitted_at" TIMESTAMP(3),
    "exported_at" TIMESTAMP(3),
    "exported_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_evaluations_token_key" ON "interview_evaluations"("token");

-- CreateIndex
CREATE INDEX "interview_evaluations_candidate_id_idx" ON "interview_evaluations"("candidate_id");

-- CreateIndex
CREATE INDEX "interview_evaluations_interview_id_idx" ON "interview_evaluations"("interview_id");

-- CreateIndex
CREATE INDEX "interview_evaluations_token_idx" ON "interview_evaluations"("token");

-- CreateIndex
CREATE INDEX "interview_evaluations_created_by_idx" ON "interview_evaluations"("created_by");

-- CreateIndex
CREATE INDEX "interview_evaluations_status_idx" ON "interview_evaluations"("status");

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
