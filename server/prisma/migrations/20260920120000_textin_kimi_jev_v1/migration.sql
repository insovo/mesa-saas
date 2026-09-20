-- TextIn + Kimi + Jev 三层架构 V1(2026-09-20)
-- 纯新增列 / 新表,无类型转换;全部可空或带默认值,对存量数据零影响。

-- Candidate:结构化档案 + 派生指标 + 评估分类快照
ALTER TABLE "candidates"
  ADD COLUMN "profile" JSONB,
  ADD COLUMN "derived" JSONB,
  ADD COLUMN "profile_version" TEXT,
  ADD COLUMN "profile_warnings" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "classification" TEXT,
  ADD COLUMN "review_priority" TEXT;
CREATE INDEX "candidates_classification_idx" ON "candidates"("classification");

-- Job:JD 事实层 + 评价模型层
ALTER TABLE "jobs"
  ADD COLUMN "jd_facts" JSONB,
  ADD COLUMN "jd_facts_version" TEXT,
  ADD COLUMN "evaluation_model" JSONB,
  ADD COLUMN "evaluation_model_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "evaluation_model_updated_at" TIMESTAMP(3),
  ADD COLUMN "evaluation_model_source" TEXT;

-- 文档层产物
CREATE TABLE "resume_parses" (
  "id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "attachment_key" TEXT NOT NULL,
  "file_sha256" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_version" TEXT,
  "markdown" TEXT NOT NULL,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "raw_result_key" TEXT,
  "page_count" INTEGER,
  "duration_ms" INTEGER,
  "char_count" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resume_parses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "resume_parses_candidate_id_file_sha256_provider_key" ON "resume_parses"("candidate_id", "file_sha256", "provider");
CREATE INDEX "resume_parses_candidate_id_idx" ON "resume_parses"("candidate_id");
ALTER TABLE "resume_parses" ADD CONSTRAINT "resume_parses_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 评估层产物
CREATE TABLE "candidate_evaluations" (
  "id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "resume_parse_id" UUID,
  "engine" TEXT NOT NULL,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "shadow" BOOLEAN NOT NULL DEFAULT false,
  "hardFilter" JSONB NOT NULL,
  "jev_request" JSONB,
  "jev_answers" JSONB,
  "dimensions" JSONB NOT NULL,
  "items" JSONB NOT NULL,
  "overall_score" INTEGER NOT NULL,
  "classification" TEXT NOT NULL,
  "review_priority" TEXT NOT NULL,
  "reasons" JSONB NOT NULL DEFAULT '[]',
  "flags" JSONB NOT NULL DEFAULT '[]',
  "min_confidence" DOUBLE PRECISION,
  "report" JSONB,
  "report_status" TEXT NOT NULL DEFAULT 'pending',
  "manual_override" JSONB,
  "versions" JSONB NOT NULL,
  "costs" JSONB,
  "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "candidate_evaluations_candidate_id_job_id_evaluated_at_idx" ON "candidate_evaluations"("candidate_id", "job_id", "evaluated_at");
CREATE INDEX "candidate_evaluations_job_id_is_current_classification_idx" ON "candidate_evaluations"("job_id", "is_current", "classification");
ALTER TABLE "candidate_evaluations" ADD CONSTRAINT "candidate_evaluations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_evaluations" ADD CONSTRAINT "candidate_evaluations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
