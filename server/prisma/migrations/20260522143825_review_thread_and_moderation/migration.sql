-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "delete_requested" TIMESTAMP(3),
ADD COLUMN     "delete_requested_by" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_id" UUID;

-- CreateIndex
CREATE INDEX "reviews_parent_id_idx" ON "reviews"("parent_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;
