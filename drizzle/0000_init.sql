CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_corp_roles" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"corporation_id" bigint NOT NULL,
	"alliance_id" bigint,
	"owner_hash" text NOT NULL,
	"affiliation_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corporation_members" (
	"corporation_id" bigint NOT NULL,
	"character_id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corporation_members_corporation_id_character_id_pk" PRIMARY KEY("corporation_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "esi_tokens" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"main_character_id" bigint,
	"role" text DEFAULT 'guest' NOT NULL,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esi_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"etag" text,
	"body" jsonb,
	"pages" integer,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_corporations" (
	"corporation_id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"alliance_id" bigint,
	"member_count" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_entities" (
	"id" bigint PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_groups" (
	"group_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_systems" (
	"system_id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"security_status" double precision NOT NULL,
	"constellation_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_types" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group_id" integer NOT NULL,
	"volume" double precision,
	"packaged_volume" double precision,
	"portion_size" integer,
	"market_group_id" integer,
	"published" boolean DEFAULT true NOT NULL,
	"compressed_type_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_prices" (
	"type_id" integer NOT NULL,
	"source" text NOT NULL,
	"price" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_prices_type_id_source_pk" PRIMARY KEY("type_id","source")
);
--> statement-breakpoint
CREATE TABLE "type_value_history" (
	"type_id" integer NOT NULL,
	"source" text NOT NULL,
	"date" date NOT NULL,
	"unit_price" double precision NOT NULL,
	CONSTRAINT "type_value_history_type_id_source_date_pk" PRIMARY KEY("type_id","source","date")
);
--> statement-breakpoint
CREATE TABLE "type_values" (
	"type_id" integer NOT NULL,
	"source" text NOT NULL,
	"unit_price" double precision NOT NULL,
	"basis" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "type_values_type_id_source_pk" PRIMARY KEY("type_id","source")
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_key" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" bigint NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_summary" text,
	"last_duration_ms" integer,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"locked_by" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_beat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" text,
	"info" jsonb
);
--> statement-breakpoint
CREATE TABLE "mining_character_ledger" (
	"character_id" bigint NOT NULL,
	"date" date NOT NULL,
	"solar_system_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"quantity" bigint NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mining_character_ledger_character_id_date_solar_system_id_type_id_pk" PRIMARY KEY("character_id","date","solar_system_id","type_id")
);
--> statement-breakpoint
CREATE TABLE "mining_observer_ledger" (
	"observer_id" bigint NOT NULL,
	"corporation_id" bigint NOT NULL,
	"character_id" bigint NOT NULL,
	"recorded_corporation_id" bigint NOT NULL,
	"date" date NOT NULL,
	"type_id" integer NOT NULL,
	"quantity" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mining_observer_ledger_observer_id_character_id_date_type_id_pk" PRIMARY KEY("observer_id","character_id","date","type_id")
);
--> statement-breakpoint
CREATE TABLE "mining_observers" (
	"observer_id" bigint PRIMARY KEY NOT NULL,
	"corporation_id" bigint NOT NULL,
	"observer_type" text NOT NULL,
	"last_updated" date,
	"name" text,
	"solar_system_id" bigint,
	"structure_type_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_corp_roles" ADD CONSTRAINT "character_corp_roles_character_id_characters_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esi_tokens" ADD CONSTRAINT "esi_tokens_character_id_characters_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "characters_user_idx" ON "characters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "characters_corp_idx" ON "characters" USING btree ("corporation_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "esi_cache_expires_idx" ON "esi_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "eve_types_group_idx" ON "eve_types" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_jobs_unique" ON "sync_jobs" USING btree ("job_key","owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_due_idx" ON "sync_jobs" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "mining_char_ledger_date_idx" ON "mining_character_ledger" USING btree ("date");--> statement-breakpoint
CREATE INDEX "mining_obs_ledger_date_idx" ON "mining_observer_ledger" USING btree ("date");--> statement-breakpoint
CREATE INDEX "mining_obs_ledger_char_idx" ON "mining_observer_ledger" USING btree ("character_id");