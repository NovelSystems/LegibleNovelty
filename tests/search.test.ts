import { afterAll, describe, expect, it } from "vitest";
import type { AiAttestation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  searchModules,
  scoreModule,
  attestationMultiplier,
  topicsForSubject,
  contextTagOptions,
  useMyInterests,
  isUseMyInterestsEnabled,
} from "@/lib/search";
import {
  homepageModules,
  mostRecentSignalOf,
  pickCascadeTier,
  buildHomepageResult,
  HOMEPAGE_EMPTY_MESSAGE,
  type HomepageWindow,
} from "@/lib/homepage";
import type { SearchResult } from "@/lib/search";
import { createEndorsement, createCommunityRecommendation } from "@/lib/endorsement";
import { publishModule, submitForReview as submitModule } from "@/lib/modules";
import { makeAccount } from "./helpers/factory";
import { makeTaxonomyPair, publishSeedFixture } from "./helpers/seed-factory";
import { makeModuleWithText } from "./helpers/module-factory";

const ids = (results: { module: { module_id: string } }[]) => results.map((r) => r.module.module_id);

// An account that passes the eligibility gate at any test `now` (created in 2020,
// verified email, interests + language).
async function makeEligible(createdAt = new Date("2020-01-01T00:00:00Z")) {
  const acct = await makeAccount();
  return prisma.account.update({
    where: { account_id: acct.account_id },
    data: {
      created_at: createdAt,
      interest_domains: ["math"],
      language_preference: ["en"],
      email_verified: new Date(),
    },
  });
}

interface ModuleOpts {
  attestation?: AiAttestation | null;
  contextTag?: string | null;
  complexity?: "beginner" | "intermediate" | "advanced";
  language?: string;
  downloads?: number;
  passingCompletions?: number;
  endorsements?: number;
  recommendations?: number;
  publicationDate?: Date;
  signalDate?: Date; // default timestamp for both signal types
  endorseDate?: Date; // overrides signalDate for endorsements
  recDate?: Date; // overrides signalDate for recommendations
  taxonomy?: { subject: { taxonomy_id: string }; topic: { taxonomy_id: string } };
}

// A fully-published module with controllable ranking inputs. Endorsements are
// real (N distinct VEs endorsing the primary seed); recommendations are real (N
// eligible accounts); downloads/completions are set directly (stubbed, since
// nothing populates them yet).
async function publishedModule(opts: ModuleOpts = {}) {
  const architect = await makeAccount();
  const tax = opts.taxonomy ?? (await makeTaxonomyPair({ subject: `X-${Math.random()}` }));
  const seed = await publishSeedFixture({
    architectId: architect.account_id,
    subjectId: tax.subject.taxonomy_id,
    topicId: tax.topic.taxonomy_id,
    language: opts.language,
  });
  if (opts.complexity) {
    await prisma.learningSeed.update({
      where: { seed_id: seed.seed_id },
      data: { complexity: opts.complexity },
    });
  }

  const author = await makeAccount();
  const pubDate = opts.publicationDate ?? new Date();
  const module = await makeModuleWithText(author.account_id, seed.seed_id, "content", pubDate);
  await submitModule(module.module_id, author.account_id, pubDate);
  await publishModule(module.module_id, author.account_id, pubDate);
  await prisma.contextualizedModule.update({
    where: { module_id: module.module_id },
    data: {
      ai_attestation: opts.attestation ?? null,
      context_tag: opts.contextTag ?? null,
      download_count: opts.downloads ?? 0,
      passing_completion_count: opts.passingCompletions ?? 0,
    },
  });

  const signalDate = opts.signalDate ?? pubDate;
  const endorseDate = opts.endorseDate ?? signalDate;
  const recDate = opts.recDate ?? signalDate;
  for (let i = 0; i < (opts.endorsements ?? 0); i++) {
    const ve = await makeAccount({ ve: true });
    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: ve.account_id }, endorseDate);
  }
  for (let i = 0; i < (opts.recommendations ?? 0); i++) {
    const u = await makeEligible();
    await createCommunityRecommendation(
      { moduleId: module.module_id, recommenderAccountId: u.account_id },
      recDate,
    );
  }

  return {
    module: await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: module.module_id } }),
    seed,
    author,
    architect,
    subject: tax.subject,
    topic: tax.topic,
  };
}

