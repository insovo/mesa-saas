ALTER TABLE "jobs"
  ADD COLUMN "campus_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "campus_kind" TEXT NOT NULL DEFAULT 'onsite',
  ADD COLUMN "campus_match_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "campus_sort_order" INTEGER NOT NULL DEFAULT 0;

-- 旧的已移除岗位保留为可恢复项，不重新发布给学生。
UPDATE jobs j SET campus_active = EXISTS (SELECT 1 FROM campus_session_jobs sj WHERE sj.job_id = j.id)
WHERE j.recruitment_type = 'campus';

-- 当前上线专场的配置优先；没有上线配置时保留最早的岗位配置。
WITH canonical AS (
  SELECT DISTINCT ON (sj.job_id) sj.job_id, sj.kind, sj.match_enabled, sj.sort_order
  FROM campus_session_jobs sj JOIN campus_sessions s ON s.id = sj.session_id
  ORDER BY sj.job_id, (s.status = 'live') DESC, sj.created_at, sj.id
), catalog AS (
  SELECT j.id, COALESCE(c.kind, 'onsite') AS kind, COALESCE(c.match_enabled, true) AS match_enabled,
    (ROW_NUMBER() OVER (ORDER BY COALESCE(c.sort_order, 2147483647), j.created_at, j.id) - 1)::INTEGER AS sort_order
  FROM jobs j LEFT JOIN canonical c ON c.job_id = j.id WHERE j.recruitment_type = 'campus'
)
UPDATE jobs j SET campus_kind = c.kind, campus_match_enabled = c.match_enabled, campus_sort_order = c.sort_order
FROM catalog c WHERE j.id = c.id;

UPDATE campus_session_jobs sj SET kind = j.campus_kind, match_enabled = j.campus_match_enabled, sort_order = j.campus_sort_order
FROM jobs j WHERE sj.job_id = j.id AND j.recruitment_type = 'campus';

INSERT INTO campus_session_jobs (id, session_id, job_id, kind, match_enabled, sort_order, created_at)
SELECT gen_random_uuid(), s.id, j.id, j.campus_kind, j.campus_match_enabled, j.campus_sort_order, CURRENT_TIMESTAMP
FROM campus_sessions s CROSS JOIN jobs j WHERE j.recruitment_type = 'campus' AND j.campus_active
ON CONFLICT (session_id, job_id) DO NOTHING;
