-- 第三阶段+:2FA(TOTP) + tokenVersion 强制下线 + PasswordHistory 防重用
BEGIN;

ALTER TABLE "users"
  ADD COLUMN "token_version"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totp_enabled"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "totp_secret"         TEXT,
  ADD COLUMN "totp_enabled_at"     TIMESTAMP(3),
  ADD COLUMN "totp_recovery_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "password_history" (
    "id"            UUID NOT NULL,
    "user_id"       UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "password_history_user_id_created_at_idx"
  ON "password_history"("user_id", "created_at" DESC);

ALTER TABLE "password_history"
  ADD CONSTRAINT "password_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
