-- CreateTable
CREATE TABLE "SeedRevision" (
    "revision_id" TEXT NOT NULL,
    "seed_id" TEXT NOT NULL,
    "editor_account_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "made_as_moderator" BOOLEAN NOT NULL,
    "edit_summary" TEXT,
    "learning_objective" TEXT NOT NULL,
    "entry_prerequisite" TEXT NOT NULL,
    "algorithmic_constraints" JSONB,
    "lesson_size_scope" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "grade_range" TEXT NOT NULL,
    "target_learner_characteristics" TEXT,
    "language" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "is_enrichment" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedRevision_pkey" PRIMARY KEY ("revision_id")
);

-- CreateIndex
CREATE INDEX "SeedRevision_seed_id_idx" ON "SeedRevision"("seed_id");

-- CreateIndex
CREATE INDEX "SeedRevision_editor_account_id_idx" ON "SeedRevision"("editor_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "SeedRevision_seed_id_revision_number_key" ON "SeedRevision"("seed_id", "revision_number");

-- AddForeignKey
ALTER TABLE "SeedRevision" ADD CONSTRAINT "SeedRevision_seed_id_fkey" FOREIGN KEY ("seed_id") REFERENCES "LearningSeed"("seed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedRevision" ADD CONSTRAINT "SeedRevision_editor_account_id_fkey" FOREIGN KEY ("editor_account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

