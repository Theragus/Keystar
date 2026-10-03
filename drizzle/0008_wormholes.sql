CREATE TABLE "wh_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"map_id" integer NOT NULL,
	"a_system_id" bigint NOT NULL,
	"b_system_id" bigint NOT NULL,
	"type_code" text,
	"type_side" text,
	"life_state" text DEFAULT 'fresh' NOT NULL,
	"life_set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mass_state" text DEFAULT 'stable' NOT NULL,
	"size_override" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_by" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"updated_by_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	CONSTRAINT "wh_connections_ordered" CHECK ("wh_connections"."a_system_id" < "wh_connections"."b_system_id")
);
--> statement-breakpoint
CREATE TABLE "wh_map_systems" (
	"map_id" integer NOT NULL,
	"system_id" bigint NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"label" text,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wh_map_systems_map_id_system_id_pk" PRIMARY KEY("map_id","system_id")
);
--> statement-breakpoint
CREATE TABLE "wh_maps" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"home_system_id" bigint,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wh_maps_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "wh_connections" ADD CONSTRAINT "wh_connections_map_id_wh_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."wh_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_connections" ADD CONSTRAINT "wh_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_connections" ADD CONSTRAINT "wh_connections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_map_systems" ADD CONSTRAINT "wh_map_systems_map_id_wh_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."wh_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_map_systems" ADD CONSTRAINT "wh_map_systems_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wh_connections_active_pair_idx" ON "wh_connections" USING btree ("map_id","a_system_id","b_system_id") WHERE "wh_connections"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "wh_connections_expires_idx" ON "wh_connections" USING btree ("expires_by") WHERE "wh_connections"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "wh_connections_removed_idx" ON "wh_connections" USING btree ("removed_at");