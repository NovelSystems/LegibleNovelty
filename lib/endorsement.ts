import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { applyStandingScoreDeltaWithin } from "@/lib/standing-scores";
import { assertEligible } from "@/lib/eligibility";
import { veFlagPlacement } from "@/lib/seeds";

// Library — Endorsement & Community Recommendation logic (master design Sections
// 9.1–9.2) plus the wiring of every hook Stage 1 / Seed Editor / Module Editor /
// Standing Scores forward-built for this sub-stage.
//
// REUSE, not reinvention, is the theme:
//   * Standing Score deltas go through the EXISTING applyStandingScoreDeltaWithin
//     helper (same function Module Editor's report path uses), never a parallel
//     score writer.
//   * The eligibility gate is the SINGLE shared lib/eligibility.ts function.
//   * A VE's placement objection routes through Seed Editor's EXISTING
//     veFlagPlacement → SeedDraftComment mechanism, never a second flag system.
//   * The under-18 / public-section visibility resolver lives in
//     lib/module-visibility.ts and is state-derived from these tables.

export class EndorsementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EndorsementError";
  }
}

// The module-recommendation count that unlocks the ESS +5 first-endorser reward
// (Standing Score trigger wired in Task 6).
export const RECOMMENDATION_ESS_REWARD_THRESHOLD = 10;

// Standing Score deltas (Task 6). Kept as named constants so the wiring reads
// against the brief's numbers rather than magic literals.
export const DSS_MODULE_FIRST_ENDORSEMENT = 5; // module author, on primary-seed first endorsement
export const DSS_SEED_FIRST_ENDORSEMENT = 1; // seed author, per module on their seed
export const DSS_COMBINED_FIRST_ENDORSEMENT = 6; // one account is both author + architect
export const DSS_PER_RECOMMENDATION = 0.1; // module author, per recommendation
export const ESS_FIRST_ENDORSER_REWARD = 5; // first endorser, at 10 recommendations
export const ESS_ENDORSED_MODULE_REJECTED = -5; // first endorser, on rejection after publication

const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Read helpers (shared with module-visibility's resolver and module-reports'
// ESS penalty; exported so those call the ONE definition of "first endorser").
// ---------------------------------------------------------------------------

export function seedEndorsementCount(seedId: string): Promise<number> {
  return prisma.endorsement.count({ where: { seed_id: seedId } });
}

export function moduleRecommendationCount(moduleId: string): Promise<number> {
  return prisma.communityRecommendation.count({ where: { module_id: moduleId } });
}

// Endorsement eligibility is VE-OR-LNC, checked LIVE at action time. Section 9.1's
// prose says "only Verified Educators may endorse," but Section 22's summary of
// that same section says "for Endorsement, VE/LNC status specifically" — the two
// conflict, and Section 22's broader reading is the correct one: an LNC-certified
// account holds the same functional endorsement ability without VE status
// (Section 4.3). Nothing sets `lnc_status` yet (Certification Center is deferred),
// so the LNC branch is unreachable in practice today; it is implemented correctly
// anyway, the same discipline as building DSS's lock-check before anything could
// trigger a lock.
async function assertMayEndorse(
  db: Prisma.TransactionClient | typeof prisma,
  accountId: string,
) {
  const acct = await db.account.findUniqueOrThrow({
    where: { account_id: accountId },
    select: { ve_status: true, lnc_status: true },
  });
  if (!acct.ve_status && !acct.lnc_status) {
    throw new EndorsementError(
      "Only a Verified Educator or an LNC-certified account may endorse.",
    );
  }
}

// The VE who endorsed a module's PRIMARY seed earliest (by created_at) among the
// endorsements that currently exist. This is the "who was first" the ESS +5
// reward and the ESS -5 rejection penalty both target (Task 6). Because the
// toggle is a hard delete, "first" means earliest among LIVE endorsements — a
// removed endorsement leaves no row to have been first. Returns null if the
// primary seed has no endorsement (nobody to pay/penalize).
export async function firstEndorserOfPrimarySeed(
  moduleId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string | null> {
  const module = await db.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    select: { primary_seed_id: true },
  });
  const first = await db.endorsement.findFirst({
    where: { seed_id: module.primary_seed_id },
    orderBy: { created_at: "asc" },
    select: { endorser_account_id: true },
  });
  return first?.endorser_account_id ?? null;
}

