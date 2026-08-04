-- AlterTable
ALTER TABLE "ContextualizedModule" ADD COLUMN     "ess_first_endorser_rewarded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Endorsement" (
    "endorsement_id" TEXT NOT NULL,
    "seed_id" TEXT NOT NULL,
    "endorser_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Endorsement_pkey" PRIMARY KEY ("endorsement_id")
);

-- CreateTable
CREATE TABLE "CommunityRecommendation" (
    "recommendation_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "recommender_account_id" TEXT NOT NULL,
    "module_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityRecommendation_pkey" PRIMARY KEY ("recommendation_id")
);

-- CreateIndex
CREATE INDEX "Endorsement_seed_id_idx" ON "Endorsement"("seed_id");

-- CreateIndex
CREATE INDEX "Endorsement_endorser_account_id_idx" ON "Endorsement"("endorser_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Endorsement_seed_id_endorser_account_id_key" ON "Endorsement"("seed_id", "endorser_account_id");

-- CreateIndex
CREATE INDEX "CommunityRecommendation_module_id_idx" ON "CommunityRecommendation"("module_id");

-- CreateIndex
CREATE INDEX "CommunityRecommendation_recommender_account_id_idx" ON "CommunityRecommendation"("recommender_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityRecommendation_module_id_recommender_account_id_key" ON "CommunityRecommendation"("module_id", "recommender_account_id");

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_seed_id_fkey" FOREIGN KEY ("seed_id") REFERENCES "LearningSeed"("seed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_endorser_account_id_fkey" FOREIGN KEY ("endorser_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityRecommendation" ADD CONSTRAINT "CommunityRecommendation_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ContextualizedModule"("module_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityRecommendation" ADD CONSTRAINT "CommunityRecommendation_recommender_account_id_fkey" FOREIGN KEY ("recommender_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