describe("Library — sort formulas + AI attestation multiplier (Sections 9.3–9.4)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("applies the multiplier only to weighted sorts and matches the worked example (9×10 beats 44×2)", () => {
    // The doc's worked example: a Wholly-Human module with 9 endorsements
    // outranks an AI-Assisted one with 44. With the full formula that is
    // (9×3)×10 = 270 vs (44×3)×2 = 264.
    const wh = { endorsements: 9, recommendations: 0, downloads: 0, passingCompletions: 0, aiAttestation: "wholly_human" as const, publicationDate: null };
    const ai = { endorsements: 44, recommendations: 0, downloads: 0, passingCompletions: 0, aiAttestation: "ai_assisted_manual_flair" as const, publicationDate: null };
    expect(scoreModule("weighted_approval", wh)).toBe(270);
    expect(scoreModule("weighted_approval", ai)).toBe(264);
    expect(scoreModule("weighted_approval", wh)).toBeGreaterThan(scoreModule("weighted_approval", ai));

    // Unweighted ignores the multiplier — now the 44-endorsement module wins.
    expect(scoreModule("unweighted_approval", wh)).toBe(27);
    expect(scoreModule("unweighted_approval", ai)).toBe(132);
  });

  it("computes usage sorts from stubbed downloads + passing completions", () => {
    const m = { endorsements: 0, recommendations: 0, downloads: 5, passingCompletions: 3, aiAttestation: "wholly_human" as const, publicationDate: null };
    expect(scoreModule("unweighted_usage", m)).toBe(8);
    expect(scoreModule("weighted_usage", m)).toBe(80); // (5+3) × 10
  });

  it("multiplier table: 10× / 2× / 1× and null → 1×", () => {
    expect(attestationMultiplier("wholly_human")).toBe(10);
    expect(attestationMultiplier("ai_assisted_manual_flair")).toBe(2);
    expect(attestationMultiplier("ai_pipeline")).toBe(1);
    expect(attestationMultiplier(null)).toBe(1);
  });

  it("recency scores by publication timestamp", () => {
    const older = { endorsements: 99, recommendations: 99, downloads: 0, passingCompletions: 0, aiAttestation: "wholly_human" as const, publicationDate: new Date("2020-01-01") };
    const newer = { endorsements: 0, recommendations: 0, downloads: 0, passingCompletions: 0, aiAttestation: null, publicationDate: new Date("2026-01-01") };
    expect(scoreModule("recency", newer)).toBeGreaterThan(scoreModule("recency", older));
  });
});

describe("Library — searchModules ordering + inversion (Section 9.3)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("orders by weighted approval and inverts on toggle", async () => {
    const tag = `sortgrp-${Math.random()}`;
    const low = await publishedModule({ contextTag: tag, attestation: "wholly_human", endorsements: 1 }); // (3)×10 = 30
    const high = await publishedModule({ contextTag: tag, attestation: "wholly_human", endorsements: 3 }); // (9)×10 = 90

    const asc = await searchModules({ contextTags: [tag] }, "weighted_approval");
    expect(ids(asc)).toEqual([high.module.module_id, low.module.module_id]);

    const inverted = await searchModules({ contextTags: [tag] }, "weighted_approval", { invert: true });
    expect(ids(inverted)).toEqual([low.module.module_id, high.module.module_id]);
  });

  it("lets a 10× Wholly-Human module outrank a 2× AI-Assisted module with MORE endorsements", async () => {
    const tag = `xover-${Math.random()}`;
    const human = await publishedModule({ contextTag: tag, attestation: "wholly_human", endorsements: 2 }); // (6)×10 = 60
    const ai = await publishedModule({ contextTag: tag, attestation: "ai_assisted_manual_flair", endorsements: 4 }); // (12)×2 = 24

    const weighted = await searchModules({ contextTags: [tag] }, "weighted_approval");
    expect(ids(weighted)[0]).toBe(human.module.module_id);

    // Under Unweighted, the multiplier is gone and the higher raw count wins.
    const unweighted = await searchModules({ contextTags: [tag] }, "unweighted_approval");
    expect(ids(unweighted)[0]).toBe(ai.module.module_id);
  });

  it("ranks usage sorts from stubbed download/completion counts (not blocked on PDF/Quiz)", async () => {
    const tag = `usage-${Math.random()}`;
    const a = await publishedModule({ contextTag: tag, attestation: "wholly_human", downloads: 2, passingCompletions: 0 }); // usage 2
    const b = await publishedModule({ contextTag: tag, attestation: "wholly_human", downloads: 1, passingCompletions: 5 }); // usage 6
    const res = await searchModules({ contextTags: [tag] }, "unweighted_usage");
    expect(ids(res)).toEqual([b.module.module_id, a.module.module_id]);
  });

  it("recency sort returns newest first", async () => {
    const tag = `rec-${Math.random()}`;
    const old = await publishedModule({ contextTag: tag, publicationDate: new Date("2025-01-01T00:00:00Z") });
    const mid = await publishedModule({ contextTag: tag, publicationDate: new Date("2025-06-01T00:00:00Z") });
    const fresh = await publishedModule({ contextTag: tag, publicationDate: new Date("2025-12-01T00:00:00Z") });
    const res = await searchModules({ contextTags: [tag] }, "recency");
    expect(ids(res)).toEqual([fresh.module.module_id, mid.module.module_id, old.module.module_id]);
  });
});

