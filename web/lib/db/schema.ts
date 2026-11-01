import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// plan.md §5. Only the tables Day 1 needs; the rest arrive with their features.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // stored lower-cased
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  operatorAccount: text("operator_account"),
  vaultAccount: text("vault_account"),
  agentAccount: text("agent_account"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metaJson: jsonb("meta_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_log_user_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
