-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "department_id" UUID;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
