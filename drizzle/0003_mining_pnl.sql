CREATE TABLE "mining_activity" (
	"character_id" bigint NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"date" date NOT NULL,
	"type_id" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"quantity" bigint NOT NULL,
	CONSTRAINT "mining_activity_character_id_window_end_date_type_id_pk" PRIMARY KEY("character_id","window_end","date","type_id")
);
--> statement-breakpoint
CREATE TABLE "mining_activity_coverage" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"last_growth_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mining_pnl_characters" (
	"user_id" uuid NOT NULL,
	"character_id" bigint NOT NULL,
	"auto_include_expenses" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mining_pnl_characters_user_id_character_id_pk" PRIMARY KEY("user_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "mining_pnl_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" bigint,
	"date" date NOT NULL,
	"spread_days" smallint DEFAULT 1 NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mining_pnl_price_rules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type_id" integer NOT NULL,
	"unit_price" double precision NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mining_pnl_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"income_rate_pct" double precision DEFAULT 100 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mining_pnl_tx_overrides" (
	"user_id" uuid NOT NULL,
	"character_id" bigint NOT NULL,
	"transaction_id" bigint NOT NULL,
	"category" text,
	"included" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mining_pnl_tx_overrides_user_id_character_id_transaction_id_pk" PRIMARY KEY("user_id","character_id","transaction_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"character_id" bigint NOT NULL,
	"transaction_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"type_id" integer NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_price" double precision NOT NULL,
	"is_buy" boolean NOT NULL,
	"client_id" bigint NOT NULL,
	"location_id" bigint NOT NULL,
	"journal_ref_id" bigint NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transactions_character_id_transaction_id_pk" PRIMARY KEY("character_id","transaction_id")
);
--> statement-breakpoint
ALTER TABLE "mining_pnl_characters" ADD CONSTRAINT "mining_pnl_characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_pnl_entries" ADD CONSTRAINT "mining_pnl_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_pnl_price_rules" ADD CONSTRAINT "mining_pnl_price_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_pnl_settings" ADD CONSTRAINT "mining_pnl_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_pnl_tx_overrides" ADD CONSTRAINT "mining_pnl_tx_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mining_activity_char_date_idx" ON "mining_activity" USING btree ("character_id","date");--> statement-breakpoint
CREATE INDEX "mining_pnl_entries_user_date_idx" ON "mining_pnl_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "mining_pnl_price_rules_user_idx" ON "mining_pnl_price_rules" USING btree ("user_id","type_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_user_date_idx" ON "wallet_transactions" USING btree ("user_id","date");