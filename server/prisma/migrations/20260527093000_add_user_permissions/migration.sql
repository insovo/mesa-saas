-- 用户权限系统 第一阶段
-- 改动:
-- 1) users 加 is_active
-- 2) share_links 加 allowed_modules + FK(created_by → users.id)+ 索引
-- 3) 新增 user_access_policies / user_department_scopes / user_job_scopes
-- 所有变更包在事务里,失败可回滚。

BEGIN;

-- ============================================================
-- 1. users.is_active (停用账号)
-- ============================================================
ALTER TABLE "users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- 2. share_links.allowed_modules + creator FK
-- ============================================================
ALTER TABLE "share_links"
  ADD COLUMN "allowed_modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "share_links"
  ADD CONSTRAINT "share_links_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "share_links_created_by_idx" ON "share_links"("created_by");

-- ============================================================
-- 3. user_access_policies
-- ============================================================
CREATE TABLE "user_access_policies" (
    "user_id" UUID NOT NULL,
    "page_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "module_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_access_policies_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_access_policies"
  ADD CONSTRAINT "user_access_policies_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 4. user_department_scopes
-- ============================================================
CREATE TABLE "user_department_scopes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "include_children" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_department_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_department_scopes_user_id_department_id_key"
  ON "user_department_scopes"("user_id", "department_id");
CREATE INDEX "user_department_scopes_user_id_idx" ON "user_department_scopes"("user_id");
CREATE INDEX "user_department_scopes_department_id_idx" ON "user_department_scopes"("department_id");

ALTER TABLE "user_department_scopes"
  ADD CONSTRAINT "user_department_scopes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_department_scopes"
  ADD CONSTRAINT "user_department_scopes_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 5. user_job_scopes
-- ============================================================
CREATE TABLE "user_job_scopes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_job_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_job_scopes_user_id_job_id_key"
  ON "user_job_scopes"("user_id", "job_id");
CREATE INDEX "user_job_scopes_user_id_idx" ON "user_job_scopes"("user_id");
CREATE INDEX "user_job_scopes_job_id_idx" ON "user_job_scopes"("job_id");

ALTER TABLE "user_job_scopes"
  ADD CONSTRAINT "user_job_scopes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_job_scopes"
  ADD CONSTRAINT "user_job_scopes_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
