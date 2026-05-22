-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "referenced_ids" JSONB NOT NULL DEFAULT '[]';
