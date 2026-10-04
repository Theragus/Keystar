ALTER TABLE "mining_activity" ADD COLUMN "solar_system_id" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "mining_activity_window_idx" ON "mining_activity" USING btree ("window_end");