-- ShareLink: 公开页是否允许查看原始简历文件(默认开)
ALTER TABLE "share_links" ADD COLUMN "show_resume" BOOLEAN NOT NULL DEFAULT true;
