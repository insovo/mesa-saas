-- 候选人「正在解析」状态:非空且距今 <10min 即视为解析中(应用层判定),解析完成/失败置 NULL。
-- 让所有读 candidate 的页面(列表/详情/概览)从同一权威字段统一显示「解析中」。
ALTER TABLE "candidates" ADD COLUMN "parsing_started_at" TIMESTAMP(3);
