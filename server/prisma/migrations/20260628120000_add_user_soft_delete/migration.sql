-- Soft-delete support for User.
--
-- Why this migration:
--   The v1.0.1 API spec lists `DELETE /api/v1/users/me` as a 软删除 (soft
--   delete) endpoint. We model soft-delete via two coordinated fields
--   rather than one so analytics can compute retention curves and audit
--   logs can show the exact deletion timestamp:
--     * `users.status` is extended with `DELETED`. Existing ACTIVE/BANNED
--       values are unchanged; only the enum grows.
--     * `users.deleted_at` is the wall-clock time the user requested
--       deletion. Nullable; backfills to NULL for every existing row.
--   A covering index on `deleted_at` lets the dashboard filter
--   "active vs. churned" users without a full scan.
--
-- Why `ALTER TYPE ... ADD VALUE` here:
--   PostgreSQL 12+ allows adding an enum value in the same transaction
--   as long as the new value isn't referenced elsewhere in that tx. We
--   are running PG 16 in dev/staging/prod (docker-compose.yml), so this
--   is safe.

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
