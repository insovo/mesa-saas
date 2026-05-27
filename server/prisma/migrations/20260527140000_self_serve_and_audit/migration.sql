-- 用户权限第二/三阶段:账号自助 + 审计日志 + 停用扩展
BEGIN;

-- users 加停用原因
ALTER TABLE "users"
  ADD COLUMN "deactivated_reason" TEXT,
  ADD COLUMN "deactivated_at" TIMESTAMP(3);

-- 邮箱验证码
CREATE TABLE "email_verification_codes" (
    "id"            UUID NOT NULL,
    "email"         TEXT NOT NULL,
    "user_id"       UUID,
    "purpose"       TEXT NOT NULL,
    "code_hash"     TEXT NOT NULL,
    "expires_at"    TIMESTAMP(3) NOT NULL,
    "consumed_at"   TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "ip"            TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_verification_codes_email_purpose_idx" ON "email_verification_codes"("email", "purpose");
CREATE INDEX "email_verification_codes_user_id_idx" ON "email_verification_codes"("user_id");

-- 审计日志
CREATE TABLE "audit_logs" (
    "id"          UUID NOT NULL,
    "actor_id"    UUID,
    "actor_email" TEXT,
    "action"      TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id"   TEXT,
    "diff"        JSONB NOT NULL DEFAULT '{}'::jsonb,
    "ip"          TEXT,
    "user_agent"  TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

COMMIT;
