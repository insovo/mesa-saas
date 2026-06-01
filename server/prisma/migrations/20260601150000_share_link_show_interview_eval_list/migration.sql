-- ShareLink: 公开页是否展示已有(已提交)面试评价记录(默认关),与「支持填写」分离
ALTER TABLE "share_links" ADD COLUMN "show_interview_eval_list" BOOLEAN NOT NULL DEFAULT false;
