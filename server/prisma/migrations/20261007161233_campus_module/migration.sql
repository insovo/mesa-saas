-- 校招模块(2026-10-08):5 张新表 + 外键,纯新增,对存量数据零影响。
-- 注:prisma 生成时混入的 audit_logs / password_history 索引与 employees.drop_reason 类型漂移属历史手写迁移与 schema 的既有差异,已从本迁移剔除。

-- CreateTable
CREATE TABLE "campus_sessions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "school" TEXT,
    "location" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "hero_title" TEXT,
    "hero_subtitle" TEXT,
    "banner_key" TEXT,
    "max_apply_jobs" INTEGER NOT NULL DEFAULT 3,
    "max_resume_uploads" INTEGER NOT NULL DEFAULT 3,
    "score_floor" INTEGER NOT NULL DEFAULT 60,
    "match_enabled" BOOLEAN NOT NULL DEFAULT true,
    "show_salary_onsite" BOOLEAN NOT NULL DEFAULT true,
    "show_salary_referral" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus_session_jobs" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'onsite',
    "match_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campus_session_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus_applicants" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "name" TEXT,
    "wechat" TEXT,
    "school" TEXT,
    "major" TEXT,
    "degree" TEXT,
    "grad_year" INTEGER,
    "contact_confirmed_at" TIMESTAMP(3),
    "consent_at" TIMESTAMP(3),
    "consent_version" TEXT,
    "resume_upload_count" INTEGER NOT NULL DEFAULT 0,
    "extra_uploads" INTEGER NOT NULL DEFAULT 0,
    "current_resume_version_id" UUID,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),
    "registered_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus_resume_versions" (
    "id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "attachment_key" TEXT NOT NULL,
    "file_sha256" TEXT,
    "filename" TEXT,
    "size" INTEGER,
    "content_type" TEXT,
    "resume_parse_id" UUID,
    "parse_status" TEXT NOT NULL DEFAULT 'pending',
    "parse_error" TEXT,
    "parse_task_id" TEXT,
    "uploaded_by" UUID,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campus_resume_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus_applications" (
    "id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "session_job_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "match_run_id" UUID,
    "resume_version_id" UUID,
    "score_raw" INTEGER,
    "score_shown" INTEGER,
    "evaluation_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus_match_runs" (
    "id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "resume_version_id" UUID NOT NULL,
    "task_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "results" JSONB NOT NULL DEFAULT '[]',
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "costs" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "campus_match_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campus_sessions_slug_key" ON "campus_sessions"("slug");

-- CreateIndex
CREATE INDEX "campus_sessions_status_idx" ON "campus_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campus_session_jobs_session_id_job_id_key" ON "campus_session_jobs"("session_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "campus_applicants_candidate_id_key" ON "campus_applicants"("candidate_id");

-- CreateIndex
CREATE INDEX "campus_applicants_session_id_idx" ON "campus_applicants"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "campus_applicants_session_id_phone_key" ON "campus_applicants"("session_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "campus_resume_versions_applicant_id_version_key" ON "campus_resume_versions"("applicant_id", "version");

-- CreateIndex
CREATE INDEX "campus_applications_session_job_id_status_idx" ON "campus_applications"("session_job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campus_applications_applicant_id_job_id_key" ON "campus_applications"("applicant_id", "job_id");

-- CreateIndex
CREATE INDEX "campus_match_runs_applicant_id_started_at_idx" ON "campus_match_runs"("applicant_id", "started_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "campus_session_jobs" ADD CONSTRAINT "campus_session_jobs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "campus_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_session_jobs" ADD CONSTRAINT "campus_session_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_applicants" ADD CONSTRAINT "campus_applicants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "campus_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_applicants" ADD CONSTRAINT "campus_applicants_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_resume_versions" ADD CONSTRAINT "campus_resume_versions_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "campus_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_applications" ADD CONSTRAINT "campus_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "campus_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_applications" ADD CONSTRAINT "campus_applications_session_job_id_fkey" FOREIGN KEY ("session_job_id") REFERENCES "campus_session_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_match_runs" ADD CONSTRAINT "campus_match_runs_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "campus_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_match_runs" ADD CONSTRAINT "campus_match_runs_resume_version_id_fkey" FOREIGN KEY ("resume_version_id") REFERENCES "campus_resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
