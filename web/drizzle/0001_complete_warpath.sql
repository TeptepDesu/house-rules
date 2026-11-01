CREATE TYPE "public"."channel" AS ENUM('direct', 'airbnb', 'booking_com', 'other');--> statement-breakpoint
CREATE TYPE "public"."collection_mode" AS ENUM('onchain', 'ota_payout');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('open', 'pending', 'paid', 'underpaid', 'overpaid', 'expired', 'refunded', 'waived');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('booking', 'extension', 'penalty', 'deposit');--> statement-breakpoint
CREATE TYPE "public"."payee_role" AS ENUM('owner', 'cleaner');--> statement-breakpoint
CREATE TYPE "public"."payee_vault_status" AS ENUM('pending_signature', 'in_delay', 'active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('awaiting_deposit', 'processing', 'incomplete_deposit', 'delivered_unverified', 'verified', 'refunded', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recon_result" AS ENUM('matched', 'mismatch', 'open_penalty', 'unpaid', 'awaiting_payment', 'orphan_payment');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('cron', 'manual');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('unreconciled', 'blocked', 'ready', 'settling', 'settled');--> statement-breakpoint
CREATE TYPE "public"."split_role" AS ENUM('owner', 'cleaner', 'manager');--> statement-breakpoint
CREATE TYPE "public"."split_status" AS ENUM('pending', 'paid', 'retained', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('submitted', 'paid', 'reverted', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"planned_total_raw" bigint DEFAULT 0 NOT NULL,
	"paid_total_raw" bigint DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"channel" "channel" NOT NULL,
	"collection_mode" "collection_mode" NOT NULL,
	"guest_name" text NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"expected_gross_raw" bigint NOT NULL,
	"ota_payout_raw" bigint,
	"cleaning_fee_override_raw" bigint,
	"settlement_status" "settlement_status" DEFAULT 'unreconciled' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"booking_id" uuid,
	"public_id" text NOT NULL,
	"type" "invoice_type" NOT NULL,
	"amount_raw" bigint NOT NULL,
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	"operator_revenue" boolean DEFAULT false NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "invoices_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "payee_role" NOT NULL,
	"near_account" text NOT NULL,
	"cap_raw" bigint NOT NULL,
	"vault_status" "payee_vault_status" DEFAULT 'pending_signature' NOT NULL,
	"added_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"deposit_address" text NOT NULL,
	"deposit_memo" text,
	"origin_asset" text NOT NULL,
	"quote_deadline" timestamp with time zone NOT NULL,
	"amount_received_raw" bigint DEFAULT 0 NOT NULL,
	"status" "payment_status" DEFAULT 'awaiting_deposit' NOT NULL,
	"origin_tx" text,
	"destination_tx" text,
	"raw_quote_json" jsonb,
	"raw_status_json" jsonb,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_deposit_address_unique" UNIQUE("deposit_address"),
	CONSTRAINT "payments_destination_tx_unique" UNIQUE("destination_tx")
);
--> statement-breakpoint
CREATE TABLE "payout_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"role" "split_role" NOT NULL,
	"payee_id" uuid,
	"amount_raw" bigint NOT NULL,
	"vault_key" text NOT NULL,
	"settlement_tx_id" uuid,
	"status" "split_status" DEFAULT 'pending' NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_payee_id" uuid,
	"cleaner_payee_id" uuid,
	"cleaning_fee_raw" bigint DEFAULT 0 NOT NULL,
	"mgmt_fee_bps" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"result" "recon_result" NOT NULL,
	"delta_raw" bigint DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_txs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"tx_hash" text,
	"status" "tx_status" DEFAULT 'submitted' NOT NULL,
	"rejection_code" text,
	"executed_at" timestamp with time zone,
	CONSTRAINT "settlement_txs_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_splits" ADD CONSTRAINT "payout_splits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_splits" ADD CONSTRAINT "payout_splits_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_splits" ADD CONSTRAINT "payout_splits_settlement_tx_id_settlement_txs_id_fk" FOREIGN KEY ("settlement_tx_id") REFERENCES "public"."settlement_txs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_payee_id_payees_id_fk" FOREIGN KEY ("owner_payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_cleaner_payee_id_payees_id_fk" FOREIGN KEY ("cleaner_payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_txs" ADD CONSTRAINT "settlement_txs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_user_idx" ON "agent_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_user_channel_ref_uq" ON "bookings" USING btree ("user_id","channel","external_ref");--> statement-breakpoint
CREATE INDEX "bookings_user_status_idx" ON "bookings" USING btree ("user_id","settlement_status");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_booking_idx" ON "invoices" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payees_user_account_uq" ON "payees" USING btree ("user_id","near_account");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_splits_booking_role_uq" ON "payout_splits" USING btree ("booking_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_splits_vault_key_uq" ON "payout_splits" USING btree ("vault_key");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_user_name_uq" ON "properties" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "properties_user_idx" ON "properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reconciliation_booking_idx" ON "reconciliation" USING btree ("booking_id","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_txs_run_chunk_uq" ON "settlement_txs" USING btree ("agent_run_id","chunk_index");