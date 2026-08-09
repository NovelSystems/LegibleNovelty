-- Data-fix (no schema change): AI-attestation enforcement.
--
-- Before this branch enforced the AI-attestation declaration at the draft ->
-- pending-review transition (lib/modules.ts submitForReview), a module could be
-- submitted or published with a NULL `ai_attestation` while still feeding the
-- Library ranking formula (Section 9.3-9.4) and the endorsement Standing-Score
-- payouts. Backfill any such already-submitted / already-published rows to the
-- lowest-multiplier declared value.
--
-- `ai_pipeline` is that value (1x -- the lowest of 10x / 2x / 1x). It is also
-- the ONLY value that preserves these rows' current effective ranking: the
-- ranking code already maps a NULL attestation to the neutral 1x floor, so
-- ai_pipeline (1x) keeps them exactly where they are and grants no advantage the
-- declaration was meant to gate. Backfilling to 2x or 10x would instead HAND
-- these undeclared rows a ranking boost they never earned.
--
-- Draft modules are deliberately left NULL: a Draft has not reached the
-- submission gate and has legitimately not declared anything yet (this is why
-- the column stays nullable at the schema level).
UPDATE "ContextualizedModule"
SET "ai_attestation" = 'ai_pipeline'::"AiAttestation"
WHERE "ai_attestation" IS NULL
  AND "status" <> 'draft'::"ModuleStatus";
