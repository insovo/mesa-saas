-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECRUITER', 'VIEWER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'RECRUITER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "animal" TEXT,
    "avatar" TEXT,
    "education" TEXT,
    "school" TEXT,
    "major" TEXT,
    "age" INTEGER,
    "location" TEXT,
    "years_exp" INTEGER,
    "phone" TEXT,
    "email" TEXT,
    "applied_for" TEXT,
    "jd_match" INTEGER,
    "status" TEXT,
    "source" TEXT,
    "pushed_at" TIMESTAMP(3),
    "parser" TEXT,
    "parser_confidence" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experience" JSONB NOT NULL DEFAULT '[]',
    "education_history" JSONB NOT NULL DEFAULT '[]',
    "attachment" TEXT,
    "owner_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_external_id_key" ON "candidates"("external_id");

-- CreateIndex
CREATE INDEX "candidates_applied_for_idx" ON "candidates"("applied_for");

-- CreateIndex
CREATE INDEX "candidates_status_idx" ON "candidates"("status");

-- CreateIndex
CREATE INDEX "candidates_owner_id_idx" ON "candidates"("owner_id");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
