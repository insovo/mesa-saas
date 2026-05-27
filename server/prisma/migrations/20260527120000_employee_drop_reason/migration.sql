-- 二期-4 流失原因 schema 字段(/api/reports/offer-cycle 接入真实数据)
ALTER TABLE "employees" ADD COLUMN "drop_reason" VARCHAR;
ALTER TABLE "employees" ADD COLUMN "drop_reason_detail" TEXT;

-- 索引(可选,本字段查询频次低,先不加)
