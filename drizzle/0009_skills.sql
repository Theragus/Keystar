CREATE TABLE "skills_character" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"total_sp" bigint,
	"unallocated_sp" bigint,
	"charisma" smallint,
	"intelligence" smallint,
	"memory" smallint,
	"perception" smallint,
	"willpower" smallint,
	"bonus_remaps" smallint,
	"last_remap_date" timestamp with time zone,
	"accrued_remap_cooldown_date" timestamp with time zone,
	"queue_synced_at" timestamp with time zone,
	"skills_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skills_character_skills" (
	"character_id" bigint NOT NULL,
	"skill_id" integer NOT NULL,
	"trained_level" smallint NOT NULL,
	"active_level" smallint NOT NULL,
	"skillpoints" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_character_skills_character_id_skill_id_pk" PRIMARY KEY("character_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "skills_queue" (
	"character_id" bigint NOT NULL,
	"queue_position" smallint NOT NULL,
	"skill_id" integer NOT NULL,
	"finished_level" smallint NOT NULL,
	"start_date" timestamp with time zone,
	"finish_date" timestamp with time zone,
	"training_start_sp" integer,
	"level_start_sp" integer,
	"level_end_sp" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_queue_character_id_queue_position_pk" PRIMARY KEY("character_id","queue_position")
);
--> statement-breakpoint
CREATE TABLE "skills_type_attributes" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"primary_attribute" integer NOT NULL,
	"secondary_attribute" integer NOT NULL,
	"rank" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "skills_character_skills_skill_idx" ON "skills_character_skills" USING btree ("skill_id","trained_level");