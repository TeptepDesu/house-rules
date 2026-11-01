CREATE TABLE "vault_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event" text NOT NULL,
	"data_json" jsonb NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_events" ADD CONSTRAINT "vault_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vault_events_tx_seq_uq" ON "vault_events" USING btree ("tx_hash","seq");--> statement-breakpoint
CREATE INDEX "vault_events_user_idx" ON "vault_events" USING btree ("user_id","created_at");