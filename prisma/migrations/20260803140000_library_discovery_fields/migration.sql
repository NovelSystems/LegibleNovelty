-- AlterTable
ALTER TABLE "ContextualizedModule" ADD COLUMN     "context_tag" TEXT,
ADD COLUMN     "download_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passing_completion_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ContextualizedModule_context_tag_idx" ON "ContextualizedModule"("context_tag");

