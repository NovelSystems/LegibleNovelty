-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Community_Member', 'Verified_Educator', 'Moderator', 'System_Admin');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'deactivated', 'purged');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('requested', 'accepted');

-- CreateEnum
CREATE TYPE "ConnectionCreatedVia" AS ENUM ('request', 'invite_link_autoaccept');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('one_time_pass', 'standing_connection');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'denied');

-- CreateEnum
CREATE TYPE "VerificationPath" AS ENUM ('k12_professor', 'license_holder');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "RejectionReasonCode" AS ENUM ('not_in_directory', 'document_illegible', 'document_inconsistent', 'registry_mismatch', 'other');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('bad_peer_token_grant', 've_conduct_review');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('pending', 'confirmed', 'dismissed');

-- CreateEnum
CREATE TYPE "AwardTargetType" AS ENUM ('account', 'seed', 'module');

-- CreateEnum
CREATE TYPE "AccountTokenType" AS ENUM ('email_verification', 'password_reset', 'reclaim');

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropIndex
DROP INDEX "Session_sessionToken_key";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "sessionToken",
DROP COLUMN "userId",
ADD COLUMN     "account_id" TEXT NOT NULL,
ADD COLUMN     "session_token" TEXT NOT NULL;

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "Account" (
    "account_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Community_Member',
    "date_of_birth" TIMESTAMP(3),
    "is_child_subaccount" BOOLEAN NOT NULL DEFAULT false,
    "parent_account_id" TEXT,
    "grade" INTEGER,
    "grade_anchor_date" TIMESTAMP(3),
    "country" TEXT,
    "preferred_display_name" TEXT,
    "legal_name" TEXT NOT NULL,
    "display_name_use_preferred" BOOLEAN NOT NULL DEFAULT false,
    "display_name_hash" TEXT,
    "purged_pseudonymous_identifier" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "email_hash" TEXT,
    "password_hash" TEXT,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'active',
    "deactivated_at" TIMESTAMP(3),
    "purged_at" TIMESTAMP(3),
    "language_preference" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interest_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notification_opt_outs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ve_status" BOOLEAN NOT NULL DEFAULT false,
    "ve_granted_by_account_id" TEXT,
    "ve_token_available" BOOLEAN NOT NULL DEFAULT false,
    "lnc_status" BOOLEAN NOT NULL DEFAULT false,
    "fotl_status" BOOLEAN NOT NULL DEFAULT false,
    "veframework_onboarding_passed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "AccountTokenType" NOT NULL,
    "account_id" TEXT NOT NULL,
    "target_email" TEXT,
    "expires" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetiredDisplayName" (
    "hash" TEXT NOT NULL,
    "retired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetiredDisplayName_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Connection" (
    "connection_id" TEXT NOT NULL,
    "account_a_id" TEXT NOT NULL,
    "account_b_id" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'requested',
    "created_via" "ConnectionCreatedVia" NOT NULL DEFAULT 'request',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable
CREATE TABLE "ParentApproval" (
    "approval_id" TEXT NOT NULL,
    "child_account_id" TEXT NOT NULL,
    "requesting_adult_account_id" TEXT NOT NULL,
    "approval_type" "ApprovalType" NOT NULL,
    "lesson_plan_id" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentApproval_pkey" PRIMARY KEY ("approval_id")
);

-- CreateTable
CREATE TABLE "VerificationApplication" (
    "application_id" TEXT NOT NULL,
    "applicant_account_id" TEXT NOT NULL,
    "path" "VerificationPath" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "reviewer_account_id" TEXT,
    "rejection_reason_code" "RejectionReasonCode",
    "rejection_reason_elaboration" TEXT,
    "submitted_document_ref" TEXT,
    "directory_lookup_confirmed" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "VerificationApplication_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "TokenGrant" (
    "grant_id" TEXT NOT NULL,
    "granting_account_id" TEXT NOT NULL,
    "recipient_account_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshed_at" TIMESTAMP(3),

    CONSTRAINT "TokenGrant_pkey" PRIMARY KEY ("grant_id")
);

-- CreateTable
CREATE TABLE "TokenRequestThread" (
    "thread_id" TEXT NOT NULL,
    "applicant_account_id" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenRequestThread_pkey" PRIMARY KEY ("thread_id")
);

-- CreateTable
CREATE TABLE "AccountFlag" (
    "flag_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "flag_type" "FlagType" NOT NULL,
    "related_token_grant_id" TEXT,
    "status" "FlagStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "AccountFlag_pkey" PRIMARY KEY ("flag_id")
);

-- CreateTable
CREATE TABLE "AwardCategory" (
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attachment_target_type" "AwardTargetType" NOT NULL,
    "eligibility_threshold" INTEGER,
    "is_cyclical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AwardCategory_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "AwardInstance" (
    "instance_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "cycle_label" TEXT,
    "target_id" TEXT NOT NULL,
    "winning_creator_account_id" TEXT,
    "date_granted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwardInstance_pkey" PRIMARY KEY ("instance_id")
);

-- CreateTable
CREATE TABLE "AwardNomination" (
    "nomination_id" TEXT NOT NULL,
    "nominator_account_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "adjudicated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwardNomination_pkey" PRIMARY KEY ("nomination_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE INDEX "Account_email_hash_idx" ON "Account"("email_hash");

-- CreateIndex
CREATE INDEX "Account_display_name_hash_idx" ON "Account"("display_name_hash");

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_token_key" ON "AccountToken"("token");

-- CreateIndex
CREATE INDEX "AccountToken_account_id_idx" ON "AccountToken"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Connection_account_a_id_idx" ON "Connection"("account_a_id");

-- CreateIndex
CREATE INDEX "Connection_account_b_id_idx" ON "Connection"("account_b_id");

-- CreateIndex
CREATE INDEX "ParentApproval_child_account_id_idx" ON "ParentApproval"("child_account_id");

-- CreateIndex
CREATE INDEX "ParentApproval_requesting_adult_account_id_idx" ON "ParentApproval"("requesting_adult_account_id");

-- CreateIndex
CREATE INDEX "VerificationApplication_applicant_account_id_idx" ON "VerificationApplication"("applicant_account_id");

-- CreateIndex
CREATE INDEX "VerificationApplication_status_idx" ON "VerificationApplication"("status");

-- CreateIndex
CREATE INDEX "TokenGrant_granting_account_id_idx" ON "TokenGrant"("granting_account_id");

-- CreateIndex
CREATE INDEX "TokenGrant_recipient_account_id_idx" ON "TokenGrant"("recipient_account_id");

-- CreateIndex
CREATE INDEX "TokenRequestThread_applicant_account_id_idx" ON "TokenRequestThread"("applicant_account_id");

-- CreateIndex
CREATE INDEX "AccountFlag_account_id_idx" ON "AccountFlag"("account_id");

-- CreateIndex
CREATE INDEX "AccountFlag_flag_type_idx" ON "AccountFlag"("flag_type");

-- CreateIndex
CREATE INDEX "AwardInstance_category_id_idx" ON "AwardInstance"("category_id");

-- CreateIndex
CREATE INDEX "AwardNomination_nominator_account_id_idx" ON "AwardNomination"("nominator_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_session_token_key" ON "Session"("session_token");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ve_granted_by_account_id_fkey" FOREIGN KEY ("ve_granted_by_account_id") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_account_a_id_fkey" FOREIGN KEY ("account_a_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_account_b_id_fkey" FOREIGN KEY ("account_b_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentApproval" ADD CONSTRAINT "ParentApproval_child_account_id_fkey" FOREIGN KEY ("child_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentApproval" ADD CONSTRAINT "ParentApproval_requesting_adult_account_id_fkey" FOREIGN KEY ("requesting_adult_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationApplication" ADD CONSTRAINT "VerificationApplication_applicant_account_id_fkey" FOREIGN KEY ("applicant_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationApplication" ADD CONSTRAINT "VerificationApplication_reviewer_account_id_fkey" FOREIGN KEY ("reviewer_account_id") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenGrant" ADD CONSTRAINT "TokenGrant_granting_account_id_fkey" FOREIGN KEY ("granting_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenGrant" ADD CONSTRAINT "TokenGrant_recipient_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenRequestThread" ADD CONSTRAINT "TokenRequestThread_applicant_account_id_fkey" FOREIGN KEY ("applicant_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountFlag" ADD CONSTRAINT "AccountFlag_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountFlag" ADD CONSTRAINT "AccountFlag_related_token_grant_id_fkey" FOREIGN KEY ("related_token_grant_id") REFERENCES "TokenGrant"("grant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountFlag" ADD CONSTRAINT "AccountFlag_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardInstance" ADD CONSTRAINT "AwardInstance_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "AwardCategory"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardInstance" ADD CONSTRAINT "AwardInstance_winning_creator_account_id_fkey" FOREIGN KEY ("winning_creator_account_id") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardNomination" ADD CONSTRAINT "AwardNomination_nominator_account_id_fkey" FOREIGN KEY ("nominator_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

