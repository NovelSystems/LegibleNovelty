import { afterAll, beforeEach, describe, expect, it } from "vitest";
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
import { homepageModules, HOMEPAGE_EMPTY_MESSAGE } from "@/lib/homepage";
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
  gradeRange?: string;
  language?: string;
  downloads?: number;
  passingCompletions?: number;
  endorsements?: number;
  recommendations?: number;
  publicationDate?: Date;
  signalDate?: Date;
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
  if (opts.gradeRange) {
    await prisma.learningSeed.update({
      where: { seed_id: seed.seed_id },
      data: { grade_range: opts.gradeRange },
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
  for (let i = 0; i < (opts.endorsements ?? 0); i++) {
    const ve = await makeAccount({ ve: true });
    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: ve.account_id }, signalDate);
  }
  for (let i = 0; i < (opts.recommendations ?? 0); i++) {
    const u = await makeEligible();
    await createCommunityRecommendation(
      { moduleId: module.module_id, recommenderAccountId: u.account_id },
      signalDate,
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

  it("grade-level filter is a SUBSTRING match against free-text grade_range, not a numeric range", async () => {
    const tag = `grade-${Math.random()}`;
    const fifth = await publishedModule({ contextTag: tag, gradeRange: "around 5th grade, ages 10-11" });
    const eighth = await publishedModule({ contextTag: tag, gradeRange: "8th grade" });

    const res = await searchModules({ contextTags: [tag], gradeRange: "5th grade" });
    expect(ids(res)).toEqual([fifth.module.module_id]);
    // Case-insensitive substring.
    const res2 = await searchModules({ contextTags: [tag], gradeRange: "8TH GRADE" });
    expect(ids(res2)).toEqual([eighth.module.module_id]);
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

describe("Library — homepage cascading window (Section 9.6)", () => {
  // The homepage scans globally (it IS the homepage — no filter). The shared test
  // DB carries endorsed modules from other files, so before each homepage test we
  // clear the two LEAF signal tables (FK-safe; nothing references them). That
  // empties the public-section pool so each test's own modules are the only
  // endorsed/discoverable ones. Modules from other files remain but are now
  // unendorsed → excluded from the homepage, exactly as an unendorsed module
  // should be. This runs during this file's execution only (files run serially),
  // so it never races another file's data.
  beforeEach(async () => {
    await prisma.communityRecommendation.deleteMany({});
    await prisma.endorsement.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const NOW = new Date("2026-08-01T00:00:00Z");
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

  it("uses the 2-week tier when enough modules qualify, else widens to 2 months", async () => {
    // limit=2 so the cascade is exercisable with a few modules.
    const recent = await publishedModule({ endorsements: 2, signalDate: daysAgo(3), publicationDate: daysAgo(3) });
    const monthOld = await publishedModule({ endorsements: 1, signalDate: daysAgo(30), publicationDate: daysAgo(30) });
    await publishedModule({ endorsements: 1, signalDate: daysAgo(100), publicationDate: daysAgo(100) });

    const res = await homepageModules(NOW, 2);
    // 2-week pool has only `recent` (1 < 2) → widen to 2 months, which has 2.
    expect(res.windowUsed).toBe("2_months");
    expect(ids(res.results).sort()).toEqual([recent.module.module_id, monthOld.module.module_id].sort());
    expect(res.emptyStateMessage).toBeNull();
  });

  it("uses the 2-week tier directly when enough recent modules qualify", async () => {
    const a = await publishedModule({ endorsements: 1, signalDate: daysAgo(2), publicationDate: daysAgo(2) });
    const b = await publishedModule({ endorsements: 1, signalDate: daysAgo(5), publicationDate: daysAgo(5) });
    await publishedModule({ endorsements: 1, signalDate: daysAgo(90), publicationDate: daysAgo(90) }); // old, excluded

    const res = await homepageModules(NOW, 2);
    expect(res.windowUsed).toBe("2_weeks");
    expect(ids(res.results).sort()).toEqual([a.module.module_id, b.module.module_id].sort());
  });

  it("falls through to the anytime tier when nothing is recent", async () => {
    const old1 = await publishedModule({ endorsements: 1, signalDate: daysAgo(200), publicationDate: daysAgo(200) });
    const res = await homepageModules(NOW, 2);
    expect(res.windowUsed).toBe("anytime");
    expect(ids(res.results)).toEqual([old1.module.module_id]);
  });

  it("excludes unendorsed (non-public-section) modules and ranks by weighted approval", async () => {
    const strong = await publishedModule({ endorsements: 3, attestation: "wholly_human", signalDate: daysAgo(1), publicationDate: daysAgo(1) }); // 90
    const weak = await publishedModule({ endorsements: 1, attestation: "wholly_human", signalDate: daysAgo(1), publicationDate: daysAgo(1) }); // 30
    const unendorsed = await publishedModule({ endorsements: 0, signalDate: daysAgo(1), publicationDate: daysAgo(1) });

    const res = await homepageModules(NOW, 20);
    const listed = ids(res.results);
    expect(listed).not.toContain(unendorsed.module.module_id);
    expect(listed).toEqual([strong.module.module_id, weak.module.module_id]); // strong ranks first
  });

  it("renders the static empty-state message when nothing qualifies", async () => {
    // Clean slate (beforeEach wiped signals); create only an UNENDORSED module —
    // it is not in the public section, so the homepage has nothing to show.
    await publishedModule({ endorsements: 0, publicationDate: daysAgo(1) });
    const res = await homepageModules(NOW, 20);
    expect(res.results.length).toBe(0);
    expect(res.emptyStateMessage).toBe(HOMEPAGE_EMPTY_MESSAGE);
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
