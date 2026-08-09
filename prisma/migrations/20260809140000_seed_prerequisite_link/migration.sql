-- Seed Editor: structured curriculum-sequencing link. A nullable, self-
-- referential FK naming the specific prior seed that covers this seed's
-- immediately-preceding topic. ON DELETE SET NULL (Prisma's default for an
-- optional relation) so soft/hard removal of a prerequisite never orphans rows.
ALTER TABLE "LearningSeed" ADD COLUMN "prerequisite_seed_id" TEXT;

-- Reverse-direction lookup ("what comes next" — deferred) needs this index.
CREATE INDEX "LearningSeed_prerequisite_seed_id_idx" ON "LearningSeed"("prerequisite_seed_id");

ALTER TABLE "LearningSeed" ADD CONSTRAINT "LearningSeed_prerequisite_seed_id_fkey"
  FOREIGN KEY ("prerequisite_seed_id") REFERENCES "LearningSeed"("seed_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
