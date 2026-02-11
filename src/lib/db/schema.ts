import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

// ─── Users ───────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull().unique(),
    email: text("email").notNull(),
    captureEmail: text("capture_email").unique(),
    tier: text("tier", { enum: ["free", "pro", "founders"] })
      .notNull()
      .default("free"),
    onboardingCompleted: boolean("onboarding_completed")
      .notNull()
      .default(false),
    tokenBudget: integer("token_budget").notNull().default(8000),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_users_clerk_id").on(table.clerkId),
    uniqueIndex("idx_users_capture_email")
      .on(table.captureEmail)
      .where(sql`${table.captureEmail} IS NOT NULL`),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  profiles: many(profiles),
  apiTokens: many(apiTokens),
}));

// ─── Profiles ────────────────────────────────────────────

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: text("platform"),
    isDefault: boolean("is_default").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_profiles_user_id").on(table.userId)]
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
  captures: many(captures),
  memories: many(memories),
}));

// ─── Captures ────────────────────────────────────────────

export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    method: text("method", {
      enum: ["paste", "screenshot", "email", "api"],
    }).notNull(),
    status: text("status", {
      enum: ["queued", "processing", "completed", "failed"],
    })
      .notNull()
      .default("queued"),
    errorMessage: text("error_message"),
    rawText: text("raw_text"),
    imageUrls: jsonb("image_urls").$type<string[]>(),
    platform: text("platform"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_captures_status")
      .on(table.status)
      .where(sql`${table.status} IN ('queued', 'processing')`),
    index("idx_captures_profile").on(table.profileId, table.createdAt),
  ]
);

export const capturesRelations = relations(captures, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [captures.profileId],
    references: [profiles.id],
  }),
  memories: many(memories),
}));

// ─── Memories ────────────────────────────────────────────

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    captureId: uuid("capture_id").references(() => captures.id, {
      onDelete: "set null",
    }),
    category: text("category", {
      enum: ["emotional", "work", "hobbies", "relationships", "preferences"],
    }).notNull(),
    factualContent: text("factual_content").notNull(),
    emotionalSignificance: text("emotional_significance"),
    verbatimText: text("verbatim_text").notNull(),
    summaryText: text("summary_text"),
    useVerbatim: boolean("use_verbatim").notNull().default(true),
    importance: integer("importance").notNull(),
    verbatimTokens: integer("verbatim_tokens").notNull(),
    summaryTokens: integer("summary_tokens"),
    contentHash: text("content_hash"),
    speakerConfidence: real("speaker_confidence"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_memories_profile_category").on(
      table.profileId,
      table.category
    ),
    index("idx_memories_profile_created").on(table.profileId, table.createdAt),
    index("idx_memories_profile_importance").on(
      table.profileId,
      table.importance
    ),
    index("idx_memories_capture").on(table.captureId),
    index("idx_memories_content_hash")
      .on(table.contentHash)
      .where(sql`${table.contentHash} IS NOT NULL`),
    check("importance_range", sql`${table.importance} >= 1 AND ${table.importance} <= 5`),
  ]
);

export const memoriesRelations = relations(memories, ({ one }) => ({
  profile: one(profiles, {
    fields: [memories.profileId],
    references: [profiles.id],
  }),
  capture: one(captures, {
    fields: [memories.captureId],
    references: [captures.id],
  }),
}));

// ─── API Tokens ──────────────────────────────────────────

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`ARRAY['read', 'write', 'wake']`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_api_tokens_hash").on(table.tokenHash),
    index("idx_api_tokens_user").on(table.userId),
  ]
);

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, {
    fields: [apiTokens.userId],
    references: [users.id],
  }),
}));

// ─── Type Exports ────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Capture = typeof captures.$inferSelect;
export type NewCapture = typeof captures.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

export type MemoryCategory =
  | "emotional"
  | "work"
  | "hobbies"
  | "relationships"
  | "preferences";

export type CaptureStatus = "queued" | "processing" | "completed" | "failed";
export type CaptureMethod = "paste" | "screenshot" | "email" | "api";
export type UserTier = "free" | "pro" | "founders";
