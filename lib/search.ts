import { prisma } from "@/lib/prisma";
import type { AiAttestation, ContextualizedModule, Prisma } from "@prisma/client";

// Library — Search, Ranking, and Discovery (master design Sections 9.3–9.7).
//
// This is the query/ranking/filter layer over the trust data the first Library
// sub-stage produced (Endorsement, CommunityRecommendation). It adds NO new
// endorsement/recommendation logic — it only reads and ranks. Endorsement counts
// used here are always counts on a module's PRIMARY seed (Endorsement is
// per-seed, and the primary seed is what the ranking system trusts — consistent
// with the visibility gate and DSS/ESS payouts). Secondary-seed endorsements are
// a discovery tag, never a ranking input.

// --- Sort modes and the AI attestation multiplier (Sections 9.3–9.4) ---------

export type SortMode =
  | "weighted_approval" // default
  | "unweighted_approval"
  | "weighted_usage"
  | "unweighted_usage"
  | "recency";

export const DEFAULT_SORT: SortMode = "weighted_approval";

// Section 9.4's multiplier table. The two primary tiers (10× / 2×) are live; AI
// Pipeline carries the doc's 1× value as the third, lowest tier.
export const ATTESTATION_MULTIPLIER: Record<AiAttestation, number> = {
  wholly_human: 10,
  ai_assisted_manual_flair: 2,
  ai_pipeline: 1,
};

// `ContextualizedModule.ai_attestation` is nullable, but a published module can
// no longer reach ranking with a null attestation: submitForReview now enforces
// Section 9.4's declaration requirement at the draft→pending_review transition,
// and a backfill migration set every pre-enforcement null row to the
// least-advantageous tier (ai_pipeline, 1×). Null now occurs only on in-progress
// drafts, which buildWhere's `status: "published"` filter excludes from ranking.
// The 1× return below is therefore a defensive floor for a case ranking should
// never see, not the load-bearing handler for an open enforcement gap.
export function attestationMultiplier(attestation: AiAttestation | null): number {
  return attestation == null ? 1 : ATTESTATION_MULTIPLIER[attestation];
}

// The per-module inputs every sort formula reads. Endorsements/recommendations
// are TOTAL counts (combined across versions) — sorting always uses the combined
// total, per the prior sub-stage's white/grey rule. downloads / passingCompletions
// are the Usage-sort inputs, read straight from the module columns (populated by
// nothing yet — PDF Generation and Quiz/Scoring are unbuilt — but the formula is
// wired and tested against stubbed values).
export interface ModuleScoreInputs {
  endorsements: number;
  recommendations: number;
  downloads: number;
  passingCompletions: number;
  aiAttestation: AiAttestation | null;
  publicationDate: Date | null;
}

// The single scoring function for all five sorts (Section 9.3). Pure, so the
// worked example (Section 9.4) is unit-testable without a database: a
// Wholly-Human module with 9 endorsements scores (9×3)×10 = 270 and outranks an
// AI-Assisted module with 44 endorsements at (44×3)×2 = 264 — the doc's "90 vs
// 88" is the same crossover with the ×3 and recommendations dropped for brevity.
// Recency carries no computed score: its "score" is the publication timestamp,
// which sorts newest-first under the same descending order as every other sort.
export function scoreModule(sort: SortMode, m: ModuleScoreInputs): number {
  const approvalBase = m.endorsements * 3 + m.recommendations;
  const usageBase = m.downloads + m.passingCompletions;
  const mult = attestationMultiplier(m.aiAttestation);
  switch (sort) {
    case "weighted_approval":
      return approvalBase * mult;
    case "unweighted_approval":
      return approvalBase;
    case "weighted_usage":
      return usageBase * mult;
    case "unweighted_usage":
      return usageBase;
    case "recency":
      return m.publicationDate ? m.publicationDate.getTime() : 0;
  }
}

// --- Filters (Section 9.5) ----------------------------------------------------