describe("Library — filters (Section 9.5)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("filters by context tag (IN), language, subject, topic, and attestation independently", async () => {
    const tax = await makeTaxonomyPair({ subject: `Filt-${Math.random()}` });
    const ctxA = `ctxA-${Math.random()}`;
    const ctxB = `ctxB-${Math.random()}`;
    const inScope = await publishedModule({ taxonomy: tax, contextTag: ctxA, language: "en", attestation: "wholly_human" });
    const otherCtx = await publishedModule({ taxonomy: tax, contextTag: ctxB, language: "en" });
    const otherLang = await publishedModule({ contextTag: ctxA, language: "fr" });

    // Context IN [ctxA] returns only ctxA modules.
    const byCtx = await searchModules({ contextTags: [ctxA] });
    expect(ids(byCtx).sort()).toEqual([inScope.module.module_id, otherLang.module.module_id].sort());

    // Language AND context narrows to the single English ctxA module.
    const byLangCtx = await searchModules({ contextTags: [ctxA], language: "en" });
    expect(ids(byLangCtx)).toEqual([inScope.module.module_id]);

    // Subject/topic filter (shared taxonomy) returns the two built on it.
    const bySubject = await searchModules({ subjectId: tax.subject.taxonomy_id });
    expect(ids(bySubject).sort()).toEqual([inScope.module.module_id, otherCtx.module.module_id].sort());

    // Attestation filter.
    const byAttest = await searchModules({ subjectId: tax.subject.taxonomy_id, aiAttestation: "wholly_human" });
    expect(ids(byAttest)).toEqual([inScope.module.module_id]);
  });

  it("complexity filter is an exact enum match on the primary seed (replaces grade_range)", async () => {
    const tag = `cx-${Math.random()}`;
    const beginner = await publishedModule({ contextTag: tag, complexity: "beginner" });
    const advanced = await publishedModule({ contextTag: tag, complexity: "advanced" });

    const res = await searchModules({ contextTags: [tag], complexity: "beginner" });
    expect(ids(res)).toEqual([beginner.module.module_id]);
    const res2 = await searchModules({ contextTags: [tag], complexity: "advanced" });
    expect(ids(res2)).toEqual([advanced.module.module_id]);
  });

  it("endorsement-status filter is binary on the primary seed (no threshold)", async () => {
    const tag = `endorsed-${Math.random()}`;
    const endorsed = await publishedModule({ contextTag: tag, endorsements: 1 });
    const unendorsed = await publishedModule({ contextTag: tag, endorsements: 0 });

    const yes = await searchModules({ contextTags: [tag], endorsementStatus: true });
    expect(ids(yes)).toEqual([endorsed.module.module_id]);
    const no = await searchModules({ contextTags: [tag], endorsementStatus: false });
    expect(ids(no)).toEqual([unendorsed.module.module_id]);
  });

  it("Context OR-within combines with other filters AND-across", async () => {
    const c1 = `or1-${Math.random()}`;
    const c2 = `or2-${Math.random()}`;
    const m1 = await publishedModule({ contextTag: c1, language: "en" });
    const m2 = await publishedModule({ contextTag: c2, language: "en" });
    await publishedModule({ contextTag: c1, language: "fr" }); // excluded by language AND

    const res = await searchModules({ contextTags: [c1, c2], language: "en" });
    expect(ids(res).sort()).toEqual([m1.module.module_id, m2.module.module_id].sort());
  });
});

