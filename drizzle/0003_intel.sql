CREATE TABLE "eve_constellations" (
	"constellation_id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region_id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_ai_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"scan_id" text,
	"character_id" bigint,
	"facts_hash" text NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"error" text,
	"content" jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"usage" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_contacts" (
	"owner_type" text NOT NULL,
	"owner_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"contact_type" text NOT NULL,
	"standing" double precision NOT NULL,
	"label_ids" bigint[] DEFAULT '{}' NOT NULL,
	"is_watched" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_contacts_owner_type_owner_id_contact_id_pk" PRIMARY KEY("owner_type","owner_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "intel_pilot_killmails" (
	"character_id" bigint NOT NULL,
	"killmail_id" bigint NOT NULL,
	"killmail_time" timestamp with time zone NOT NULL,
	"solar_system_id" bigint NOT NULL,
	"location_id" bigint,
	"is_loss" boolean NOT NULL,
	"ship_type_id" integer,
	"weapon_type_id" integer,
	"final_blow" boolean DEFAULT false NOT NULL,
	"damage_done" integer DEFAULT 0 NOT NULL,
	"attacker_count" integer NOT NULL,
	"total_value" double precision DEFAULT 0 NOT NULL,
	"solo" boolean DEFAULT false NOT NULL,
	"npc" boolean DEFAULT false NOT NULL,
	"awox" boolean DEFAULT false NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"other_character_id" bigint,
	"other_corporation_id" bigint,
	"other_alliance_id" bigint,
	"other_ship_type_id" integer,
	"ally_ids" bigint[] DEFAULT '{}' NOT NULL,
	"fitted_type_ids" integer[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "intel_pilot_killmails_character_id_killmail_id_pk" PRIMARY KEY("character_id","killmail_id")
);
--> statement-breakpoint
CREATE TABLE "intel_pilots" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"corporation_id" bigint,
	"alliance_id" bigint,
	"faction_id" bigint,
	"affiliation_at" timestamp with time zone,
	"birthday" timestamp with time zone,
	"security_status" double precision,
	"corp_history" jsonb,
	"corp_history_at" timestamp with time zone,
	"stats" jsonb,
	"stats_status" text,
	"stats_at" timestamp with time zone,
	"stats_error" text,
	"deep_status" text DEFAULT 'none' NOT NULL,
	"deep_at" timestamp with time zone,
	"deep_pages" smallint DEFAULT 0 NOT NULL,
	"deep_reached_at" timestamp with time zone,
	"newest_killmail_id" bigint,
	"profile" jsonb,
	"profile_version" smallint,
	"profile_at" timestamp with time zone,
	"last_requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_queue" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"stage" smallint DEFAULT 1 NOT NULL,
	"page" smallint DEFAULT 1 NOT NULL,
	"priority" real DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "intel_scan_pilots" (
	"scan_id" text NOT NULL,
	"character_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"corporation_id" bigint,
	"alliance_id" bigint,
	"faction_id" bigint,
	"profiled" boolean DEFAULT false NOT NULL,
	"history" jsonb,
	"score" smallint,
	"tier" text,
	"score_detail" jsonb,
	"scored_at" timestamp with time zone,
	CONSTRAINT "intel_scan_pilots_scan_id_character_id_pk" PRIMARY KEY("scan_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "intel_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"names" text[] NOT NULL,
	"unresolved" text[] DEFAULT '{}' NOT NULL,
	"skipped" text[] DEFAULT '{}' NOT NULL,
	"dscan" jsonb,
	"system_id" bigint,
	"status" text DEFAULT 'running' NOT NULL,
	"ready_at" timestamp with time zone,
	"pilot_count" integer DEFAULT 0 NOT NULL,
	"ai_allowed" boolean DEFAULT false NOT NULL,
	"briefing_status" text DEFAULT 'pending' NOT NULL,
	"rescan_of" text
);
--> statement-breakpoint
ALTER TABLE "intel_ai_notes" ADD CONSTRAINT "intel_ai_notes_scan_id_intel_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."intel_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_scan_pilots" ADD CONSTRAINT "intel_scan_pilots_scan_id_intel_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."intel_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intel_ai_notes_scan_idx" ON "intel_ai_notes" USING btree ("scan_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "intel_ai_notes_character_idx" ON "intel_ai_notes" USING btree ("character_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "intel_ai_notes_user_idx" ON "intel_ai_notes" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "intel_ai_notes_source_idx" ON "intel_ai_notes" USING btree ("source","created_at");--> statement-breakpoint
CREATE INDEX "intel_contacts_contact_idx" ON "intel_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "intel_pilot_killmails_time_idx" ON "intel_pilot_killmails" USING btree ("character_id","killmail_time");--> statement-breakpoint
CREATE INDEX "intel_pilot_killmails_prune_idx" ON "intel_pilot_killmails" USING btree ("killmail_time");--> statement-breakpoint
CREATE INDEX "intel_pilots_requested_idx" ON "intel_pilots" USING btree ("last_requested_at");--> statement-breakpoint
CREATE INDEX "intel_queue_order_idx" ON "intel_queue" USING btree ("stage","priority","requested_at");--> statement-breakpoint
CREATE INDEX "intel_scan_pilots_character_idx" ON "intel_scan_pilots" USING btree ("character_id","scan_id");--> statement-breakpoint
CREATE INDEX "intel_scans_created_idx" ON "intel_scans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "intel_scans_created_by_idx" ON "intel_scans" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "intel_scans_status_idx" ON "intel_scans" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "killmails_victim_char_idx" ON "killmails" USING btree ("victim_character_id","killmail_time");