import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// plan.md §5. Money is bigint raw USDC (6 decimals) in `mode: "bigint"` columns: never number/string.

const money = (name: string) => bigint(name, { mode: "bigint" });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => ts("created_at").notNull().defaultNow();

export const payeeRole = pgEnum("payee_role", ["owner", "cleaner"]);
export const payeeVaultStatus = pgEnum("payee_vault_status", ["pending_signature", "in_delay", "active", "removed"]);
export const channel = pgEnum("channel", ["direct", "airbnb", "booking_com", "other"]);
export const collectionMode = pgEnum("collection_mode", ["onchain", "ota_payout"]);
export const settlementStatus = pgEnum("settlement_status", ["unreconciled", "blocked", "ready", "settling", "settled"]);
export const invoiceType = pgEnum("invoice_type", ["booking", "extension", "penalty", "deposit"]);
export const invoiceStatus = pgEnum("invoice_status", ["open", "pending", "paid", "underpaid", "overpaid", "expired", "refunded", "waived"]);
export const paymentStatus = pgEnum("payment_status", [
  "awaiting_deposit",
  "processing",
  "incomplete_deposit",
  "delivered_unverified",
  "verified",
  "refunded",
  "expired",
  "failed",
]);
export const reconResult = pgEnum("recon_result", ["matched", "mismatch", "open_penalty", "unpaid", "awaiting_payment", "orphan_payment"]);
export const runTrigger = pgEnum("run_trigger", ["cron", "manual"]);
export const runStatus = pgEnum("run_status", ["running", "succeeded", "partial", "failed"]);
export const txStatus = pgEnum("tx_status", ["submitted", "paid", "reverted", "rejected", "failed"]);
export const splitRole = pgEnum("split_role", ["owner", "cleaner", "manager"]);
export const splitStatus = pgEnum("split_status", ["pending", "paid", "retained", "rejected"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(), // stored lower-cased
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  operatorAccount: text("operator_account"),
  vaultAccount: text("vault_account"),
  agentAccount: text("agent_account"),
  createdAt: createdAt(),
});

export const payees = pgTable(
  "payees",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    role: payeeRole("role").notNull(),
    nearAccount: text("near_account").notNull(),
    capRaw: money("cap_raw").notNull(),
    vaultStatus: payeeVaultStatus("vault_status").notNull().default("pending_signature"),
    addedTx: text("added_tx"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payees_user_account_uq").on(t.userId, t.nearAccount)],
);

export const properties = pgTable(
  "properties",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    ownerPayeeId: uuid("owner_payee_id").references(() => payees.id),
    cleanerPayeeId: uuid("cleaner_payee_id").references(() => payees.id),
    cleaningFeeRaw: money("cleaning_fee_raw").notNull().default(sql`0`),
    mgmtFeeBps: integer("mgmt_fee_bps").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("properties_user_name_uq").on(t.userId, t.name), index("properties_user_idx").on(t.userId)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    externalRef: text("external_ref").notNull(),
    channel: channel("channel").notNull(),
    collectionMode: collectionMode("collection_mode").notNull(),
    guestName: text("guest_name").notNull(),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    expectedGrossRaw: money("expected_gross_raw").notNull(),
    otaPayoutRaw: money("ota_payout_raw"),
    cleaningFeeOverrideRaw: money("cleaning_fee_override_raw"),
    settlementStatus: settlementStatus("settlement_status").notNull().default("unreconciled"),
    source: text("source").notNull().default("manual"),
    importedAt: ts("imported_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("bookings_user_channel_ref_uq").on(t.userId, t.channel, t.externalRef),
    index("bookings_user_status_idx").on(t.userId, t.settlementStatus),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    publicId: text("public_id").notNull().unique(), // ≥128-bit random, see lib/ids.ts
    type: invoiceType("type").notNull(),
    amountRaw: money("amount_raw").notNull(),
    status: invoiceStatus("status").notNull().default("open"),
    operatorRevenue: boolean("operator_revenue").notNull().default(false), // penalties: true = operator revenue, false = owner
    dueDate: date("due_date").notNull(),
    createdAt: createdAt(),
    paidAt: ts("paid_at"),
  },
  (t) => [index("invoices_user_idx").on(t.userId), index("invoices_booking_idx").on(t.bookingId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
    depositAddress: text("deposit_address").notNull().unique(),
    depositMemo: text("deposit_memo"),
    originAsset: text("origin_asset").notNull(),
    quoteDeadline: ts("quote_deadline").notNull(),
    amountReceivedRaw: money("amount_received_raw").notNull().default(sql`0`),
    status: paymentStatus("status").notNull().default("awaiting_deposit"),
    originTx: text("origin_tx"),
    destinationTx: text("destination_tx").unique(),
    rawQuoteJson: jsonb("raw_quote_json"), // includes 1Click's signature (keep for disputes)
    rawStatusJson: jsonb("raw_status_json"),
    verifiedAt: ts("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)],
);

export const reconciliation = pgTable(
  "reconciliation",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    result: reconResult("result").notNull(),
    deltaRaw: money("delta_raw").notNull().default(sql`0`),
    note: text("note").notNull().default(""),
    runAt: ts("run_at").notNull().defaultNow(),
  },
  (t) => [index("reconciliation_booking_idx").on(t.bookingId, t.runAt)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    trigger: runTrigger("trigger").notNull(),
    status: runStatus("status").notNull().default("running"),
    plannedTotalRaw: money("planned_total_raw").notNull().default(sql`0`),
    paidTotalRaw: money("paid_total_raw").notNull().default(sql`0`),
    rejectedCount: integer("rejected_count").notNull().default(0),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("agent_runs_user_idx").on(t.userId, t.startedAt)],
);

export const settlementTxs = pgTable(
  "settlement_txs",
  {
    id: id(),
    agentRunId: uuid("agent_run_id").notNull().references(() => agentRuns.id),
    chunkIndex: integer("chunk_index").notNull(),
    txHash: text("tx_hash").unique(),
    status: txStatus("status").notNull().default("submitted"),
    rejectionCode: text("rejection_code"),
    executedAt: ts("executed_at"),
  },
  (t) => [uniqueIndex("settlement_txs_run_chunk_uq").on(t.agentRunId, t.chunkIndex)],
);

export const payoutSplits = pgTable(
  "payout_splits",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    role: splitRole("role").notNull(),
    payeeId: uuid("payee_id").references(() => payees.id),
    amountRaw: money("amount_raw").notNull(),
    vaultKey: text("vault_key").notNull(), // "<booking_id>:<role>"
    settlementTxId: uuid("settlement_tx_id").references(() => settlementTxs.id),
    status: splitStatus("status").notNull().default("pending"),
    reason: text("reason"), // pre-check / rejection reason while pending or rejected
  },
  (t) => [uniqueIndex("payout_splits_booking_role_uq").on(t.bookingId, t.role), uniqueIndex("payout_splits_vault_key_uq").on(t.vaultKey)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metaJson: jsonb("meta_json"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_log_user_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
