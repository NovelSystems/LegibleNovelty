-- Corrective data-fix: revert the DRAFT rows that migration
-- 20260808120000_backfill_null_ai_attestation wrongly set to 'ai_pipeline'.
--
-- Background. Two independently-authored backfill migrations landed on main.
-- The first (20260803150000) deliberately backfilled ONLY non-draft rows
-- (`status <> 'draft'`), preserving draft NULLs -- a draft has legitimately not
-- declared an attestation yet. The second (20260808120000) backfilled ALL NULLs
-- with no status filter, so it also set drafts to 'ai_pipeline'. Because
-- 'ai_pipeline' is the permanently-locked tier (lib/modules.ts setAiAttestation
-- refuses to change a row already at 'ai_pipeline'), that pinned every then-null
-- draft to a declaration its author never made and could never correct. This
-- migration undoes exactly that, and nothing else.
--
-- WHY THIS BLANKET REVERT IS SAFE *NOW* -- AND WHY IT IS NOT A REUSABLE PATTERN.
-- There is no deployed/production database yet (hosting is deferred), so no real
-- user has ever declared 'ai_pipeline' on a draft. That means there is currently
-- nothing to distinguish a migration-corrupted row from a genuine author
-- declaration of 'ai_pipeline' on a draft -- and this revert accepts that: it
-- clears EVERY draft+'ai_pipeline' row blindly. If this repo ever holds real
-- user drafts, a bug of this shape could NOT be fixed this way -- a blanket
-- revert would erase legitimate author declarations along with the corrupted
-- ones. That situation would need a targeted fix (e.g. identifying corrupted
-- rows via an audit/changelog the schema does not currently keep), not this one.
-- Do not copy this migration as a template for a future occurrence.
--
-- On a fresh/migrated database (e.g. check.sh) there are no ContextualizedModule
-- rows, so this affects zero rows; it exists to make the intended draft
-- invariant hold on any database that DID apply 20260808120000 with data in it.
UPDATE "ContextualizedModule"
SET "ai_attestation" = NULL
WHERE "status" = 'draft'::"ModuleStatus"
  AND "ai_attestation" = 'ai_pipeline'::"AiAttestation";
