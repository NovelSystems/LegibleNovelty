-- CreateEnum
CREATE TYPE "LessonPlanReportStatus" AS ENUM ('pending', 'resolved');

-- CreateTable
CREATE TABLE "LessonPlan" (
    "lesson_plan_id" TEXT NOT NULL,
    "creator_account_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("lesson_plan_id")
);

-- CreateTable
CREATE TABLE "LessonPlanModule" (
    "id" TEXT NOT NULL,
    "lesson_plan_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "LessonPlanModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlanAssignment" (
    "assignment_id" TEXT NOT NULL,
    "lesson_plan_id" TEXT NOT NULL,
    "assigner_account_id" TEXT NOT NULL,
    "assigned_learner_ids" TEXT[],
    "date_range_start" TIMESTAMP(3) NOT NULL,
    "date_range_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlanAssignment_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "LessonPlanReport" (
    "report_id" TEXT NOT NULL,
    "lesson_plan_id" TEXT NOT NULL,
    "reporter_account_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LessonPlanReportStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,

    CONSTRAINT "LessonPlanReport_pkey" PRIMARY KEY ("report_id")
);

-- CreateIndex
CREATE INDEX "LessonPlan_creator_account_id_idx" ON "LessonPlan"("creator_account_id");

-- CreateIndex
CREATE INDEX "LessonPlan_is_public_idx" ON "LessonPlan"("is_public");

-- CreateIndex
CREATE INDEX "LessonPlanModule_lesson_plan_id_idx" ON "LessonPlanModule"("lesson_plan_id");

-- CreateIndex
CREATE INDEX "LessonPlanModule_module_id_idx" ON "LessonPlanModule"("module_id");

-- CreateIndex
CREATE INDEX "LessonPlanAssignment_lesson_plan_id_idx" ON "LessonPlanAssignment"("lesson_plan_id");

-- CreateIndex
CREATE INDEX "LessonPlanAssignment_assigner_account_id_idx" ON "LessonPlanAssignment"("assigner_account_id");

-- CreateIndex
CREATE INDEX "LessonPlanReport_lesson_plan_id_idx" ON "LessonPlanReport"("lesson_plan_id");

-- CreateIndex
CREATE INDEX "LessonPlanReport_reporter_account_id_idx" ON "LessonPlanReport"("reporter_account_id");

-- CreateIndex
CREATE INDEX "LessonPlanReport_status_idx" ON "LessonPlanReport"("status");

-- CreateIndex
CREATE INDEX "ParentApproval_lesson_plan_id_idx" ON "ParentApproval"("lesson_plan_id");

-- AddForeignKey
ALTER TABLE "ParentApproval" ADD CONSTRAINT "ParentApproval_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "LessonPlan"("lesson_plan_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_creator_account_id_fkey" FOREIGN KEY ("creator_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanModule" ADD CONSTRAINT "LessonPlanModule_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "LessonPlan"("lesson_plan_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanModule" ADD CONSTRAINT "LessonPlanModule_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ContextualizedModule"("module_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanAssignment" ADD CONSTRAINT "LessonPlanAssignment_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "LessonPlan"("lesson_plan_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanAssignment" ADD CONSTRAINT "LessonPlanAssignment_assigner_account_id_fkey" FOREIGN KEY ("assigner_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanReport" ADD CONSTRAINT "LessonPlanReport_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "LessonPlan"("lesson_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanReport" ADD CONSTRAINT "LessonPlanReport_reporter_account_id_fkey" FOREIGN KEY ("reporter_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanReport" ADD CONSTRAINT "LessonPlanReport_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;
