-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('draft', 'pending_review', 'moderation_hold', 'published');

-- CreateEnum
CREATE TYPE "AiAttestation" AS ENUM ('wholly_human', 'ai_assisted_manual_flair', 'ai_pipeline');

-- CreateEnum
CREATE TYPE "ModuleElementType" AS ENUM ('text', 'image', 'fillable_field');

-- CreateEnum
CREATE TYPE "ModuleDecisionType" AS ENUM ('retain', 'reject');

-- CreateEnum
CREATE TYPE "CitedClause" AS ENUM ('charter', 'functional_test', 'comparison_rule');

-- CreateEnum
CREATE TYPE "ModuleReviewAppealStatus" AS ENUM ('pending', 'resolved');

-- CreateEnum
CREATE TYPE "ModuleReportStatus" AS ENUM ('pending', 'resolved');

-- AlterTable
ALTER TABLE "Taxonomy" ADD COLUMN     "is_political_systems" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ContextualizedModule" (
    "module_id" TEXT NOT NULL,
    "author_account_id" TEXT NOT NULL,
    "primary_seed_id" TEXT NOT NULL,
    "primary_seed_revision_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "publication_date" TIMESTAMP(3),
    "ai_attestation" "AiAttestation",
    "associated_commission_id" TEXT,
    "commission_snapshot_text" TEXT,
    "prepublication_review_report" TEXT,
    "flair_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ModuleStatus" NOT NULL DEFAULT 'draft',
    "takedown_disarmed_version" INTEGER,
    "auto_taken_down" BOOLEAN NOT NULL DEFAULT false,
    "seed_ref_changed" BOOLEAN NOT NULL DEFAULT false,
    "last_edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextualizedModule_pkey" PRIMARY KEY ("module_id")
);

-- CreateTable
CREATE TABLE "ModuleSecondarySeed" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "seed_revision_id" TEXT NOT NULL,

    CONSTRAINT "ModuleSecondarySeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleTemplate" (
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "element_layout" JSONB NOT NULL,

    CONSTRAINT "ModuleTemplate_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "ModulePage" (
    "page_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "page_order" INTEGER NOT NULL,
    "template_id" TEXT,

    CONSTRAINT "ModulePage_pkey" PRIMARY KEY ("page_id")
);

-- CreateTable
CREATE TABLE "ModuleElement" (
    "element_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "element_type" "ModuleElementType" NOT NULL,
    "position_x" DOUBLE PRECISION NOT NULL,
    "position_y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "z_index" INTEGER NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "ModuleElement_pkey" PRIMARY KEY ("element_id")
);

-- CreateTable
CREATE TABLE "ModuleReviewDecision" (
    "decision_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "moderator_account_id" TEXT NOT NULL,
    "decision" "ModuleDecisionType" NOT NULL,
    "cited_clause" "CitedClause",
    "section_reference" TEXT,
    "rationale" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleReviewDecision_pkey" PRIMARY KEY ("decision_id")
);

-- CreateTable
CREATE TABLE "ModuleReviewAppeal" (
    "appeal_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "original_decision_id" TEXT NOT NULL,
    "status" "ModuleReviewAppealStatus" NOT NULL DEFAULT 'pending',
    "panel_reviewer_ids" TEXT[],
    "panel_rationale" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "ModuleReviewAppeal_pkey" PRIMARY KEY ("appeal_id")
);

-- CreateTable
CREATE TABLE "ModuleReport" (
    "report_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "reporter_account_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "module_version" INTEGER NOT NULL,
    "previously_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "status" "ModuleReportStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,

    CONSTRAINT "ModuleReport_pkey" PRIMARY KEY ("report_id")
);

-- CreateIndex
CREATE INDEX "ContextualizedModule_author_account_id_idx" ON "ContextualizedModule"("author_account_id");

-- CreateIndex
CREATE INDEX "ContextualizedModule_primary_seed_id_idx" ON "ContextualizedModule"("primary_seed_id");

-- CreateIndex
CREATE INDEX "ContextualizedModule_status_idx" ON "ContextualizedModule"("status");

-- CreateIndex
CREATE INDEX "ModuleSecondarySeed_module_id_idx" ON "ModuleSecondarySeed"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleSecondarySeed_module_id_seed_revision_id_key" ON "ModuleSecondarySeed"("module_id", "seed_revision_id");

-- CreateIndex
CREATE INDEX "ModulePage_module_id_idx" ON "ModulePage"("module_id");

-- CreateIndex
CREATE INDEX "ModuleElement_page_id_idx" ON "ModuleElement"("page_id");

-- CreateIndex
CREATE INDEX "ModuleReviewDecision_module_id_idx" ON "ModuleReviewDecision"("module_id");

-- CreateIndex
CREATE INDEX "ModuleReviewAppeal_module_id_idx" ON "ModuleReviewAppeal"("module_id");

-- CreateIndex
CREATE INDEX "ModuleReport_module_id_idx" ON "ModuleReport"("module_id");

-- CreateIndex
CREATE INDEX "ModuleReport_reporter_account_id_idx" ON "ModuleReport"("reporter_account_id");

-- CreateIndex
CREATE INDEX "ModuleReport_status_idx" ON "ModuleReport"("status");

-- AddForeignKey
ALTER TABLE "ContextualizedModule" ADD CONSTRAINT "ContextualizedModule_author_account_id_fkey" FOREIGN KEY ("author_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextualizedModule" ADD CONSTRAINT "ContextualizedModule_primary_seed_id_fkey" FOREIGN KEY ("primary_seed_id") REFERENCES "LearningSeed"("seed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextualizedModule" ADD CONSTRAINT "ContextualizedModule_primary_seed_revision_id_fkey" FOREIGN KEY ("primary_seed_revision_id") REFERENCES "SeedRevision"("revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleSecondarySeed" ADD CONSTRAINT "ModuleSecondarySeed_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ContextualizedModule"("module_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleSecondarySeed" ADD CONSTRAINT "ModuleSecondarySeed_seed_revision_id_fkey" FOREIGN KEY ("seed_revision_id") REFERENCES "SeedRevision"("revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModulePage" ADD CONSTRAINT "ModulePage_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ContextualizedModule"("module_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModulePage" ADD CONSTRAINT "ModulePage_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "ModuleTemplate"("template_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleElement" ADD CONSTRAINT "ModuleElement_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "ModulePage"("page_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleReviewDecision" ADD CONSTRAINT "ModuleReviewDecision_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ContextualizedModule"("module_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleReviewDecision" ADD CONSTRAINT "ModuleReviewDecision_moderator_account_id_fkey" FOREIGN KEY ("moderator_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleReviewAppeal" ADD CONSTRAINT "ModuleReviewAppeal_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ContextualizedModule"("module_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleReviewAppeal" ADD CONSTRAINT "ModuleReviewAppeal_original_decision_id_fkey" FOREIGN KEY ("original_decision_id") REFERENCES "ModuleReviewDecision"("decision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleReport" ADD CONSTRAINT "ModuleReport_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ContextualizedModule"("module_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleReport" ADD CONSTRAINT "ModuleReport_reporter_account_id_fkey" FOREIGN KEY ("reporter_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleReport" ADD CONSTRAINT "ModuleReport_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

