-- CreateEnum
CREATE TYPE "SeedStatus" AS ENUM ('draft', 'pending_review', 'published');

-- CreateEnum
CREATE TYPE "TaxonomyLevel" AS ENUM ('subject', 'topic');

-- CreateEnum
CREATE TYPE "SeedCommentStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "first_seed_endorsement_received" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Taxonomy" (
    "taxonomy_id" TEXT NOT NULL,
    "level" "TaxonomyLevel" NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deprecated_at" TIMESTAMP(3),
    "proposed_by_account_id" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Taxonomy_pkey" PRIMARY KEY ("taxonomy_id")
);

-- CreateTable
CREATE TABLE "LearningSeed" (
    "seed_id" TEXT NOT NULL,
    "architect_account_id" TEXT NOT NULL,
    "learning_objective" TEXT NOT NULL,
    "entry_prerequisite" TEXT NOT NULL,
    "algorithmic_constraints" JSONB,
    "lesson_size_scope" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "grade_range" TEXT NOT NULL,
    "target_learner_characteristics" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "is_enrichment" BOOLEAN NOT NULL DEFAULT false,
    "associated_commission_id" TEXT,
    "notes" TEXT NOT NULL,
    "status" "SeedStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningSeed_pkey" PRIMARY KEY ("seed_id")
);

-- CreateTable
CREATE TABLE "SeedChain" (
    "chain_edge_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "chain_key" TEXT NOT NULL,
    "from_seed_id" TEXT NOT NULL,
    "to_seed_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedChain_pkey" PRIMARY KEY ("chain_edge_id")
);

-- CreateTable
CREATE TABLE "SeedDraftInvite" (
    "invite_id" TEXT NOT NULL,
    "seed_id" TEXT NOT NULL,
    "invited_account_id" TEXT NOT NULL,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "SeedDraftInvite_pkey" PRIMARY KEY ("invite_id")
);

-- CreateTable
CREATE TABLE "SeedDraftComment" (
    "comment_id" TEXT NOT NULL,
    "seed_id" TEXT NOT NULL,
    "commenter_account_id" TEXT NOT NULL,
    "parent_comment_id" TEXT,
    "body" TEXT NOT NULL,
    "status" "SeedCommentStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "SeedDraftComment_pkey" PRIMARY KEY ("comment_id")
);

-- CreateIndex
CREATE INDEX "Taxonomy_level_idx" ON "Taxonomy"("level");

-- CreateIndex
CREATE INDEX "Taxonomy_parent_id_idx" ON "Taxonomy"("parent_id");

-- CreateIndex
CREATE INDEX "LearningSeed_architect_account_id_idx" ON "LearningSeed"("architect_account_id");

-- CreateIndex
CREATE INDEX "LearningSeed_topic_id_idx" ON "LearningSeed"("topic_id");

-- CreateIndex
CREATE INDEX "LearningSeed_status_idx" ON "LearningSeed"("status");

-- CreateIndex
CREATE INDEX "LearningSeed_architect_account_id_status_published_at_idx" ON "LearningSeed"("architect_account_id", "status", "published_at");

-- CreateIndex
CREATE INDEX "SeedChain_topic_id_idx" ON "SeedChain"("topic_id");

-- CreateIndex
CREATE INDEX "SeedChain_chain_key_idx" ON "SeedChain"("chain_key");

-- CreateIndex
CREATE UNIQUE INDEX "SeedChain_chain_key_from_seed_id_to_seed_id_key" ON "SeedChain"("chain_key", "from_seed_id", "to_seed_id");

-- CreateIndex
CREATE INDEX "SeedDraftInvite_seed_id_idx" ON "SeedDraftInvite"("seed_id");

-- CreateIndex
CREATE INDEX "SeedDraftInvite_invited_account_id_idx" ON "SeedDraftInvite"("invited_account_id");

-- CreateIndex
CREATE INDEX "SeedDraftComment_seed_id_idx" ON "SeedDraftComment"("seed_id");

-- CreateIndex
CREATE INDEX "SeedDraftComment_commenter_account_id_idx" ON "SeedDraftComment"("commenter_account_id");

-- AddForeignKey
ALTER TABLE "Taxonomy" ADD CONSTRAINT "Taxonomy_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Taxonomy"("taxonomy_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taxonomy" ADD CONSTRAINT "Taxonomy_proposed_by_account_id_fkey" FOREIGN KEY ("proposed_by_account_id") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSeed" ADD CONSTRAINT "LearningSeed_architect_account_id_fkey" FOREIGN KEY ("architect_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSeed" ADD CONSTRAINT "LearningSeed_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Taxonomy"("taxonomy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSeed" ADD CONSTRAINT "LearningSeed_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "Taxonomy"("taxonomy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedChain" ADD CONSTRAINT "SeedChain_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "Taxonomy"("taxonomy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedChain" ADD CONSTRAINT "SeedChain_from_seed_id_fkey" FOREIGN KEY ("from_seed_id") REFERENCES "LearningSeed"("seed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedChain" ADD CONSTRAINT "SeedChain_to_seed_id_fkey" FOREIGN KEY ("to_seed_id") REFERENCES "LearningSeed"("seed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedDraftInvite" ADD CONSTRAINT "SeedDraftInvite_seed_id_fkey" FOREIGN KEY ("seed_id") REFERENCES "LearningSeed"("seed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedDraftInvite" ADD CONSTRAINT "SeedDraftInvite_invited_account_id_fkey" FOREIGN KEY ("invited_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedDraftComment" ADD CONSTRAINT "SeedDraftComment_seed_id_fkey" FOREIGN KEY ("seed_id") REFERENCES "LearningSeed"("seed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedDraftComment" ADD CONSTRAINT "SeedDraftComment_commenter_account_id_fkey" FOREIGN KEY ("commenter_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedDraftComment" ADD CONSTRAINT "SeedDraftComment_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "SeedDraftComment"("comment_id") ON DELETE SET NULL ON UPDATE CASCADE;

