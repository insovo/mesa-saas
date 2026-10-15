ALTER TABLE "interview_queues" ADD COLUMN "setup" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "interview_queue_entries" ADD COLUMN "station_id" UUID;
CREATE INDEX "interview_queue_entries_queue_id_station_id_stage_idx" ON "interview_queue_entries"("queue_id", "station_id", "stage");
