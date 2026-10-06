CREATE TABLE "skills_implant_attributes" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"charisma" smallint DEFAULT 0 NOT NULL,
	"intelligence" smallint DEFAULT 0 NOT NULL,
	"memory" smallint DEFAULT 0 NOT NULL,
	"perception" smallint DEFAULT 0 NOT NULL,
	"willpower" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills_implants" (
	"character_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_implants_character_id_type_id_pk" PRIMARY KEY("character_id","type_id")
);
--> statement-breakpoint
ALTER TABLE "skills_character" ADD COLUMN "implants_synced_at" timestamp with time zone;