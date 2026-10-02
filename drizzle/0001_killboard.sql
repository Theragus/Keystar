CREATE TABLE "killboard_reports" (
	"corporation_id" bigint NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"content" jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "killboard_reports_corporation_id_period_from_period_to_pk" PRIMARY KEY("corporation_id","period_from","period_to")
);
--> statement-breakpoint
CREATE TABLE "killmail_attackers" (
	"killmail_id" bigint NOT NULL,
	"idx" smallint NOT NULL,
	"character_id" bigint,
	"corporation_id" bigint,
	"alliance_id" bigint,
	"faction_id" bigint,
	"ship_type_id" integer,
	"weapon_type_id" integer,
	"damage_done" integer DEFAULT 0 NOT NULL,
	"final_blow" boolean DEFAULT false NOT NULL,
	CONSTRAINT "killmail_attackers_killmail_id_idx_pk" PRIMARY KEY("killmail_id","idx")
);
--> statement-breakpoint
CREATE TABLE "killmails" (
	"killmail_id" bigint PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"killmail_time" timestamp with time zone NOT NULL,
	"solar_system_id" bigint NOT NULL,
	"victim_character_id" bigint,
	"victim_corporation_id" bigint,
	"victim_alliance_id" bigint,
	"victim_ship_type_id" integer NOT NULL,
	"damage_taken" integer DEFAULT 0 NOT NULL,
	"attacker_count" integer NOT NULL,
	"total_value" double precision DEFAULT 0 NOT NULL,
	"fitted_value" double precision DEFAULT 0 NOT NULL,
	"destroyed_value" double precision DEFAULT 0 NOT NULL,
	"dropped_value" double precision DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"npc" boolean DEFAULT false NOT NULL,
	"solo" boolean DEFAULT false NOT NULL,
	"awox" boolean DEFAULT false NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "killmail_attackers_corp_idx" ON "killmail_attackers" USING btree ("corporation_id","killmail_id");--> statement-breakpoint
CREATE INDEX "killmail_attackers_char_idx" ON "killmail_attackers" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "killmails_time_idx" ON "killmails" USING btree ("killmail_time");--> statement-breakpoint
CREATE INDEX "killmails_victim_corp_idx" ON "killmails" USING btree ("victim_corporation_id","killmail_time");