// ---------------------------------------------------------------------------
// Endorsement (Section 9.1) — per-seed, VE-only, additive binary toggle.
// ---------------------------------------------------------------------------

export interface EndorsementArgs {
  seedId: string;
  endorserAccountId: string;
  // Optional module context: when a VE endorses from a module page, pass the
  // module so the "edited under you" warning for THAT module is surfaced back
  // alongside the created endorsement (the seed itself has no single module).
  moduleContextId?: string;
}

export interface CreateEndorsementResult {
  endorsement: Prisma.EndorsementGetPayload<Record<string, never>>;
  created: boolean; // false if this VE already had a live endorsement (no-op).
  warning: EditedUnderYouWarning | null;
}

// Create an endorsement on a seed. The ve_status check is made LIVE inside the
// transaction (never a cached assumption) — Task 1. Idempotent: a VE who already
// holds a live endorsement on the seed gets that same row back with no duplicate
// and no re-fired rewards.
//
// On the seed's FIRST-EVER endorsement (0 → 1) this fires everything forward-
// built for that event, in the SAME transaction:
//   * flips Account.first_seed_endorsement_received for the seed's architect
//     (Task 4 — ungates the Seed Editor publish quota);
//   * for each module built on this seed as its PRIMARY seed, DSS +5 to the
//     module author and DSS +1 to the seed author, combined to a single +6 when
//     they are the same account (Task 6);
//   * the "public section" promotion needs no write — it is state-derived from
//     the endorsement's mere existence (see lib/module-visibility).
export async function createEndorsement(
  args: EndorsementArgs,
  now: Date = new Date(),
): Promise<CreateEndorsementResult> {
  const result = await prisma.$transaction(async (tx) => {
    // Live VE-or-LNC check at action time (Task 1) — read the row now, in the tx.
    await assertMayEndorse(tx, args.endorserAccountId);

    const seed = await tx.learningSeed.findUnique({
      where: { seed_id: args.seedId },
      select: { seed_id: true, architect_account_id: true, deleted_at: true },
    });
    if (!seed || seed.deleted_at) throw new EndorsementError("Seed not found.");

    // Toggle idempotency: a live endorsement by this VE on this seed already
    // satisfies the request — return it untouched, fire nothing again.
    const existing = await tx.endorsement.findUnique({
      where: {
        seed_id_endorser_account_id: {
          seed_id: args.seedId,
          endorser_account_id: args.endorserAccountId,
        },
      },
    });
    if (existing) return { endorsement: existing, created: false };

    const endorsement = await tx.endorsement.create({
      data: {
        seed_id: args.seedId,
        endorser_account_id: args.endorserAccountId,
        created_at: now,
      },
    });

    // Is this the seed's first-ever endorsement? (Count is now inclusive of the
    // row just created, so "first" means exactly 1.)
    const count = await tx.endorsement.count({ where: { seed_id: args.seedId } });
    if (count === 1) {
      await fireFirstSeedEndorsement(tx, args.seedId, seed.architect_account_id, now);
    }

    // A module on this seed may already sit at >= 10 recommendations and only
    // now have acquired a first endorser — settle the ESS +5 reward for each.
    const modules = await tx.contextualizedModule.findMany({
      where: { primary_seed_id: args.seedId },
      select: { module_id: true },
    });
    for (const m of modules) {
      await maybePayFirstEndorserReward(tx, m.module_id, now);
    }

    return { endorsement, created: true };
  });

  const warning = args.moduleContextId
    ? await getEditedUnderYouWarning(args.moduleContextId, now)
    : null;
  return { ...result, warning };
}

