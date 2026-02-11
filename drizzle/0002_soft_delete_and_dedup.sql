-- Migration: Add soft delete columns and content hash for deduplication
-- Author: Vera 🖤
-- Date: 2026-02-11

-- Soft delete columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;

-- Content hash for memory deduplication
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "content_hash" TEXT;

-- Index for deduplication lookups
CREATE INDEX IF NOT EXISTS "idx_memories_content_hash"
  ON "memories" ("content_hash")
  WHERE "content_hash" IS NOT NULL;

-- Partial indexes for soft delete (only query non-deleted records)
CREATE INDEX IF NOT EXISTS "idx_users_active"
  ON "users" ("id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_profiles_active"
  ON "profiles" ("user_id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_captures_active"
  ON "captures" ("profile_id", "created_at")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_memories_active"
  ON "memories" ("profile_id", "category")
  WHERE "deleted_at" IS NULL;
