-- 两阶段解析改造:把 candidate.skills / experience / education_history 三个字段
-- 从历史的 text[] / jsonb 改成 TEXT(markdown bullet 字符串)。
-- 既存数据保留语义,转换到 markdown 格式。
--
-- 策略:
--   1) 加临时 TEXT 列存转换结果(避免直接 ALTER COLUMN TYPE 用 USING 时 jsonb subquery 受限)
--   2) UPDATE 把老数据按字段语义转 markdown
--   3) DROP 老列 + RENAME 新列接管列名

BEGIN;

-- 1) 临时列
ALTER TABLE "candidates" ADD COLUMN "skills_md" TEXT;
ALTER TABLE "candidates" ADD COLUMN "experience_md" TEXT;
ALTER TABLE "candidates" ADD COLUMN "education_history_md" TEXT;

-- 2) 数据迁移
-- skills (text[] → markdown):「- a\n- b」
UPDATE "candidates"
SET "skills_md" = CASE
  WHEN array_length("skills", 1) > 0
    THEN E'- ' || array_to_string("skills", E'\n- ')
  ELSE NULL
END;

-- experience (jsonb array of {company,title,period,summary} → markdown)
UPDATE "candidates" c
SET "experience_md" = sub.md
FROM (
  SELECT id,
    string_agg(
      '- ' ||
      trim(BOTH ' ' FROM
        COALESCE(elem->>'company', '') || ' ' || COALESCE(elem->>'title', '')
      ) ||
      CASE WHEN COALESCE(elem->>'period','') <> '' THEN ' (' || (elem->>'period') || ')' ELSE '' END ||
      CASE WHEN COALESCE(elem->>'summary','') <> '' THEN ' — ' || (elem->>'summary') ELSE '' END,
      E'\n'
    ) AS md
  FROM "candidates", jsonb_array_elements("experience") AS elem
  WHERE jsonb_typeof("experience") = 'array' AND jsonb_array_length("experience") > 0
  GROUP BY id
) sub
WHERE c.id = sub.id;

-- educationHistory (jsonb array of {school,degree,major,period} → markdown)
UPDATE "candidates" c
SET "education_history_md" = sub.md
FROM (
  SELECT id,
    string_agg(
      '- ' ||
      trim(BOTH ' ' FROM
        COALESCE(elem->>'school', '') || ' ' || COALESCE(elem->>'degree', '') || ' ' || COALESCE(elem->>'major', '')
      ) ||
      CASE WHEN COALESCE(elem->>'period','') <> '' THEN ' (' || (elem->>'period') || ')' ELSE '' END,
      E'\n'
    ) AS md
  FROM "candidates", jsonb_array_elements("education_history") AS elem
  WHERE jsonb_typeof("education_history") = 'array' AND jsonb_array_length("education_history") > 0
  GROUP BY id
) sub
WHERE c.id = sub.id;

-- 3) DROP 老列 + RENAME 新列
ALTER TABLE "candidates" DROP COLUMN "skills";
ALTER TABLE "candidates" DROP COLUMN "experience";
ALTER TABLE "candidates" DROP COLUMN "education_history";

ALTER TABLE "candidates" RENAME COLUMN "skills_md" TO "skills";
ALTER TABLE "candidates" RENAME COLUMN "experience_md" TO "experience";
ALTER TABLE "candidates" RENAME COLUMN "education_history_md" TO "education_history";

COMMIT;
