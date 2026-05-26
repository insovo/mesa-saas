-- AlterTable
ALTER TABLE "share_links" ADD COLUMN     "show_attachments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "show_contact" BOOLEAN NOT NULL DEFAULT true;
