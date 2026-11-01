DROP INDEX "vault_events_tx_seq_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "vault_events_user_tx_seq_uq" ON "vault_events" USING btree ("user_id","tx_hash","seq");