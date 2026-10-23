ALTER TABLE "salary_submissions"
  ADD COLUMN "message_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "identity_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "duplicate_state" TEXT NOT NULL DEFAULT 'unresolved',
  ADD COLUMN "superseded_by_id" UUID;
UPDATE "salary_submissions" SET "message_created_at" = "created_at";
CREATE INDEX "salary_submissions_group_id_superseded_by_id_idx" ON "salary_submissions"("group_id", "superseded_by_id");
CREATE INDEX "salary_submissions_identity_keys_idx" ON "salary_submissions" USING GIN ("identity_keys");
