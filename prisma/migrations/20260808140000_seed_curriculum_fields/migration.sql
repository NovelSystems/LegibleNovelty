-- Seed Editor schema pass: curriculum metadata on LearningSeed.
-- Purely additive. Every new column is nullable — a Seed can be saved as an
-- incomplete draft, and completeness is enforced at PROMOTION to a Module
-- (assertSeedPromotable in lib/modules.ts), not by a schema constraint. No
-- backfill is needed for existing rows or fixtures.

-- CreateEnum
CREATE TYPE "CurriculumLoad" AS ENUM ('worksheet', 'short_unit', 'extended_unit');

-- CreateEnum
CREATE TYPE "Complexity" AS ENUM ('beginner', 'intermediate', 'advanced');

-- AlterTable
ALTER TABLE "LearningSeed" ADD COLUMN     "curriculum_load" "CurriculumLoad",
ADD COLUMN     "complexity" "Complexity",
ADD COLUMN     "content" TEXT;
