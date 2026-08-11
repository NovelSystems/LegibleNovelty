-- Complete the SeedRevision content snapshot so a cited revision reproduces the
-- full LearningSeed as it was, not just the fields that existed when the snapshot
-- logic was first written. Additive columns + foreign keys only.

-- New frozen content columns (all nullable, mirroring LearningSeed).
ALTER TABLE "SeedRevision"
  ADD COLUMN "title"                   TEXT,
  ADD COLUMN "curriculum_load"         "CurriculumLoad",
  ADD COLUMN "complexity"              "Complexity",
  ADD COLUMN "content"                 TEXT,
  ADD COLUMN "prerequisite_seed_id"    TEXT,
  ADD COLUMN "prerequisite_seed_title" TEXT;

-- Placement follows the Taxonomy node by its stable id: promote the existing
-- subject_id / topic_id snapshot columns to real foreign keys. Safe because the
-- taxonomy is deprecate-not-delete (a retired node keeps its row), so the
-- reference never dangles; a rename updates the label everywhere through the id.
-- RESTRICT on delete matches the required LearningSeed -> Taxonomy relations.
ALTER TABLE "SeedRevision" ADD CONSTRAINT "SeedRevision_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "Taxonomy"("taxonomy_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeedRevision" ADD CONSTRAINT "SeedRevision_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "Taxonomy"("taxonomy_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prerequisite link: a foreign key to the live prior seed (follows the id). The
-- accompanying prerequisite_seed_title column (above) freezes the title as of
-- this snapshot for retrospective consistency. Nullable relation → SET NULL on
-- delete, matching LearningSeed.prerequisite_seed_id.
ALTER TABLE "SeedRevision" ADD CONSTRAINT "SeedRevision_prerequisite_seed_id_fkey"
  FOREIGN KEY ("prerequisite_seed_id") REFERENCES "LearningSeed"("seed_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for the new FK columns (Prisma indexes relation scalar fields).
CREATE INDEX "SeedRevision_subject_id_idx" ON "SeedRevision"("subject_id");
CREATE INDEX "SeedRevision_topic_id_idx" ON "SeedRevision"("topic_id");
CREATE INDEX "SeedRevision_prerequisite_seed_id_idx" ON "SeedRevision"("prerequisite_seed_id");
