CREATE TABLE "fleet_members" (
	"fleet_id" bigint NOT NULL,
	"character_id" bigint NOT NULL,
	"join_time" timestamp with time zone NOT NULL,
	"role" text NOT NULL,
	"wing_id" bigint NOT NULL,
	"squad_id" bigint NOT NULL,
	"ship_type_id" integer NOT NULL,
	"solar_system_id" bigint NOT NULL,
	"takes_fleet_warp" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "fleet_members_fleet_id_character_id_pk" PRIMARY KEY("fleet_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "fleet_trackers" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'tracking' NOT NULL,
	"fleet_id" bigint,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fleets" (
	"fleet_id" bigint PRIMARY KEY NOT NULL,
	"boss_character_id" bigint NOT NULL,
	"motd" text DEFAULT '' NOT NULL,
	"is_free_move" boolean DEFAULT false NOT NULL,
	"wings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fleet_trackers" ADD CONSTRAINT "fleet_trackers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fleet_members_character_idx" ON "fleet_members" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "fleets_first_seen_idx" ON "fleets" USING btree ("first_seen_at");