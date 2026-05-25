-- CreateTable
CREATE TABLE "upload_share_links" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "default_job_id" UUID,
    "default_source" TEXT,
    "note" TEXT,
    "expires_at" TIMESTAMP(3),
    "max_uploads" INTEGER,
    "upload_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "last_upload_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_share_links_token_key" ON "upload_share_links"("token");

-- CreateIndex
CREATE INDEX "upload_share_links_token_idx" ON "upload_share_links"("token");

-- CreateIndex
CREATE INDEX "upload_share_links_created_by_idx" ON "upload_share_links"("created_by");

-- AddForeignKey
ALTER TABLE "upload_share_links" ADD CONSTRAINT "upload_share_links_default_job_id_fkey" FOREIGN KEY ("default_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
