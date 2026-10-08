CREATE TABLE "fitting_esi_fittings" (
	"character_id" bigint NOT NULL,
	"fitting_id" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ship_type_id" integer NOT NULL,
	"items" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fitting_esi_fittings_character_id_fitting_id_pk" PRIMARY KEY("character_id","fitting_id")
);
--> statement-breakpoint
CREATE INDEX "fitting_esi_fittings_ship_idx" ON "fitting_esi_fittings" USING btree ("ship_type_id");