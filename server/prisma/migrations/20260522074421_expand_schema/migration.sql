-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('high', 'mid', 'low');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "dept" TEXT,
    "owner" TEXT,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT,
    "location" TEXT,
    "urgency" "Urgency" NOT NULL DEFAULT 'mid',
    "status" TEXT DEFAULT '招聘中',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parent_id" UUID,
    "head" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "open_hc" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "candidate_id" UUID,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "animal" TEXT,
    "avatar" TEXT,
    "education" TEXT,
    "school" TEXT,
    "major" TEXT,
    "age" INTEGER,
    "location" TEXT,
    "years_exp" INTEGER,
    "phone" TEXT,
    "email" TEXT,
    "applied_for" TEXT,
    "job_id" UUID,
    "dept" TEXT,
    "jd_owner" TEXT,
    "level" TEXT,
    "work_location" TEXT,
    "jd_match" INTEGER,
    "stage" TEXT,
    "planned_hire_date" TIMESTAMP(3),
    "actual_hire_date" TIMESTAMP(3),
    "probation_end_date" TIMESTAMP(3),
    "regularize_date" TIMESTAMP(3),
    "regularize_advice" TEXT,
    "hrbp" TEXT,
    "direct_manager" TEXT,
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "probation" JSONB NOT NULL DEFAULT '{}',
    "events" JSONB NOT NULL DEFAULT '[]',
    "risk_items" JSONB NOT NULL DEFAULT '[]',
    "parser" TEXT,
    "parser_confidence" INTEGER,
    "source" TEXT,
    "attachment" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "candidate_id" UUID,
    "candidate_name" TEXT,
    "job_id" UUID,
    "job_title" TEXT,
    "round" TEXT,
    "mode" TEXT,
    "status" TEXT,
    "recommendation" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "interviewer" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_external_id_key" ON "jobs"("external_id");

-- CreateIndex
CREATE INDEX "jobs_dept_idx" ON "jobs"("dept");

-- CreateIndex
CREATE INDEX "jobs_urgency_idx" ON "jobs"("urgency");

-- CreateIndex
CREATE UNIQUE INDEX "departments_external_id_key" ON "departments"("external_id");

-- CreateIndex
CREATE INDEX "departments_parent_id_idx" ON "departments"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_external_id_key" ON "employees"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_candidate_id_key" ON "employees"("candidate_id");

-- CreateIndex
CREATE INDEX "employees_dept_idx" ON "employees"("dept");

-- CreateIndex
CREATE INDEX "employees_stage_idx" ON "employees"("stage");

-- CreateIndex
CREATE INDEX "employees_job_id_idx" ON "employees"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_external_id_key" ON "interviews"("external_id");

-- CreateIndex
CREATE INDEX "interviews_candidate_id_idx" ON "interviews"("candidate_id");

-- CreateIndex
CREATE INDEX "interviews_job_id_idx" ON "interviews"("job_id");

-- CreateIndex
CREATE INDEX "interviews_status_idx" ON "interviews"("status");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
