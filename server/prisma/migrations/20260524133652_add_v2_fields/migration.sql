-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "against_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ai_suggested_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "documents" JSONB NOT NULL DEFAULT '{"resume":[],"materials":[],"portfolio":[]}',
ADD COLUMN     "insights" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "languages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "matched_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "profile_completion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "category" TEXT,
ADD COLUMN     "interviewers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "link" TEXT,
ADD COLUMN     "managers" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "education_requirement" TEXT,
ADD COLUMN     "employment" TEXT,
ADD COLUMN     "language_requirement" TEXT,
ADD COLUMN     "level_range" TEXT,
ADD COLUMN     "nice" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "salary" TEXT,
ADD COLUMN     "years_exp_range" TEXT;
