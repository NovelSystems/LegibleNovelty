import { prisma } from "@/lib/prisma";
import {
  loadApprovalInputs,
  rankResults,
  scoreModule,
  type SearchResult,
} from "@/lib/search";

// Library — Homepage Module List (master design Section 9.6). The unauthenticated
// landing's "window shopping" list: up to 20 modules chosen by a cascading
// recency-eligibility window, then ranked by the ordinary Weighted Approval sort.
// It is NOT a new metric — it is the existing ranking system (lib/search) with a
// time-boxed eligibility gate in front of it.

export const HOMEPAGE_LIMIT = 20;

// The single static empty-state message (Section 9.6) — shown identically whether
// the cause is zero qualifying modules or a load failure, deliberately with no
// conditional branching.
export const HOMEPAGE_EMPTY_MESSAGE = "Make sure to recommend your favorite modules!";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000;

export type HomepageWindow = "2_weeks" | "2_months" | "anytime";

export interface HomepageResult {
  results: SearchResult[];
  // Which cascade tier supplied the list (for observability/testing).
  windowUsed: HomepageWindow;
  // Non-null only when the list is empty — the static message to render.
  emptyStateMessage: string | null;
}

// The cascade tiers, widest-last. `anytime` (null cutoff) is the terminal tier:
// it is used regardless of how few modules qualify ("up to 20, not exactly 20").
const CASCADE: { label: HomepageWindow; windowMs: number | null }[] = [
  { label: "2_weeks", windowMs: TWO_WEEKS_MS },
  { label: "2_months", windowMs: TWO_MONTHS_MS },
  { label: "anytime", windowMs: null },
];

// --- Pure decomposition (no DB) — the testable core of the homepage list ------
//
// The cascade-tier selection, the two-signal recency rule, and the empty-state
// mapping are all pure functions so they can be tested deterministically on
// synthetic inputs, with no dependence on shared-table state or test execution
// order. homepageModules (below) is only the DB wiring around them.

// The recency signal that drives the cascade is the MORE RECENT of a module's
// latest endorsement and its latest recommendation (Section 9.6: "most recent
// endorsement OR recommendation"). A recommendation therefore refreshes recency
// independently of how old the endorsement is — a module endorsed months ago but
// recommended yesterday is "recent". Returns null only if neither signal exists.
export function mostRecentSignalOf(
  latestEndorsement: Date | null,
  latestRecommendation: Date | null,
): Date | null {
  if (latestEndorsement && latestRecommendation) {
    return latestEndorsement >= latestRecommendation ? latestEndorsement : latestRecommendation;
  }
  return latestEndorsement ?? latestRecommendation;
}

// The cascading eligibility window (Section 9.6). Widens 2 weeks → 2 months →
// anytime, stopping at the first tier where at least `limit` items qualify; the
// terminal `anytime` tier is always accepted no matter how few qualify. Pure:
// takes the items' most-recent signals and returns the chosen tier plus the set
// of eligible ids.
export function pickCascadeTier(
  items: { id: string; mostRecentSignal: Date }[],
  now: Date,
  limit: number,
): { windowUsed: HomepageWindow; eligibleIds: Set<string> } {
  for (const tier of CASCADE) {
    const cutoff = tier.windowMs == null ? null : new Date(now.getTime() - tier.windowMs);
    const pool = cutoff ? items.filter((i) => i.mostRecentSignal >= cutoff) : items;
    if (pool.length >= limit || tier.windowMs == null) {
      return { windowUsed: tier.label, eligibleIds: new Set(pool.map((i) => i.id)) };
    }
  }
  // Unreachable — the `anytime` tier always returns — but keeps the type total.
  return { windowUsed: "anytime", eligibleIds: new Set(items.map((i) => i.id)) };
}