export interface SearchFilters {
  // Structural filters resolved against the module's PRIMARY seed (LearningSeed),
  // per the brief — the live seed, not the pinned revision.
  language?: string;
  subjectId?: string;
  topicId?: string;
  // Free-text grade filter. Seed Editor deliberately made grade_range free-text
  // and non-sortable, so this is a SUBSTRING (contains) match, NOT a numeric
  // range query — flagged in the delivery summary as worth revisiting now that
  // filtering against this field is a real requirement.
  gradeRange?: string;
  // Context (special-interest) tag: multi-select, OR within (an IN check over the
  // single context_tag column), AND with every other filter.
  contextTags?: string[];
  // Binary endorsement status on the primary seed: true = at least one, false =
  // none. No count threshold (Section 9.5).
  endorsementStatus?: boolean;
  // "all" (or omitted) applies no attestation filter.
  aiAttestation?: AiAttestation | "all";
}

export interface SearchResult {
  module: ContextualizedModule;
  endorsements: number;
  recommendations: number;
  downloads: number;
  passingCompletions: number;
  score: number;
}

// Build the DB-level structural WHERE (everything except endorsement status,
// which needs per-seed aggregation and is applied after counting).
function buildWhere(filters: SearchFilters): Prisma.ContextualizedModuleWhereInput {
  const seed: Prisma.LearningSeedWhereInput = {};
  if (filters.language) seed.language = filters.language;
  if (filters.subjectId) seed.subject_id = filters.subjectId;
  if (filters.topicId) seed.topic_id = filters.topicId;
  if (filters.gradeRange) {
    seed.grade_range = { contains: filters.gradeRange, mode: "insensitive" };
  }

  const where: Prisma.ContextualizedModuleWhereInput = { status: "published" };
  if (Object.keys(seed).length > 0) where.primary_seed = seed;
  if (filters.contextTags && filters.contextTags.length > 0) {
    where.context_tag = { in: filters.contextTags };
  }
  if (filters.aiAttestation && filters.aiAttestation !== "all") {
    where.ai_attestation = filters.aiAttestation;
  }
  return where;
}

// Batch-load the approval inputs (primary-seed endorsement counts + module
// recommendation counts) for a set of modules, in two grouped queries. Shared by
// search and the homepage list so both read counts the same way.
export async function loadApprovalInputs(
  modules: Pick<ContextualizedModule, "module_id" | "primary_seed_id">[],
): Promise<{ endorsements: Map<string, number>; recommendations: Map<string, number> }> {
  const seedIds = [...new Set(modules.map((m) => m.primary_seed_id))];
  const moduleIds = modules.map((m) => m.module_id);

  const [endorseGroups, recGroups] = await Promise.all([
    seedIds.length
      ? prisma.endorsement.groupBy({
          by: ["seed_id"],
          where: { seed_id: { in: seedIds } },
          _count: true,
        })
      : Promise.resolve([] as { seed_id: string; _count: number }[]),
    moduleIds.length
      ? prisma.communityRecommendation.groupBy({
          by: ["module_id"],
          where: { module_id: { in: moduleIds } },
          _count: true,
        })
      : Promise.resolve([] as { module_id: string; _count: number }[]),
  ]);

  return {
    endorsements: new Map(endorseGroups.map((g) => [g.seed_id, g._count])),
    recommendations: new Map(recGroups.map((g) => [g.module_id, g._count])),
  };
}