// The seed's first-endorsement fan-out (Task 4 flag flip + Task 6 DSS awards).
async function fireFirstSeedEndorsement(
  tx: Prisma.TransactionClient,
  seedId: string,
  architectAccountId: string,
  now: Date,
) {
  // Task 4: flip the architect's cached "has ever had a seed endorsed" flag.
  // updateMany with the false guard keeps it idempotent and a single write.
  await tx.account.updateMany({
    where: { account_id: architectAccountId, first_seed_endorsement_received: false },
    data: { first_seed_endorsement_received: true },
  });

  // Task 6 DSS awards, only for modules using this seed as their PRIMARY seed —
  // a module's primary seed is "what educator endorsement actually vouches for".
  // (Secondary-seed endorsement deliberately triggers no module promotion/award;
  // flagged as an untouched question in the delivery summary.)
  const modules = await tx.contextualizedModule.findMany({
    where: { primary_seed_id: seedId },
    select: { module_id: true, author_account_id: true },
  });
  for (const m of modules) {
    if (m.author_account_id === architectAccountId) {
      // One account is both seed architect and module author: a SINGLE combined
      // +6 event, deliberately not two +5/+1 rows that could read as a double-
      // count (Task 6).
      await applyStandingScoreDeltaWithin(
        tx,
        {
          accountId: m.author_account_id,
          scoreType: "DSS",
          delta: DSS_COMBINED_FIRST_ENDORSEMENT,
          eventType: "dss_first_endorsement_combined",
        },
        now,
      );
    } else {
      await applyStandingScoreDeltaWithin(
        tx,
        {
          accountId: m.author_account_id,
          scoreType: "DSS",
          delta: DSS_MODULE_FIRST_ENDORSEMENT,
          eventType: "dss_module_first_endorsement",
        },
        now,
      );
      await applyStandingScoreDeltaWithin(
        tx,
        {
          accountId: architectAccountId,
          scoreType: "DSS",
          delta: DSS_SEED_FIRST_ENDORSEMENT,
          eventType: "dss_seed_first_endorsement",
        },
        now,
      );
    }
  }
}

// Remove an endorsement (the toggle-off half). Hard delete — no history retained
// (Section 9.1 states no need to keep a removed endorsement's history, unlike
// StandingScoreEvent's append-only log). Idempotent: removing a non-existent
// endorsement is a no-op. Awards already granted are NOT clawed back (append-only
// reward semantics, consistent with how the rest of Standing Scores treats
// rewards); visibility, however, IS state-derived and reverts if this was the
// last endorsement.
export async function removeEndorsement(
  seedId: string,
  endorserAccountId: string,
): Promise<boolean> {
  const deleted = await prisma.endorsement.deleteMany({
    where: { seed_id: seedId, endorser_account_id: endorserAccountId },
  });
  return deleted.count > 0;
}

// Binary toggle convenience: endorse if not endorsed, remove if endorsed
// (Section 9.1 "clicking again removes it").
export async function toggleEndorsement(
  args: EndorsementArgs,
  now: Date = new Date(),
): Promise<{ endorsed: boolean; warning: EditedUnderYouWarning | null }> {
  const existing = await prisma.endorsement.findUnique({
    where: {
      seed_id_endorser_account_id: {
        seed_id: args.seedId,
        endorser_account_id: args.endorserAccountId,
      },
    },
    select: { endorsement_id: true },
  });
  if (existing) {
    await removeEndorsement(args.seedId, args.endorserAccountId);
    return { endorsed: false, warning: null };
  }
  const { warning } = await createEndorsement(args, now);
  return { endorsed: true, warning };
}