// The homepage query is genuinely GLOBAL — it is the homepage, with no filter —
// so the cascade-tier selection, the two-signal recency rule, and the empty-state
// mapping are proven here with PURE unit tests on synthetic inputs. These are
// fully deterministic and depend on no shared-table state or test-execution order
// (unlike the earlier approach, which wiped the shared signal tables and leaned on
// serial file execution). The DB-backed tests that follow then only assert
// properties robust to whatever other data exists — set membership and the
// relative order of two specific modules — never exact global result sets or the
// globally-determined tier.
describe("Library — homepage cascade logic (pure, Section 9.6)", () => {
  const NOW = new Date("2026-08-01T00:00:00Z");
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

  it("mostRecentSignalOf returns the later signal, or whichever exists", () => {
    const older = daysAgo(100);
    const newer = daysAgo(1);
    expect(mostRecentSignalOf(older, newer)).toEqual(newer);
    expect(mostRecentSignalOf(newer, older)).toEqual(newer);
    expect(mostRecentSignalOf(older, null)).toEqual(older);
    expect(mostRecentSignalOf(null, newer)).toEqual(newer);
    expect(mostRecentSignalOf(null, null)).toBeNull();
  });

  it("cascades 2 weeks → 2 months → anytime by qualifying count", () => {
    const items = [
      { id: "a", mostRecentSignal: daysAgo(3) }, // in 2wk
      { id: "b", mostRecentSignal: daysAgo(30) }, // in 2mo, not 2wk
      { id: "c", mostRecentSignal: daysAgo(100) }, // only anytime
    ];
    // limit 1: the 2-week pool already has `a`.
    const t1 = pickCascadeTier(items, NOW, 1);
    expect(t1.windowUsed).toBe("2_weeks");
    expect([...t1.eligibleIds]).toEqual(["a"]);
    // limit 2: 2wk has 1 (<2) → widen to 2mo (a,b).
    const t2 = pickCascadeTier(items, NOW, 2);
    expect(t2.windowUsed).toBe("2_months");
    expect([...t2.eligibleIds].sort()).toEqual(["a", "b"]);
    // limit 5: neither windowed tier reaches it → anytime (all three).
    const t3 = pickCascadeTier(items, NOW, 5);
    expect(t3.windowUsed).toBe("anytime");
    expect([...t3.eligibleIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("keys the cascade off recommendation recency (endorsed long ago, recommended yesterday → 2-week tier)", () => {
    // A module endorsed 100 days ago (outside every window) but recommended
    // yesterday: its cascade signal is the recommendation, so it qualifies in the
    // 2-week tier — proof the recency rule is not endorsement-only.
    const refreshed = mostRecentSignalOf(daysAgo(100), daysAgo(1));
    const staleOnly = mostRecentSignalOf(daysAgo(100), null);
    const items = [
      { id: "refreshed", mostRecentSignal: refreshed! },
      { id: "stale", mostRecentSignal: staleOnly! },
    ];
    const t = pickCascadeTier(items, NOW, 1);
    expect(t.windowUsed).toBe("2_weeks");
    expect([...t.eligibleIds]).toEqual(["refreshed"]); // stale one excluded at 2wk
  });

  it("buildHomepageResult attaches the static empty message iff the list is empty", () => {
    expect(buildHomepageResult([], "anytime")).toEqual({
      results: [],
      windowUsed: "anytime" as HomepageWindow,
      emptyStateMessage: HOMEPAGE_EMPTY_MESSAGE,
    });
    const nonEmpty = [{ module: { module_id: "m" } } as unknown as SearchResult];
    const r = buildHomepageResult(nonEmpty, "2_weeks");
    expect(r.emptyStateMessage).toBeNull();
    expect(r.results).toBe(nonEmpty);
  });
});

describe("Library — homepage DB wiring (robust to pre-existing data, Section 9.6)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const NOW = new Date("2026-08-01T00:00:00Z");
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
  // A limit large enough that the cap never evicts our modules regardless of how
  // many other endorsed modules the shared DB already holds.
  const NO_EVICTION = 1_000_000;

  it("includes an endorsed, recently-signalled module and excludes an unendorsed one", async () => {
    const endorsed = await publishedModule({ endorsements: 1, signalDate: daysAgo(1), publicationDate: daysAgo(1) });
    const unendorsed = await publishedModule({ endorsements: 0, publicationDate: daysAgo(1) });

    const listed = ids((await homepageModules(NOW, NO_EVICTION)).results);
    expect(listed).toContain(endorsed.module.module_id); // in the public section
    expect(listed).not.toContain(unendorsed.module.module_id); // not promoted
  });

  it("surfaces a module endorsed long ago but recommended yesterday (recommendation refreshes recency, end to end)", async () => {
    // Endorsed 100 days ago (outside 2wk AND 2mo), recommended yesterday.
    const m = await publishedModule({
      endorsements: 1,
      recommendations: 1,
      endorseDate: daysAgo(100),
      recDate: daysAgo(1),
      publicationDate: daysAgo(100),
    });
    // Its endorsement alone would fall only in the anytime tier; the recommendation
    // pulls it into the 2-week window. Assert it is eligible in a 2-week-only view.
    // (Using a narrow computation robust to other data: the module must appear when
    // the homepage is asked with a limit small enough that the 2-week tier is used
    // globally is NOT guaranteed — so instead we assert membership, which holds in
    // any tier ≥ its signal, and rely on the pure test above for the tier proof.)
    const listed = ids((await homepageModules(NOW, NO_EVICTION)).results);
    expect(listed).toContain(m.module.module_id);
  });

  it("ranks a higher-weighted-approval module ahead of a lower one (relative order is data-independent)", async () => {
    const strong = await publishedModule({ endorsements: 3, attestation: "wholly_human", signalDate: daysAgo(1), publicationDate: daysAgo(1) }); // 90
    const weak = await publishedModule({ endorsements: 1, attestation: "wholly_human", signalDate: daysAgo(1), publicationDate: daysAgo(1) }); // 30

    const listed = ids((await homepageModules(NOW, NO_EVICTION)).results);
    expect(listed.indexOf(strong.module.module_id)).toBeLessThan(listed.indexOf(weak.module.module_id));
  });
});

describe("Library — Quick Search helpers (Section 9.7)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cascades Subject → Topic and lists context tags alphabetically", async () => {
    const subject = await prisma.taxonomy.create({ data: { level: "subject", name: `QS-${Math.random()}` } });
    const zebra = await prisma.taxonomy.create({ data: { level: "topic", name: "Zebra topic", parent_id: subject.taxonomy_id } });
    const apple = await prisma.taxonomy.create({ data: { level: "topic", name: "Apple topic", parent_id: subject.taxonomy_id } });

    const topics = await topicsForSubject(subject.taxonomy_id);
    const names = topics.map((t) => t.name);
    // Alphabetical.
    expect(names.indexOf("Apple topic")).toBeLessThan(names.indexOf("Zebra topic"));
    expect(topics.map((t) => t.taxonomy_id).sort()).toEqual([zebra.taxonomy_id, apple.taxonomy_id].sort());

    // Context tag options are distinct + alphabetical.
    const t1 = `zzctx-${Math.random()}`;
    const t2 = `aactx-${Math.random()}`;
    await publishedModule({ contextTag: t1 });
    await publishedModule({ contextTag: t2 });
    await publishedModule({ contextTag: t2 }); // duplicate → still distinct
    const opts = await contextTagOptions();
    expect(opts).toContain(t1);
    expect(opts).toContain(t2);
    expect(opts.indexOf(t2)).toBeLessThan(opts.indexOf(t1)); // aa before zz
    expect(opts.filter((o) => o === t2).length).toBe(1); // distinct
  });

  it("'Use my interests' replaces the Context selection; guest vs logged-in state differs", async () => {
    // Guest → disabled, no query.
    expect(isUseMyInterestsEnabled(null)).toBe(false);
    expect(await useMyInterests(null)).toEqual({ state: "guest" });

    // Logged-in with interests → returns them (to REPLACE current selection).
    const withInterests = await makeAccount();
    await prisma.account.update({
      where: { account_id: withInterests.account_id },
      data: { interest_domains: ["astronomy", "poetry"] },
    });
    expect(isUseMyInterestsEnabled(withInterests.account_id)).toBe(true);
    expect(await useMyInterests(withInterests.account_id)).toEqual({
      state: "ok",
      contextTags: ["astronomy", "poetry"],
    });

    // Logged-in with no interests → explicit empty state, not a silent no-op.
    const empty = await makeAccount();
    expect(await useMyInterests(empty.account_id)).toEqual({ state: "empty" });
  });
});
