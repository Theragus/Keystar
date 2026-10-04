CREATE TABLE "mining_pnl_fee_overrides" (
	"user_id" uuid NOT NULL,
	"character_id" bigint NOT NULL,
	"journal_id" bigint NOT NULL,
	"included" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mining_pnl_fee_overrides_user_id_character_id_journal_id_pk" PRIMARY KEY("user_id","character_id","journal_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_fees" (
	"character_id" bigint NOT NULL,
	"journal_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ref_type" text NOT NULL,
	"amount" double precision NOT NULL,
	"context_id" bigint,
	"context_id_type" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_fees_character_id_journal_id_pk" PRIMARY KEY("character_id","journal_id")
);
--> statement-breakpoint
ALTER TABLE "mining_pnl_fee_overrides" ADD CONSTRAINT "mining_pnl_fee_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_fees" ADD CONSTRAINT "wallet_fees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_fees_user_date_idx" ON "wallet_fees" USING btree ("user_id","date");