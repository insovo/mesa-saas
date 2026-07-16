-- 绩效评价签字 + 管理员 HR 电子章
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "hr_signature_key" TEXT,
  ADD COLUMN IF NOT EXISTS "hr_signature_updated_at" TIMESTAMP(3);

ALTER TABLE "performance_evaluations"
  ADD COLUMN IF NOT EXISTS "self_signature_key" TEXT,
  ADD COLUMN IF NOT EXISTS "self_signed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "manager_signature_key" TEXT,
  ADD COLUMN IF NOT EXISTS "manager_signed_at" TIMESTAMP(3);
