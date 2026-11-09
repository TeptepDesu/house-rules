ALTER TABLE "payees" ADD COLUMN "statement_token" text;--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_statement_token_unique" UNIQUE("statement_token");