-- 校招学生免登录(2026-10-08):匿名建档时 phone 为空;(session_id, phone) 由唯一键改为普通索引(换设备 / 清缓存可能同手机多条,台账提示重复)。
ALTER TABLE "campus_applicants" ALTER COLUMN "phone" DROP NOT NULL;
DROP INDEX "campus_applicants_session_id_phone_key";
CREATE INDEX "campus_applicants_session_id_phone_idx" ON "campus_applicants"("session_id", "phone");