// The main search/browse entry point (Sections 9.3 + 9.5). Applies structural
// filters at the DB level, endorsement-status after counting, computes the chosen
// sort's score, and orders results (inversion flips the primary order only;
// tiebreak is always newest-first then id, for stable determinism).
//
// Context OR-within / AND-across is enforced by construction: contextTags is a
// single-column IN (OR within Context), combined with every other WHERE clause
// via AND. This is the same rule the Quick Search panel uses.
export async function searchModules(
  filters: SearchFilters = {},
  sort: SortMode = DEFAULT_SORT,
  opts: { invert?: boolean } = {},
): Promise<SearchResult[]> {
  const modules = await prisma.contextualizedModule.findMany({
    where: buildWhere(filters),
  });

  const { endorsements, recommendations } = await loadApprovalInputs(modules);

  const results: SearchResult[] = [];
  for (const module of modules) {
    const e = endorsements.get(module.primary_seed_id) ?? 0;
    // Endorsement-status filter (binary, on the primary seed).
    if (filters.endorsementStatus === true && e < 1) continue;
    if (filters.endorsementStatus === false && e >= 1) continue;

    const r = recommendations.get(module.module_id) ?? 0;
    const score = scoreModule(sort, {
      endorsements: e,
      recommendations: r,
      downloads: module.download_count,
      passingCompletions: module.passing_completion_count,
      aiAttestation: module.ai_attestation,
      publicationDate: module.publication_date,
    });
    results.push({
      module,
      endorsements: e,
      recommendations: r,
      downloads: module.download_count,
      passingCompletions: module.passing_completion_count,
      score,
    });
  }

  return rankResults(results, opts.invert ?? false);
}

// Order by score (descending by default; inversion flips to ascending), then a
// stable tiebreak: newest publication first, then module_id. Tiebreakers are NOT
// inverted — only the primary score order is, matching the ↑↓ toggle acting on
// "the active sort". Exported so the homepage list ranks its eligible pool with
// the identical rule.
export function rankResults(results: SearchResult[], invert = false): SearchResult[] {
  const dir = invert ? -1 : 1;
  return results.sort((a, b) => {
    if (a.score !== b.score) return (b.score - a.score) * dir;
    const ad = a.module.publication_date?.getTime() ?? 0;
    const bd = b.module.publication_date?.getTime() ?? 0;
    if (ad !== bd) return bd - ad;
    return a.module.module_id.localeCompare(b.module.module_id);
  });
}

// --- Quick Search helpers (Section 9.7) --------------------------------------
//
// The slide-out panel and its ARIA listbox are frontend concerns (deferred to
// the UI build phase, Section 18); these are the backend queries/logic behind
// them, all testable without a UI.

// Cascading Subject → Topic: the Topic dropdown's options for a chosen Subject,
// reusing the existing two-level Taxonomy (deprecated topics excluded).
export function topicsForSubject(subjectId: string) {
  return prisma.taxonomy.findMany({
    where: { level: "topic", parent_id: subjectId, deprecated_at: null },
    orderBy: { name: "asc" },
  });
}

// The Context listbox options: the distinct Context tags in use on published
// modules, ALPHABETICALLY ordered (stability over popularity, so the list does
// not reorder itself as content grows — Section 9.7).
export async function contextTagOptions(): Promise<string[]> {
  const rows = await prisma.contextualizedModule.findMany({
    where: { status: "published", context_tag: { not: null } },
    select: { context_tag: true },
    distinct: ["context_tag"],
  });
  return rows
    .map((r) => r.context_tag as string)
    .sort((a, b) => a.localeCompare(b));
}

export type UseMyInterestsResult =
  | { state: "guest" } // button disabled at load (knowable without a query)
  | { state: "empty" } // logged in, no interests set → inline message, not a no-op
  | { state: "ok"; contextTags: string[] }; // REPLACES the current Context selection

// "Use my interests" (Section 9.7): explicit opt-in that REPLACES (never adds to)
// the current Context selection with the account's interest_domains. Guests get a
// disabled button (no query); logged-in accounts have the list fetched only at
// click time (this call), never pre-checked at page load.
export async function useMyInterests(
  accountId: string | null,
): Promise<UseMyInterestsResult> {
  if (!accountId) return { state: "guest" };
  const account = await prisma.account.findUniqueOrThrow({
    where: { account_id: accountId },
    select: { interest_domains: true },
  });
  if (account.interest_domains.length === 0) return { state: "empty" };
  return { state: "ok", contextTags: account.interest_domains };
}

// The guest-vs-logged-in button state is knowable at page load with no query:
// enabled iff there is an account.
export function isUseMyInterestsEnabled(accountId: string | null): boolean {
  return accountId != null;
}