// Endorsement review can carry a taxonomy-placement objection (Section 5.4 /
// 7.1). This is NOT a new mechanism: it asserts the actor is a VE (endorsement
// is VE-only) and then routes through Seed Editor's EXISTING veFlagPlacement,
// which files a SeedDraftComment and returns the seed to Draft. No second comment
// or flag system (Task 4).
export async function flagSeedPlacementDuringEndorsement(args: {
  seedId: string;
  veAccountId: string;
  body: string;
}) {
  // Flagging placement is part of endorsement review, so it uses the same
  // VE-or-LNC eligibility as endorsing itself (an LNC reviewer can raise the
  // same objection a VE can).
  await assertMayEndorse(prisma, args.veAccountId);
  return veFlagPlacement({
    seedId: args.seedId,
    veAccountId: args.veAccountId,
    body: args.body,
  });
}

// ---------------------------------------------------------------------------
// Community Recommendation (Section 9.2) — per-module, eligibility-gated toggle.
// ---------------------------------------------------------------------------

export interface CreateRecommendationResult {
  recommendation: Prisma.CommunityRecommendationGetPayload<Record<string, never>>;
  created: boolean;
  warning: EditedUnderYouWarning | null;
}

// Create a community recommendation on a module. The recommender must pass the
// shared eligibility gate (Task 3) — this calls assertEligible, it does NOT
// reimplement the 7-day/profile check. Idempotent per (account, module).
//
// On creation: DSS +0.1 to the module author for EVERY recommendation (Task 6,
// ungated by any threshold), and — if this pushes the module to the 10-recommendation
// mark — the ESS +5 first-endorser reward is settled. The module_version is
// snapshotted for the white/grey count split (Task 5).
export async function createCommunityRecommendation(
  args: { moduleId: string; recommenderAccountId: string },
  now: Date = new Date(),
): Promise<CreateRecommendationResult> {
  // Eligibility gate FIRST (throws EligibilityError with onboarding framing).
  await assertEligible(args.recommenderAccountId, now);

  const result = await prisma.$transaction(async (tx) => {
    const module = await tx.contextualizedModule.findUnique({
      where: { module_id: args.moduleId },
      select: { module_id: true, version: true, author_account_id: true },
    });
    if (!module) throw new EndorsementError("Module not found.");

    const existing = await tx.communityRecommendation.findUnique({
      where: {
        module_id_recommender_account_id: {
          module_id: args.moduleId,
          recommender_account_id: args.recommenderAccountId,
        },
      },
    });
    if (existing) return { recommendation: existing, created: false };

    const recommendation = await tx.communityRecommendation.create({
      data: {
        module_id: args.moduleId,
        recommender_account_id: args.recommenderAccountId,
        module_version: module.version, // snapshot for the version split (Task 5)
        created_at: now,
      },
    });

    // Task 6: DSS +0.1 to the module author on every recommendation, no threshold.
    await applyStandingScoreDeltaWithin(
      tx,
      {
        accountId: module.author_account_id,
        scoreType: "DSS",
        delta: DSS_PER_RECOMMENDATION,
        eventType: "dss_recommendation",
      },
      now,
    );

    // Task 6: settle the ESS +5 first-endorser reward if we've now reached 10.
    await maybePayFirstEndorserReward(tx, args.moduleId, now);

    return { recommendation, created: true };
  });

  const warning = await getEditedUnderYouWarning(args.moduleId, now);
  return { ...result, warning };
}

export async function removeCommunityRecommendation(
  moduleId: string,
  recommenderAccountId: string,
): Promise<boolean> {
  const deleted = await prisma.communityRecommendation.deleteMany({
    where: { module_id: moduleId, recommender_account_id: recommenderAccountId },
  });
  return deleted.count > 0;
}

export async function toggleCommunityRecommendation(
  args: { moduleId: string; recommenderAccountId: string },
  now: Date = new Date(),
): Promise<{ recommended: boolean; warning: EditedUnderYouWarning | null }> {
  const existing = await prisma.communityRecommendation.findUnique({
    where: {
      module_id_recommender_account_id: {
        module_id: args.moduleId,
        recommender_account_id: args.recommenderAccountId,
      },
    },
    select: { recommendation_id: true },
  });
  if (existing) {
    await removeCommunityRecommendation(args.moduleId, args.recommenderAccountId);
    return { recommended: false, warning: null };
  }
  const { warning } = await createCommunityRecommendation(args, now);
  return { recommended: true, warning };
}

