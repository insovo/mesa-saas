-- ShareLink: 公开页「填写面试评价」入口开关(默认开)
ALTER TABLE "share_links" ADD COLUMN "show_interview_eval" BOOLEAN NOT NULL DEFAULT true;