// Assemble the final result, attaching the static empty-state message iff the
// list came back empty (Section 9.6: one message, no branching on the cause).
export function buildHomepageResult(
  results: SearchResult[],
  windowUsed: HomepageWindow,
): HomepageResult {
  return {
    results,
    windowUsed,
    emptyStateMessage: results.length === 0 ? HOMEPAGE_EMPTY_MESSAGE : null,
  };
}

// --- DB wiring ----------------------------------------------------------------

interface Candidate {
  id: string;
  result: SearchResult;
  mostRecentSignal: Date; // max(latest endorsement, latest recommendation)
}

export async function homepageModules(
  now: Date = new Date(),
  // The "up to N" cap and the cascade's qualify-threshold. Defaults to the
  // Section 9.6 value of 20; injectable so the cascade tiers can be exercised in
  // tests without fabricating 20+ modules. Production callers pass nothing.
  limit: number = HOMEPAGE_LIMIT,
): Promise<HomepageResult> {
  // The candidate pool is the PUBLIC SECTION: published modules whose primary
  // seed carries at least one endorsement (passive discovery requires that
  // promotion, per the prior sub-stage — the homepage is explicitly a
  // passive-discovery surface). Recency then narrows this pool.
  const modules = await prisma.contextualizedModule.findMany({
    where: { status: "published" },
  });
  if (modules.length === 0) return buildHomepageResult([], "anytime");

  const { endorsements, recommendations } = await loadApprovalInputs(modules);
  const seedIds = [...new Set(modules.map((m) => m.primary_seed_id))];
  const moduleIds = modules.map((m) => m.module_id);

  // Most-recent-signal inputs: the latest endorsement per primary seed and the
  // latest recommendation per module.
  const [endorseMax, recMax] = await Promise.all([
    prisma.endorsement.groupBy({
      by: ["seed_id"],
      where: { seed_id: { in: seedIds } },
      _max: { created_at: true },
    }),
    prisma.communityRecommendation.groupBy({
      by: ["module_id"],
      where: { module_id: { in: moduleIds } },
      _max: { created_at: true },
    }),
  ]);
  const endorseMaxMap = new Map(endorseMax.map((g) => [g.seed_id, g._max.created_at]));
  const recMaxMap = new Map(recMax.map((g) => [g.module_id, g._max.created_at]));

  const candidates: Candidate[] = [];
  for (const module of modules) {
    const e = endorsements.get(module.primary_seed_id) ?? 0;
    if (e < 1) continue; // not in the public section — never on the homepage
    const r = recommendations.get(module.module_id) ?? 0;

    // The cascade signal is the more recent of the two signal types (not
    // endorsement alone) — see mostRecentSignalOf.
    const mostRecentSignal = mostRecentSignalOf(
      endorseMaxMap.get(module.primary_seed_id) ?? null,
      recMaxMap.get(module.module_id) ?? null,
    );
    if (!mostRecentSignal) continue; // defensive; an endorsed module always has one

    const score = scoreModule("weighted_approval", {
      endorsements: e,
      recommendations: r,
      downloads: module.download_count,
      passingCompletions: module.passing_completion_count,
      aiAttestation: module.ai_attestation,
      publicationDate: module.publication_date,
    });
    candidates.push({
      id: module.module_id,
      mostRecentSignal,
      result: {
        module,
        endorsements: e,
        recommendations: r,
        downloads: module.download_count,
        passingCompletions: module.passing_completion_count,
        score,
      },
    });
  }

  const { windowUsed, eligibleIds } = pickCascadeTier(
    candidates.map((c) => ({ id: c.id, mostRecentSignal: c.mostRecentSignal })),
    now,
    limit,
  );

  // Rank the eligible pool by Weighted Approval (identical ordering rule as
  // search) and cap at the limit.
  const eligible = candidates.filter((c) => eligibleIds.has(c.id)).map((c) => c.result);
  const results = rankResults(eligible).slice(0, limit);

  return buildHomepageResult(results, windowUsed);
}
