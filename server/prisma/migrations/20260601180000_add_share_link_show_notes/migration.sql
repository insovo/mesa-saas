-- ShareLink: 公开页是否展示内部备注(默认关;洞察不受此控,始终展示)
ALTER TABLE "share_links" ADD COLUMN "show_notes" BOOLEAN NOT NULL DEFAULT false;