// The ESS +5 first-endorser reward (Task 6). Paid EXACTLY ONCE per module, the
// first time it holds >= 10 recommendations AND has a first endorser to pay. The
// ess_first_endorser_rewarded latch makes it idempotent against a toggle-driven
// re-cross of the threshold, and lets the reward settle regardless of whether the
// 10th recommendation or the first endorsement came last. Composes inside the
// caller's transaction so the reward and the latch flip atomically.
async function maybePayFirstEndorserReward(
  tx: Prisma.TransactionClient,
  moduleId: string,
  now: Date,
) {
  const module = await tx.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    select: { primary_seed_id: true, ess_first_endorser_rewarded: true },
  });
  if (module.ess_first_endorser_rewarded) return;

  const recCount = await tx.communityRecommendation.count({
    where: { module_id: moduleId },
  });
  if (recCount < RECOMMENDATION_ESS_REWARD_THRESHOLD) return;

  const firstEndorserId = await firstEndorserOfPrimarySeed(moduleId, tx);
  if (!firstEndorserId) return; // nobody to reward yet

  await applyStandingScoreDeltaWithin(
    tx,
    {
      accountId: firstEndorserId,
      scoreType: "ESS",
      delta: ESS_FIRST_ENDORSER_REWARD,
      eventType: "ess_first_endorser_reward",
    },
    now,
  );
  await tx.contextualizedModule.update({
    where: { module_id: moduleId },
    data: { ess_first_endorser_rewarded: true },
  });
}

// ---------------------------------------------------------------------------
// White / grey version-split counts (Module Editor Task 2, wired here).
// ---------------------------------------------------------------------------

export interface SignalSplit {
  current: number; // white — landed on the current version
  prior: number; // grey — sum across all prior versions
  total: number; // what sorting/ranking always uses
}

export interface ModuleSignalCounts {
  endorsements: SignalSplit;
  recommendations: SignalSplit;
}

// The white (current-version) / grey (prior-versions) split for a module's
// endorsements and recommendations (Task 5). BOTH splits are correct across a
// module edited/re-published multiple times, but attribute by DIFFERENT means
// because the two records have different cardinality:
//
//   * Recommendations are per-module, so each carries a module_version snapshot;
//     current = snapshot == the module's current version, prior = snapshot <.
//   * Endorsements are per-SEED and shared across every module on that seed, so
//     no single module_version can live on the row. Instead the split uses the
//     current version's publish timestamp (module.publication_date) as the exact
//     current/prior boundary: an endorsement created at/after the last publish is
//     on the current version, one created before it was made while a prior
//     version (or, for endorsements predating the module's first publish, no
//     published version) was live. Both routes give the same current-vs-prior
//     partition; `total` (white + grey) is always the true count, which is all
//     sorting uses.
export async function getModuleSignalCounts(
  moduleId: string,
): Promise<ModuleSignalCounts> {
  const module = await prisma.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    select: { primary_seed_id: true, version: true, publication_date: true },
  });

  // Recommendations — split by the stored version snapshot.
  const recs = await prisma.communityRecommendation.findMany({
    where: { module_id: moduleId },
    select: { module_version: true },
  });
  const recCurrent = recs.filter((r) => r.module_version === module.version).length;

  // Endorsements — split by created_at against the current version's publish
  // boundary. With no publish yet (publication_date null) there are no prior
  // versions, so everything counts as current.
  const endorsements = await prisma.endorsement.findMany({
    where: { seed_id: module.primary_seed_id },
    select: { created_at: true },
  });
  const boundary = module.publication_date;
  const endorseCurrent = boundary
    ? endorsements.filter((e) => e.created_at >= boundary).length
    : endorsements.length;

  return {
    endorsements: split(endorseCurrent, endorsements.length),
    recommendations: split(recCurrent, recs.length),
  };
}

