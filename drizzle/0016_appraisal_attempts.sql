CREATE TABLE "appraisal_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "appraisal_attempts_user_idx" ON "appraisal_attempts" USING btree ("user_id","created_at");