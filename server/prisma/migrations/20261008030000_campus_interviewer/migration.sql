ALTER TYPE "Role" ADD VALUE 'CAMPUS_INTERVIEWER';
ALTER TABLE "users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
