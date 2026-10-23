CREATE TABLE "salary_groups" (
  "id" UUID NOT NULL, "tenant_key" TEXT NOT NULL, "chat_id" TEXT NOT NULL,
  "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false, "owner_id" UUID NOT NULL,
  "member_user_ids" UUID[] DEFAULT ARRAY[]::UUID[], "operators" JSONB NOT NULL DEFAULT '{}',
  "context" JSONB NOT NULL DEFAULT '{}', "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "salary_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "salary_groups_tenant_key_chat_id_key" ON "salary_groups"("tenant_key", "chat_id");
CREATE TABLE "salary_schools" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "definition" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1, "updated_by" UUID NOT NULL, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "salary_schools_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "salary_schools_name_key" ON "salary_schools"("name");
CREATE TABLE "salary_submissions" (
  "id" UUID NOT NULL, "group_id" UUID NOT NULL, "message_id" TEXT NOT NULL, "sender_open_id" TEXT,
  "filename" TEXT NOT NULL, "content_type" TEXT NOT NULL, "file_key" TEXT NOT NULL,
  "file_hash" TEXT NOT NULL, "file_size" INTEGER NOT NULL, "facts" JSONB,
  "overrides" JSONB NOT NULL DEFAULT '{}', "context" JSONB NOT NULL DEFAULT '{}',
  "revision" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'accepted', "latest_evaluation_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "salary_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "salary_submissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "salary_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "salary_submissions_group_id_message_id_key" ON "salary_submissions"("group_id", "message_id");
CREATE INDEX "salary_submissions_group_id_created_at_idx" ON "salary_submissions"("group_id", "created_at");
CREATE TABLE "salary_evaluations" (
  "id" UUID NOT NULL, "submission_id" UUID NOT NULL, "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued', "input" JSONB NOT NULL, "result" JSONB, "semantic" JSONB,
  "error" TEXT, "requested_by" TEXT, "reason" TEXT, "delivery_status" TEXT NOT NULL DEFAULT 'pending',
  "delivery_message_id" TEXT, "delivery_attempts" INTEGER NOT NULL DEFAULT 0, "delivery_next_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finished_at" TIMESTAMP(3),
  CONSTRAINT "salary_evaluations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "salary_evaluations_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "salary_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "salary_evaluations_submission_id_revision_key" ON "salary_evaluations"("submission_id", "revision");
CREATE INDEX "salary_evaluations_status_created_at_idx" ON "salary_evaluations"("status", "created_at");
CREATE INDEX "salary_evaluations_delivery_status_delivery_next_at_idx" ON "salary_evaluations"("delivery_status", "delivery_next_at");
