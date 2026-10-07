CREATE TABLE "market_orders" (
	"order_id" bigint PRIMARY KEY NOT NULL,
	"character_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"region_id" integer NOT NULL,
	"location_id" bigint NOT NULL,
	"is_buy_order" boolean NOT NULL,
	"is_corporation" boolean NOT NULL,
	"price" double precision NOT NULL,
	"volume_total" bigint NOT NULL,
	"volume_remain" bigint NOT NULL,
	"min_volume" bigint,
	"escrow" double precision,
	"range" text NOT NULL,
	"duration" integer NOT NULL,
	"issued" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"closed_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "market_orders_character_idx" ON "market_orders" USING btree ("character_id","state");--> statement-breakpoint
CREATE INDEX "market_orders_location_idx" ON "market_orders" USING btree ("location_id");