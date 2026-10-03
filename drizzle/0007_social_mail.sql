CREATE TABLE "mail_labels" (
	"character_id" bigint NOT NULL,
	"label_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	CONSTRAINT "mail_labels_character_id_label_id_pk" PRIMARY KEY("character_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "mail_lists" (
	"character_id" bigint NOT NULL,
	"mailing_list_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "mail_lists_character_id_mailing_list_id_pk" PRIMARY KEY("character_id","mailing_list_id")
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"character_id" bigint NOT NULL,
	"mail_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"from_id" bigint NOT NULL,
	"subject" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"labels" bigint[] DEFAULT '{}' NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text,
	"body_fetched_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_messages_character_id_mail_id_pk" PRIMARY KEY("character_id","mail_id")
);
--> statement-breakpoint
ALTER TABLE "mail_labels" ADD CONSTRAINT "mail_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_lists" ADD CONSTRAINT "mail_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_labels_user_idx" ON "mail_labels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mail_lists_user_idx" ON "mail_lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mail_messages_user_sent_idx" ON "mail_messages" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "mail_messages_user_mail_idx" ON "mail_messages" USING btree ("user_id","mail_id");