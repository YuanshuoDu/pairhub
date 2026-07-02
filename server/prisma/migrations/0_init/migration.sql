-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED', 'DELETED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('STUDY', 'SPORTS', 'BOARD_GAME', 'ONLINE_GAME', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING_REVIEW', 'RECRUITING', 'FULL', 'STARTED', 'ENDED', 'CANCELED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentCheckStatus" AS ENUM ('PENDING', 'PASS', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SignupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "push_channel" AS ENUM ('wechat_template', 'tpns', 'fcm', 'apns');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "unionid" TEXT,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "school" TEXT,
    "major" TEXT,
    "grade" TEXT,
    "wechat_id" TEXT,
    "phone" TEXT,
    "bio" VARCHAR(500),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "cover_url" TEXT,
    "location_name" TEXT NOT NULL,
    "location_addr" TEXT NOT NULL,
    "location_lat" DECIMAL(10,7) NOT NULL,
    "location_lng" DECIMAL(10,7) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "max_participants" INTEGER NOT NULL DEFAULT 10,
    "current_count" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[],
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "moderation_note" VARCHAR(500),
    "content_check" "ContentCheckStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signups" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "SignupStatus" NOT NULL DEFAULT 'APPROVED',
    "message" VARCHAR(200),
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceled_at" TIMESTAMP(3),

    CONSTRAINT "signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "push_channel" NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "device_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "users_unionid_key" ON "users"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_school_grade_idx" ON "users"("school", "grade");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "activities_status_start_time_idx" ON "activities"("status", "start_time");

-- CreateIndex
CREATE INDEX "activities_type_status_start_time_idx" ON "activities"("type", "status", "start_time");

-- CreateIndex
CREATE INDEX "activities_location_lat_location_lng_idx" ON "activities"("location_lat", "location_lng");

-- CreateIndex
CREATE INDEX "activities_creator_id_status_idx" ON "activities"("creator_id", "status");

-- CreateIndex
CREATE INDEX "signups_user_id_status_idx" ON "signups"("user_id", "status");

-- CreateIndex
CREATE INDEX "signups_activity_id_status_idx" ON "signups"("activity_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "signups_activity_id_user_id_key" ON "signups"("activity_id", "user_id");

-- CreateIndex
CREATE INDEX "reviews_to_user_id_idx" ON "reviews"("to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_activity_id_from_user_id_to_user_id_key" ON "reviews"("activity_id", "from_user_id", "to_user_id");

-- CreateIndex
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

-- CreateIndex
CREATE INDEX "push_tokens_channel_last_seen_at_idx" ON "push_tokens"("channel", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_user_id_channel_token_key" ON "push_tokens"("user_id", "channel", "token");

-- CreateIndex
CREATE INDEX "user_reports_status_created_at_idx" ON "user_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "user_reports_target_type_target_id_idx" ON "user_reports"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signups" ADD CONSTRAINT "signups_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signups" ADD CONSTRAINT "signups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? Update available 5.22.0 -> 7.8.0                       鈹?鈹?                                                        鈹?鈹? This is a major update - please follow the guide at    鈹?鈹? https://pris.ly/d/major-version-upgrade                鈹?鈹?                                                        鈹?鈹? Run the following to update                            鈹?鈹?   npm i --save-dev prisma@latest                       鈹?鈹?   npm i @prisma/client@latest                          鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
