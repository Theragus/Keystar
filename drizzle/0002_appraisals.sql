CREATE TABLE "appraisals" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price_percent" integer DEFAULT 100 NOT NULL,
	"items" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"unparsed" jsonb NOT NULL,
	"input" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "appraisals_created_by_idx" ON "appraisals" USING btree ("created_by","created_at");