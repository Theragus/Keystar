CREATE TABLE "corp_wallet_balance_history" (
	"corporation_id" bigint NOT NULL,
	"division" smallint NOT NULL,
	"date" date NOT NULL,
	"balance" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corp_wallet_balance_history_corporation_id_division_date_pk" PRIMARY KEY("corporation_id","division","date")
);
--> statement-breakpoint
CREATE TABLE "corp_wallet_divisions" (
	"corporation_id" bigint NOT NULL,
	"division" smallint NOT NULL,
	"name" text,
	"balance" double precision,
	"balance_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corp_wallet_divisions_corporation_id_division_pk" PRIMARY KEY("corporation_id","division")
);
--> statement-breakpoint
CREATE TABLE "corp_wallet_journal" (
	"corporation_id" bigint NOT NULL,
	"division" smallint NOT NULL,
	"id" bigint NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ref_type" text NOT NULL,
	"amount" double precision,
	"balance" double precision,
	"first_party_id" bigint,
	"second_party_id" bigint,
	"context_id" bigint,
	"context_id_type" text,
	"reason" text,
	"description" text NOT NULL,
	"tax" double precision,
	"tax_receiver_id" bigint,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corp_wallet_journal_corporation_id_division_id_pk" PRIMARY KEY("corporation_id","division","id")
);
--> statement-breakpoint
CREATE TABLE "corp_wallet_sync_state" (
	"corporation_id" bigint NOT NULL,
	"division" smallint NOT NULL,
	"stream" text NOT NULL,
	"history_starts_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "corp_wallet_sync_state_corporation_id_division_stream_pk" PRIMARY KEY("corporation_id","division","stream")
);
--> statement-breakpoint
CREATE TABLE "corp_wallet_transactions" (
	"corporation_id" bigint NOT NULL,
	"division" smallint NOT NULL,
	"transaction_id" bigint NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"type_id" integer NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_price" double precision NOT NULL,
	"is_buy" boolean NOT NULL,
	"client_id" bigint NOT NULL,
	"location_id" bigint NOT NULL,
	"journal_ref_id" bigint NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corp_wallet_transactions_corporation_id_division_transaction_id_pk" PRIMARY KEY("corporation_id","division","transaction_id")
);
--> statement-breakpoint
CREATE INDEX "corp_wallet_journal_corp_date_idx" ON "corp_wallet_journal" USING btree ("corporation_id","date");--> statement-breakpoint
CREATE INDEX "corp_wallet_journal_corp_ref_date_idx" ON "corp_wallet_journal" USING btree ("corporation_id","ref_type","date");--> statement-breakpoint
CREATE INDEX "corp_wallet_transactions_corp_date_idx" ON "corp_wallet_transactions" USING btree ("corporation_id","date");