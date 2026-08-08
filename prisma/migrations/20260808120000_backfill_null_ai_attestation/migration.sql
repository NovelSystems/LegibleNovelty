-- Backfill: close the pre-enforcement gap where a published module could reach
-- ranking with no AI attestation declared.
--
-- submitForReview now rejects a null ai_attestation at the draft→pending_review
-- transition, so no NEW module can publish without a declaration. This migration
-- handles rows that predate that enforcement: every already-null attestation is
-- set to the least-advantageous ranking tier, ai_pipeline (multiplier 1x — the
-- lowest of the three tiers), so an undeclared legacy module gains no ranking
-- advantage over a properly-declared one.
--
-- Note (intentional, per the least-advantageous rule): ai_pipeline is the
-- permanently-locked tier, so a backfilled row can no longer be re-declared to a
-- higher tier via setAiAttestation. That is deliberate — it prevents a legacy
-- undeclared module from being retroactively upgraded to a 10x (wholly_human)
-- ranking after the fact.
--
-- The column stays nullable: null remains valid for in-progress drafts, which are
-- excluded from ranking by the `status = 'published'` filter. This backfill only
-- touches rows null at migration time; it is not a trigger and does not affect
-- future drafts.
UPDATE "ContextualizedModule"
SET "ai_attestation" = 'ai_pipeline'
WHERE "ai_attestation" IS NULL;
