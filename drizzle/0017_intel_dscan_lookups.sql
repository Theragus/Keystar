CREATE TABLE "intel_dscan_lookups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "intel_dscan_lookups_user_idx" ON "intel_dscan_lookups" USING btree ("user_id","created_at");