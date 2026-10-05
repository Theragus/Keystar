CREATE TABLE "industry_jobs" (
	"job_id" bigint PRIMARY KEY NOT NULL,
	"character_id" bigint NOT NULL,
	"installer_id" bigint NOT NULL,
	"location_id" bigint NOT NULL,
	"facility_id" bigint NOT NULL,
	"station_id" bigint,
	"activity_id" integer NOT NULL,
	"activity" text NOT NULL,
	"blueprint_id" bigint NOT NULL,
	"blueprint_type_id" integer NOT NULL,
	"blueprint_location_id" bigint NOT NULL,
	"output_location_id" bigint NOT NULL,
	"product_type_id" integer,
	"runs" integer NOT NULL,
	"licensed_runs" integer,
	"successful_runs" integer,
	"probability" double precision,
	"cost" double precision DEFAULT 0 NOT NULL,
	"duration" integer NOT NULL,
	"status" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"pause_date" timestamp with time zone,
	"completed_date" timestamp with time zone,
	"completed_character_id" bigint,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_locations" (
	"location_id" bigint PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"solar_system_id" bigint,
	"type_id" integer,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "industry_jobs_character_idx" ON "industry_jobs" USING btree ("character_id","status");--> statement-breakpoint
CREATE INDEX "industry_jobs_location_idx" ON "industry_jobs" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "industry_jobs_end_idx" ON "industry_jobs" USING btree ("end_date");