-- CreateTable
CREATE TABLE "interview_queues" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_queue_entries" (
    "id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "major" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "grad_year" INTEGER NOT NULL DEFAULT 2027,
    "language_ability" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "job_direction" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'professional',
    "professional_result" TEXT,
    "culture_result" TEXT,
    "salary_status" TEXT,
    "salary_base" DECIMAL(12,2) NOT NULL DEFAULT 8700,
    "salary_factor" DECIMAL(6,2) NOT NULL DEFAULT 13.5,
    "professional_started_at" TIMESTAMP(3),
    "culture_started_at" TIMESTAMP(3),
    "culture_group_id" UUID,
    "phase_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_queue_links" (
    "id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "require_key" BOOLEAN NOT NULL DEFAULT false,
    "key_hash" TEXT,
    "key_enc" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_queue_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_queues_session_id_key" ON "interview_queues"("session_id");

-- CreateIndex
CREATE INDEX "interview_queue_entries_queue_id_stage_phase_entered_at_idx" ON "interview_queue_entries"("queue_id", "stage", "phase_entered_at");

-- CreateIndex
CREATE INDEX "interview_queue_entries_email_idx" ON "interview_queue_entries"("email");

-- CreateIndex
CREATE UNIQUE INDEX "interview_queue_entries_queue_id_email_key" ON "interview_queue_entries"("queue_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "interview_queue_links_token_key" ON "interview_queue_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "interview_queue_links_queue_id_kind_key" ON "interview_queue_links"("queue_id", "kind");

-- AddForeignKey
ALTER TABLE "interview_queues" ADD CONSTRAINT "interview_queues_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "campus_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_queue_entries" ADD CONSTRAINT "interview_queue_entries_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "interview_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_queue_links" ADD CONSTRAINT "interview_queue_links_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "interview_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

