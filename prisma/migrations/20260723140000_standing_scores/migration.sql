-- CreateEnum
CREATE TYPE "StandingScoreType" AS ENUM ('ESS', 'DSS', 'CSS');

-- CreateEnum
CREATE TYPE "SeedReportStatus" AS ENUM ('pending', 'resolved');

-- CreateTable
CREATE TABLE "StandingScore" (
    "standing_score_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "score_type" "StandingScoreType" NOT NULL,
    "current_value" DECIMAL(6,2) NOT NULL,
    "locked_at" TIMESTAMP(3),
    "last_drift_computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingScore_pkey" PRIMARY KEY ("standing_score_id")
);

-- CreateTable
CREATE TABLE "StandingScoreEvent" (
    "event_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "score_type" "StandingScoreType" NOT NULL,
    "point_delta" DECIMAL(6,2) NOT NULL,
    "event_type" TEXT NOT NULL,
    "moderator_account_id" TEXT,
    "explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingScoreEvent_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "SeedReport" (
    "report_id" TEXT NOT NULL,
    "seed_id" TEXT NOT NULL,
    "reporter_account_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SeedReportStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,

    CONSTRAINT "SeedReport_pkey" PRIMARY KEY ("report_id")
);

-- CreateIndex
CREATE INDEX "StandingScore_account_id_idx" ON "StandingScore"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "StandingScore_account_id_score_type_key" ON "StandingScore"("account_id", "score_type");

-- CreateIndex
CREATE INDEX "StandingScoreEvent_account_id_idx" ON "StandingScoreEvent"("account_id");

-- CreateIndex
CREATE INDEX "StandingScoreEvent_score_type_idx" ON "StandingScoreEvent"("score_type");

-- CreateIndex
CREATE INDEX "SeedReport_seed_id_idx" ON "SeedReport"("seed_id");

-- CreateIndex
CREATE INDEX "SeedReport_reporter_account_id_idx" ON "SeedReport"("reporter_account_id");

-- CreateIndex
CREATE INDEX "SeedReport_status_idx" ON "SeedReport"("status");

-- AddForeignKey
ALTER TABLE "StandingScore" ADD CONSTRAINT "StandingScore_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingScoreEvent" ADD CONSTRAINT "StandingScoreEvent_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingScoreEvent" ADD CONSTRAINT "StandingScoreEvent_moderator_account_id_fkey" FOREIGN KEY ("moderator_account_id") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedReport" ADD CONSTRAINT "SeedReport_seed_id_fkey" FOREIGN KEY ("seed_id") REFERENCES "LearningSeed"("seed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedReport" ADD CONSTRAINT "SeedReport_reporter_account_id_fkey" FOREIGN KEY ("reporter_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedReport" ADD CONSTRAINT "SeedReport_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

