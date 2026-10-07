CREATE TABLE "gatecheck_wars" (
	"war_id" bigint PRIMARY KEY NOT NULL,
	"aggressor_id" bigint,
	"defender_id" bigint,
	"ally_ids" bigint[] DEFAULT '{}' NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gatecheck_kills" ADD COLUMN "war_id" bigint;--> statement-breakpoint
CREATE INDEX "gatecheck_kills_war_idx" ON "gatecheck_kills" USING btree ("war_id") WHERE "gatecheck_kills"."war_id" IS NOT NULL;