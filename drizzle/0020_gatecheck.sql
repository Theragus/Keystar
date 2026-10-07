CREATE TABLE "gatecheck_feed" (
	"id" smallint PRIMARY KEY NOT NULL,
	"coverage_since" timestamp with time zone NOT NULL,
	"caught_up_at" timestamp with time zone,
	"last_killmail_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gatecheck_kills" (
	"killmail_id" bigint PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"killmail_time" timestamp with time zone NOT NULL,
	"solar_system_id" bigint NOT NULL,
	"gate_id" bigint,
	"gate_distance_m" double precision,
	"victim_character_id" bigint,
	"victim_corporation_id" bigint,
	"victim_alliance_id" bigint,
	"victim_ship_type_id" integer NOT NULL,
	"total_value" double precision DEFAULT 0 NOT NULL,
	"attacker_count" smallint NOT NULL,
	"attacker_character_ids" bigint[] NOT NULL,
	"attacker_corporation_ids" bigint[] NOT NULL,
	"attacker_alliance_ids" bigint[] NOT NULL,
	"attacker_ship_type_ids" integer[] NOT NULL,
	"attacker_weapon_type_ids" integer[] NOT NULL,
	"npc" boolean DEFAULT false NOT NULL,
	"concord" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gatecheck_kills_system_time_idx" ON "gatecheck_kills" USING btree ("solar_system_id","killmail_time");--> statement-breakpoint
CREATE INDEX "gatecheck_kills_time_idx" ON "gatecheck_kills" USING btree ("killmail_time");