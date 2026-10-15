CREATE TABLE "interview_queue_suggestions" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "author_role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_queue_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "interview_queue_suggestions_entry_id_created_at_idx" ON "interview_queue_suggestions"("entry_id", "created_at");

ALTER TABLE "interview_queue_suggestions" ADD CONSTRAINT "interview_queue_suggestions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "interview_queue_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
