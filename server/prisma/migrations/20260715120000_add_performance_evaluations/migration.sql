-- CreateTable
CREATE TABLE "performance_evaluations" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "candidate_id" UUID,
    "self_token" TEXT NOT NULL,
    "manager_token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "expires_at" TIMESTAMP(3),
    "employee_name" TEXT NOT NULL,
    "employee_no" TEXT,
    "position" TEXT,
    "department" TEXT,
    "level" TEXT,
    "line_manager" TEXT,
    "review_period" TEXT NOT NULL,
    "eval_date" TIMESTAMP(3),
    "scores" JSONB NOT NULL DEFAULT '[]',
    "achievements" TEXT,
    "development_plan" TEXT,
    "next_goals" TEXT,
    "self_total" DOUBLE PRECISION,
    "manager_total" DOUBLE PRECISION,
    "rating" TEXT,
    "pip_triggered" BOOLEAN,
    "self_submitted_at" TIMESTAMP(3),
    "manager_submitted_at" TIMESTAMP(3),
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

    CONSTRAINT "performance_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "performance_evaluations_self_token_key" ON "performance_evaluations"("self_token");

-- CreateIndex
CREATE UNIQUE INDEX "performance_evaluations_manager_token_key" ON "performance_evaluations"("manager_token");

-- CreateIndex
CREATE INDEX "performance_evaluations_employee_id_idx" ON "performance_evaluations"("employee_id");

-- CreateIndex
CREATE INDEX "performance_evaluations_candidate_id_idx" ON "performance_evaluations"("candidate_id");

-- CreateIndex
CREATE INDEX "performance_evaluations_self_token_idx" ON "performance_evaluations"("self_token");

-- CreateIndex
CREATE INDEX "performance_evaluations_manager_token_idx" ON "performance_evaluations"("manager_token");

-- CreateIndex
CREATE INDEX "performance_evaluations_created_by_idx" ON "performance_evaluations"("created_by");

-- CreateIndex
CREATE INDEX "performance_evaluations_status_idx" ON "performance_evaluations"("status");

-- AddForeignKey
ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
