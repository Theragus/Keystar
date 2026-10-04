CREATE TABLE "mining_op_participants" (
	"op_id" text NOT NULL,
	"character_id" bigint NOT NULL,
	"mode" text NOT NULL,
	"self" boolean DEFAULT false NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"set_by_name" text,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mining_op_participants_op_id_character_id_pk" PRIMARY KEY("op_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "mining_op_share_types" (
	"op_id" text NOT NULL,
	"character_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"quantity" double precision NOT NULL,
	"unit_volume" double precision NOT NULL,
	"unit_price" double precision NOT NULL,
	CONSTRAINT "mining_op_share_types_op_id_character_id_type_id_pk" PRIMARY KEY("op_id","character_id","type_id")
);
--> statement-breakpoint
CREATE TABLE "mining_op_shares" (
	"op_id" text NOT NULL,
	"payee_character_id" bigint NOT NULL,
	"user_id" uuid,
	"character_ids" bigint[] NOT NULL,
	"volume" double precision NOT NULL,
	"gross_value" double precision NOT NULL,
	"share_value" double precision NOT NULL,
	CONSTRAINT "mining_op_shares_op_id_payee_character_id_pk" PRIMARY KEY("op_id","payee_character_id")
);
--> statement-breakpoint
CREATE TABLE "mining_ops" (
	"id" text PRIMARY KEY NOT NULL,
	"corporation_id" bigint NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"solar_system_ids" bigint[] DEFAULT '{}' NOT NULL,
	"ore_classes" text[] DEFAULT '{}' NOT NULL,
	"participation" text DEFAULT 'anyone' NOT NULL,
	"fleet_id" bigint,
	"calendar_event_id" bigint,
	"valuation_source" text NOT NULL,
	"rate_pct" double precision DEFAULT 100 NOT NULL,
	"corp_cut_pct" double precision DEFAULT 0 NOT NULL,
	"split_mode" text DEFAULT 'contribution' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_name" text
);
--> statement-breakpoint
CREATE TABLE "calendar_event_attendees" (
	"event_id" bigint NOT NULL,
	"character_id" bigint NOT NULL,
	"response" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_attendees_event_id_character_id_pk" PRIMARY KEY("event_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"event_id" bigint PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" bigint NOT NULL,
	"owner_name" text NOT NULL,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"importance" integer DEFAULT 0 NOT NULL,
	"seen_by_character_id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mining_op_participants" ADD CONSTRAINT "mining_op_participants_op_id_mining_ops_id_fk" FOREIGN KEY ("op_id") REFERENCES "public"."mining_ops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_op_share_types" ADD CONSTRAINT "mining_op_share_types_op_id_mining_ops_id_fk" FOREIGN KEY ("op_id") REFERENCES "public"."mining_ops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_op_shares" ADD CONSTRAINT "mining_op_shares_op_id_mining_ops_id_fk" FOREIGN KEY ("op_id") REFERENCES "public"."mining_ops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_event_id_calendar_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mining_ops_corp_start_idx" ON "mining_ops" USING btree ("corporation_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_events_date_idx" ON "calendar_events" USING btree ("event_date");