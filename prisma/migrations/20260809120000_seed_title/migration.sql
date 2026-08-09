-- Seed Editor: a short, memorable name for a Learning Seed.
-- Nullable (existing rows and non-editor flows have none); the "required to
-- save" rule for the Seed Editor is enforced in application logic, not here.
ALTER TABLE "LearningSeed" ADD COLUMN "title" TEXT;
