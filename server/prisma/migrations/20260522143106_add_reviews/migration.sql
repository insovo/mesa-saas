-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "job_title" TEXT;

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_role" TEXT,
    "author_avatar" TEXT,
    "user_id" UUID,
    "via" TEXT NOT NULL DEFAULT 'internal',
    "share_token" TEXT,
    "content" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_candidate_id_idx" ON "reviews"("candidate_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
