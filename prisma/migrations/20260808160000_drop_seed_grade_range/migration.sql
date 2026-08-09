-- Drop grade_range from Seeds in favor of the `complexity` enum.
-- Removed from LearningSeed and from the SeedRevision content snapshot. This is
-- an intentional, destructive removal of the free-text grade band; there is no
-- backfill — `complexity` (beginner/intermediate/advanced) carries the
-- difficulty signal going forward, including the Library search filter.

-- AlterTable
ALTER TABLE "LearningSeed" DROP COLUMN "grade_range";

-- AlterTable
ALTER TABLE "SeedRevision" DROP COLUMN "grade_range";