function split(current: number, total: number): SignalSplit {
  return { current, prior: total - current, total };
}

// ---------------------------------------------------------------------------
// "Edited under you" warning (Module Editor Task 2, wired here).
// ---------------------------------------------------------------------------

export interface EditedUnderYouWarning {
  editedWithinLastHour: true;
  lastEditedAt: Date;
  minutesSinceEdit: number;
  // The quantified "how much changed" signal (design Section 9.2's line-count
  // delta). Module content is page/element JSON, not text lines, so the delta is
  // measured in ELEMENTS — the structural analog the reviewer identified: the net
  // change in the module's ModuleElement count since the current version was
  // published (currentElementCount - published_element_count). Positive = elements
  // added, negative = removed.
  //
  // Two honest limitations, both rooted in what Module Editor persists (only
  // last_edited_at and now this publish-time baseline, no per-edit changelog):
  //   * it is a NET count, so pure in-place text edits — and equal add/remove
  //     churn — register as 0; and
  //   * the baseline is publish-time, so the delta is "structural change to this
  //     version since it went live", which the warning surfaces alongside the
  //     within-the-hour recency trigger rather than a strict trailing-60-minute
  //     window. A finer character-level or true trailing-window delta would need
  //     Module Editor to persist an edit-diff baseline it currently does not.
  elementCountDelta: number;
  currentElementCount: number;
}

// Detects the Section 9.2 "edited under you" condition for the NEXT person about
// to endorse or recommend this module, returning a warning to surface (never
// blocking — it is informational, letting the endorser judge significance).
//
// Fires iff BOTH:
//   1. the module's CURRENT version already carries at least one endorsement or
//      recommendation (the arming condition — edits before the current version's
//      first signal are unflagged), AND
//   2. an edit landed at/after that first signal AND within the past hour of the
//      attempt (`now`).
// Returns null otherwise. The edit-timestamp (last_edited_at) itself is tracked
// by Module Editor; this reads it — it does not set it.
export async function getEditedUnderYouWarning(
  moduleId: string,
  now: Date = new Date(),
): Promise<EditedUnderYouWarning | null> {
  const module = await prisma.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    select: {
      primary_seed_id: true,
      version: true,
      publication_date: true,
      last_edited_at: true,
      published_element_count: true,
    },
  });

  if (!module.last_edited_at) return null;

  // Earliest signal on the CURRENT version (the arming timestamp). null → the
  // current version has no endorsement/recommendation yet → never armed.
  const boundary = module.publication_date;
  const [firstEndorse, firstRec] = await Promise.all([
    prisma.endorsement.findFirst({
      where: {
        seed_id: module.primary_seed_id,
        ...(boundary ? { created_at: { gte: boundary } } : {}),
      },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
    }),
    prisma.communityRecommendation.findFirst({
      where: { module_id: moduleId, module_version: module.version },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
    }),
  ]);

  const signalTimes = [firstEndorse?.created_at, firstRec?.created_at].filter(
    (d): d is Date => d != null,
  );
  if (signalTimes.length === 0) return null; // not armed
  const firstSignalAt = new Date(Math.min(...signalTimes.map((d) => d.getTime())));

  // An edit that predates the current version's first signal is unflagged.
  if (module.last_edited_at < firstSignalAt) return null;

  const sinceEditMs = now.getTime() - module.last_edited_at.getTime();
  if (sinceEditMs > HOUR_MS || sinceEditMs < 0) return null;

  // Element-count delta against the current version's publish-time baseline.
  const currentElementCount = await prisma.moduleElement.count({
    where: { page: { module_id: moduleId } },
  });
  const baseline = module.published_element_count ?? currentElementCount;

  return {
    editedWithinLastHour: true,
    lastEditedAt: module.last_edited_at,
    minutesSinceEdit: Math.floor(sinceEditMs / 60000),
    elementCountDelta: currentElementCount - baseline,
    currentElementCount,
  };
}
