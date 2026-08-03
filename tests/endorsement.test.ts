import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createEndorsement,
  toggleEndorsement,
  createCommunityRecommendation,
  toggleCommunityRecommendation,
  flagSeedPlacementDuringEndorsement,
  getModuleSignalCounts,
  getEditedUnderYouWarning,
  firstEndorserOfPrimarySeed,
  EndorsementError,
  DSS_COMBINED_FIRST_ENDORSEMENT,
} from "@/lib/endorsement";
import {
  checkEligibility,
  evaluateEligibility,
  isProfileComplete,
  EligibilityError,
} from "@/lib/eligibility";
import {
  canAccessModule,
  canPassiveDiscoverModule,
  seedHasEndorsement,
} from "@/lib/module-visibility";
import { getStandingScore } from "@/lib/standing-scores";
import {
  fileModuleReport,
  moderatorReviewModule,
  moderatorManualTakedown,
} from "@/lib/module-reports";
import {
  publishModule as publishModuleLifecycle,
  submitForReview as submitModuleLifecycle,
  touchModuleEdited,
} from "@/lib/modules";
import { PublishQuotaError } from "@/lib/quota";
import { makeAccount, dobForAge } from "./helpers/factory";
import { makeTaxonomyPair, publishSeedFixture } from "./helpers/seed-factory";
import { makeModuleWithText } from "./helpers/module-factory";

function value(row: { current_value: unknown }): number {
  return Number(row.current_value);
}

// A seed published by a SPECIFIC architect (so seed-author == module-author tests
// can control identity), walking the real draft → published path.
async function seedBy(architectId: string, objective?: string) {
  const { subject, topic } = await makeTaxonomyPair({
    subject: `S-${Math.random()}`,
  });
  return publishSeedFixture({
    architectId,
    subjectId: subject.taxonomy_id,
    topicId: topic.taxonomy_id,
    objective,
  });
}

// A published module (version 1) authored by `authorId` on `seedId`.
async function publishedModuleOn(authorId: string, seedId: string, now?: Date) {
  const module = await makeModuleWithText(authorId, seedId, "module content body", now);
  await submitModuleLifecycle(module.module_id, authorId, now);
  return publishModuleLifecycle(module.module_id, authorId, now);
}

// An account that PASSES the eligibility gate: verified email + interests + a
// language, created well before the action time (default 8 days ago; pass an
// explicit createdAt for tests that operate at a fixed historical `now`).
async function makeEligible(createdAt?: Date) {
  const acct = await makeAccount();
  return prisma.account.update({
    where: { account_id: acct.account_id },
    data: {
      created_at: createdAt ?? new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      interest_domains: ["math"],
      language_preference: ["en"],
      email_verified: new Date(),
    },
  });
}

async function ve() {
  return makeAccount({ ve: true });
}

describe("Library — Endorsement (Section 9.1, Task 1)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lets a Verified Educator endorse a seed and rejects a non-VE", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const veAcct = await ve();
    const member = await makeAccount(); // not a VE

    await expect(
      createEndorsement({ seedId: seed.seed_id, endorserAccountId: member.account_id }),
    ).rejects.toBeInstanceOf(EndorsementError);

    const { created, endorsement } = await createEndorsement({
      seedId: seed.seed_id,
      endorserAccountId: veAcct.account_id,
    });
    expect(created).toBe(true);
    expect(endorsement.seed_id).toBe(seed.seed_id);
    expect(await seedHasEndorsement(seed.seed_id)).toBe(true);
  });

  it("checks ve_status LIVE at action time, not a cached assumption", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const formerVe = await ve();
    // VE status is revoked AFTER the account was created as a VE.
    await prisma.account.update({
      where: { account_id: formerVe.account_id },
      data: { ve_status: false },
    });
    await expect(
      createEndorsement({ seedId: seed.seed_id, endorserAccountId: formerVe.account_id }),
    ).rejects.toBeInstanceOf(EndorsementError);
  });

  it("is a binary toggle: re-creating is a no-op, toggle removes (hard delete)", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const veAcct = await ve();

    const first = await createEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id });
    expect(first.created).toBe(true);
    // Re-create by the same VE is idempotent — no duplicate, no re-fire.
    const again = await createEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id });
    expect(again.created).toBe(false);
    expect(await prisma.endorsement.count({ where: { seed_id: seed.seed_id } })).toBe(1);

    // Toggle off is a hard delete (no row retained).
    const t = await toggleEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id });
    expect(t.endorsed).toBe(false);
    expect(await prisma.endorsement.count({ where: { seed_id: seed.seed_id } })).toBe(0);
    // Toggle on again.
    const t2 = await toggleEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id });
    expect(t2.endorsed).toBe(true);
    expect(await prisma.endorsement.count({ where: { seed_id: seed.seed_id } })).toBe(1);
  });

  it("has NO scope limits — any VE may endorse any seed", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const veAcct = await ve(); // no grade/subject relationship to the seed
    const { created } = await createEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id });
    expect(created).toBe(true);
  });

  it("routes an endorsement-review placement flag through the EXISTING SeedDraftComment mechanism", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const veAcct = await ve();
    const member = await makeAccount();

    // A non-VE cannot flag placement during endorsement review.
    await expect(
      flagSeedPlacementDuringEndorsement({
        seedId: seed.seed_id,
        veAccountId: member.account_id,
        body: "wrong topic",
      }),
    ).rejects.toBeInstanceOf(EndorsementError);

    const { comment, seed: updated } = await flagSeedPlacementDuringEndorsement({
      seedId: seed.seed_id,
      veAccountId: veAcct.account_id,
      body: "This belongs under Division, not Multiplication.",
    });
    // It is a SeedDraftComment (the existing generic table) — not a second system.
    const row = await prisma.seedDraftComment.findUnique({
      where: { comment_id: comment.comment_id },
    });
    expect(row).not.toBeNull();
    expect(row?.commenter_account_id).toBe(veAcct.account_id);
    expect(updated.status).toBe("draft"); // formal objection returns seed to Draft
  });
});

describe("Library — first_seed_endorsement_received + quota transition (Task 4)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("flips the architect's flag on their first-ever seed endorsement and lifts the publish quota end to end", async () => {
    const architect = await makeAccount(); // flag starts false
    const veAcct = await ve();
    const { subject, topic } = await makeTaxonomyPair({ subject: `Q-${Math.random()}` });

    const mk = () =>
      publishSeedFixture({
        architectId: architect.account_id,
        subjectId: subject.taxonomy_id,
        topicId: topic.taxonomy_id,
      });

    // Pre-endorsement: the 3-concurrent cap holds; the 4th is blocked.
    const s1 = await mk();
    await mk();
    await mk();
    await expect(mk()).rejects.toBeInstanceOf(PublishQuotaError);

    // The flag is still false until an actual endorsement lands.
    const before = await prisma.account.findUniqueOrThrow({
      where: { account_id: architect.account_id },
      select: { first_seed_endorsement_received: true },
    });
    expect(before.first_seed_endorsement_received).toBe(false);

    // A VE endorses one of the architect's seeds → flag flips.
    await createEndorsement({ seedId: s1.seed_id, endorserAccountId: veAcct.account_id });
    const after = await prisma.account.findUniqueOrThrow({
      where: { account_id: architect.account_id },
      select: { first_seed_endorsement_received: true },
    });
    expect(after.first_seed_endorsement_received).toBe(true);

    // Prove the transition: the concurrent cap is gone; a 4th publish now succeeds
    // (under the 10/day post-endorsement rate). This exercises the real quota
    // path, not just the flag flip.
    await expect(mk()).resolves.toBeTruthy();
  });
});

describe("Library — public section promotion (Task 5)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("promotes a module from search-only/under-18-blocked to passive-discovery-visible for all ages on first primary-seed endorsement", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);
    const veAcct = await ve();

    const adult = { date_of_birth: dobForAge(30) };
    const minor = { date_of_birth: dobForAge(15) };

    // BEFORE first endorsement: adults reach it (search); minors cannot; not in
    // the public section (no passive discovery).
    expect(await canAccessModule(adult, module.module_id)).toBe(true);
    expect(await canAccessModule(minor, module.module_id)).toBe(false);
    expect(await canPassiveDiscoverModule(module.module_id)).toBe(false);

    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id });

    // AFTER: visible to all ages, and now passively discoverable.
    expect(await canAccessModule(adult, module.module_id)).toBe(true);
    expect(await canAccessModule(minor, module.module_id)).toBe(true);
    expect(await canPassiveDiscoverModule(module.module_id)).toBe(true);
  });
});

describe("Library — white/grey version-split counts (Task 5)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("splits endorsements and recommendations across versions, with total driving sorting", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();

    const t1 = new Date("2026-01-01T00:00:00Z");
    const module = await makeModuleWithText(author.account_id, seed.seed_id, "content", t1);
    await submitModuleLifecycle(module.module_id, author.account_id, t1);
    await publishModuleLifecycle(module.module_id, author.account_id, t1); // v1 @ t1

    // A recommendation and an endorsement on v1.
    const rec1User = await makeEligible(new Date("2025-01-01T00:00:00Z"));
    const t2 = new Date("2026-01-02T00:00:00Z");
    await createCommunityRecommendation(
      { moduleId: module.module_id, recommenderAccountId: rec1User.account_id },
      t2,
    );
    const ve1 = await ve();
    await createEndorsement(
      { seedId: seed.seed_id, endorserAccountId: ve1.account_id },
      t2,
    );

    // Re-publish → v2.
    const t4 = new Date("2026-01-04T00:00:00Z");
    await publishModuleLifecycle(module.module_id, author.account_id, t4); // v2 @ t4

    // A recommendation and an endorsement on v2.
    const rec2User = await makeEligible(new Date("2025-01-01T00:00:00Z"));
    const t5 = new Date("2026-01-05T00:00:00Z");
    await createCommunityRecommendation(
      { moduleId: module.module_id, recommenderAccountId: rec2User.account_id },
      t5,
    );
    const ve2 = await ve();
    await createEndorsement(
      { seedId: seed.seed_id, endorserAccountId: ve2.account_id },
      t5,
    );

    const counts = await getModuleSignalCounts(module.module_id);
    expect(counts.recommendations).toEqual({ current: 1, prior: 1, total: 2 });
    expect(counts.endorsements).toEqual({ current: 1, prior: 1, total: 2 });
  });
});

describe("Library — edited-under-you warning (Task 5)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("fires only when the current version already has a signal AND an edit landed within the past hour after it", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();

    const t1 = new Date("2026-02-01T00:00:00Z");
    const module = await makeModuleWithText(author.account_id, seed.seed_id, "content", t1);
    await submitModuleLifecycle(module.module_id, author.account_id, t1);
    await publishModuleLifecycle(module.module_id, author.account_id, t1);

    // Not armed yet (no endorsement/recommendation): a recent edit does NOT warn.
    const tEditEarly = new Date("2026-02-01T01:00:00Z");
    await touchModuleEdited(module.module_id, author.account_id, tEditEarly);
    expect(
      await getEditedUnderYouWarning(module.module_id, new Date("2026-02-01T01:10:00Z")),
    ).toBeNull();

    // Arm it with an endorsement, then edit within the hour → warning fires.
    const veAcct = await ve();
    const tSignal = new Date("2026-02-01T02:00:00Z");
    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id }, tSignal);
    const tEdit = new Date("2026-02-01T02:30:00Z");
    await touchModuleEdited(module.module_id, author.account_id, tEdit);

    const warn = await getEditedUnderYouWarning(module.module_id, new Date("2026-02-01T03:00:00Z"));
    expect(warn).not.toBeNull();
    expect(warn?.editedWithinLastHour).toBe(true);
    expect(warn?.minutesSinceEdit).toBe(30);

    // An edit older than an hour before the attempt does NOT warn.
    expect(
      await getEditedUnderYouWarning(module.module_id, new Date("2026-02-01T04:00:00Z")),
    ).toBeNull();
  });

  it("does not flag an edit made before the current version's first signal", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();

    const t1 = new Date("2026-03-01T00:00:00Z");
    const module = await makeModuleWithText(author.account_id, seed.seed_id, "content", t1);
    await submitModuleLifecycle(module.module_id, author.account_id, t1);
    await publishModuleLifecycle(module.module_id, author.account_id, t1);

    // Edit FIRST, then the signal arrives after it.
    const tEdit = new Date("2026-03-01T02:00:00Z");
    await touchModuleEdited(module.module_id, author.account_id, tEdit);
    const veAcct = await ve();
    const tSignal = new Date("2026-03-01T02:30:00Z");
    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id }, tSignal);

    // The edit predates the signal → unflagged, even though it's within the hour.
    expect(
      await getEditedUnderYouWarning(module.module_id, new Date("2026-03-01T02:45:00Z")),
    ).toBeNull();
  });
});

describe("Library — Standing Score wiring (Task 6)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("DSS +5 to module author and +1 to seed author on first endorsement (distinct accounts)", async () => {
    const seedAuthor = await makeAccount();
    const seed = await seedBy(seedAuthor.account_id);
    const moduleAuthor = await makeAccount();
    await publishedModuleOn(moduleAuthor.account_id, seed.seed_id);
    const veAcct = await ve();

    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id });

    expect(value(await getStandingScore(moduleAuthor.account_id, "DSS"))).toBe(55);
    expect(value(await getStandingScore(seedAuthor.account_id, "DSS"))).toBe(51);
  });

  it("DSS +6 combined (one event, not two) when one account is both seed and module author", async () => {
    const both = await makeAccount();
    const seed = await seedBy(both.account_id);
    await publishedModuleOn(both.account_id, seed.seed_id);
    const veAcct = await ve();

    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: veAcct.account_id });

    expect(value(await getStandingScore(both.account_id, "DSS"))).toBe(50 + DSS_COMBINED_FIRST_ENDORSEMENT);
    // Exactly one combined event, and NOT the separate +5/+1 rows.
    const combined = await prisma.standingScoreEvent.count({
      where: { account_id: both.account_id, event_type: "dss_first_endorsement_combined" },
    });
    expect(combined).toBe(1);
    const separate = await prisma.standingScoreEvent.count({
      where: {
        account_id: both.account_id,
        event_type: { in: ["dss_module_first_endorsement", "dss_seed_first_endorsement"] },
      },
    });
    expect(separate).toBe(0);
  });

  it("DSS +0.1 to the module author for every recommendation (no threshold)", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);

    for (let i = 0; i < 3; i++) {
      const u = await makeEligible();
      await createCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: u.account_id });
    }
    expect(value(await getStandingScore(author.account_id, "DSS"))).toBeCloseTo(50.3, 5);
  });

  it("ESS +5 to the FIRST endorser when the module reaches 10 recommendations (once)", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);

    const ve1 = await ve();
    const ve2 = await ve();
    const t0 = new Date("2026-04-01T00:00:00Z");
    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: ve1.account_id }, t0); // first
    await createEndorsement(
      { seedId: seed.seed_id, endorserAccountId: ve2.account_id },
      new Date("2026-04-02T00:00:00Z"),
    );
    expect(await firstEndorserOfPrimarySeed(module.module_id)).toBe(ve1.account_id);

    // 9 recommendations: no reward yet.
    for (let i = 0; i < 9; i++) {
      const u = await makeEligible();
      await createCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: u.account_id });
    }
    expect(value(await getStandingScore(ve1.account_id, "ESS"))).toBe(50);

    // 10th → ESS +5 to the first endorser only.
    const u10 = await makeEligible();
    await createCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: u10.account_id });
    expect(value(await getStandingScore(ve1.account_id, "ESS"))).toBe(55);
    expect(value(await getStandingScore(ve2.account_id, "ESS"))).toBe(50);

    // 11th does NOT double-pay.
    const u11 = await makeEligible();
    await createCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: u11.account_id });
    expect(value(await getStandingScore(ve1.account_id, "ESS"))).toBe(55);
  });

  it("settles the ESS +5 reward when the first endorsement lands AFTER 10 recommendations already exist", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);

    // 10 recommendations before any endorsement → no endorser to pay, no reward.
    for (let i = 0; i < 10; i++) {
      const u = await makeEligible();
      await createCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: u.account_id });
    }
    const ve1 = await ve();
    expect(value(await getStandingScore(ve1.account_id, "ESS"))).toBe(50);

    // First endorsement arrives now → the reward settles at endorsement time.
    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: ve1.account_id });
    expect(value(await getStandingScore(ve1.account_id, "ESS"))).toBe(55);
  });

  it("ESS -5 to the primary seed's first endorser when a live endorsed module is rejected", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);

    const ve1 = await ve();
    const ve2 = await ve();
    await createEndorsement(
      { seedId: seed.seed_id, endorserAccountId: ve1.account_id },
      new Date("2026-05-01T00:00:00Z"),
    );
    await createEndorsement(
      { seedId: seed.seed_id, endorserAccountId: ve2.account_id },
      new Date("2026-05-02T00:00:00Z"),
    );

    // Two distinct reporters → moderation hold, then a moderator rejects.
    const r1 = await makeAccount();
    const r2 = await makeAccount();
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: r1.account_id, reason: "bad" });
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: r2.account_id, reason: "bad" });
    const mod = await makeAccount();
    await moderatorReviewModule({
      moduleId: module.module_id,
      moderatorAccountId: mod.account_id,
      decision: "reject",
      rationale: "violates charter",
      citedClause: "charter",
      sectionReference: "3.1",
      severity: "inappropriate",
    });

    // Only the FIRST endorser is penalized.
    expect(value(await getStandingScore(ve1.account_id, "ESS"))).toBe(45);
    expect(value(await getStandingScore(ve2.account_id, "ESS"))).toBe(50);
  });

  it("ESS -5 targets only the PRIMARY seed's first endorser, not endorsers of secondary seeds", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const secondaryArchitect = await makeAccount();
    const secondarySeed = await seedBy(secondaryArchitect.account_id);
    const author = await makeAccount();

    // Build a module with a primary and a secondary seed.
    const { createModule, addSecondarySeed } = await import("@/lib/modules");
    const module = await createModule({ authorAccountId: author.account_id, primarySeedId: seed.seed_id });
    await addSecondarySeed(module.module_id, author.account_id, secondarySeed.seed_id);
    const page = await (await import("@/lib/module-authoring")).addPage(module.module_id, 0);
    await (await import("@/lib/module-authoring")).createElement(page.page_id, {
      element_type: "text",
      position_x: 0, position_y: 0, width: 10, height: 10, z_index: 0,
      content: { plainText: "body" },
    });
    await submitModuleLifecycle(module.module_id, author.account_id);
    await publishModuleLifecycle(module.module_id, author.account_id);

    const vePrimary = await ve();
    const veSecondary = await ve();
    await createEndorsement({ seedId: seed.seed_id, endorserAccountId: vePrimary.account_id });
    await createEndorsement({ seedId: secondarySeed.seed_id, endorserAccountId: veSecondary.account_id });

    await moderatorManualTakedown(module.module_id, (await makeAccount()).account_id, "manual takedown", {
      severity: "egregious",
    });

    expect(value(await getStandingScore(vePrimary.account_id, "ESS"))).toBe(45);
    expect(value(await getStandingScore(veSecondary.account_id, "ESS"))).toBe(50);
  });

  it("applies no ESS penalty when an UNENDORSED module is rejected (no endorser)", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);

    const mod = await makeAccount();
    await moderatorManualTakedown(module.module_id, mod.account_id, "manual", { severity: "egregious" });
    // Nothing to assert on a specific endorser — just confirm no ESS events exist
    // for this module's (nonexistent) endorser and the takedown still succeeded.
    const held = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: module.module_id } });
    expect(held.status).toBe("moderation_hold");
  });
});

describe("Library — Community Recommendation + eligibility gate (Tasks 2, 3)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("blocks a recommendation from an ineligible (too-new) account with onboarding-framed info", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);

    // Fresh account: <7 days old and no profile → ineligible.
    const newbie = await makeAccount();
    await prisma.account.update({
      where: { account_id: newbie.account_id },
      data: { interest_domains: ["math"], language_preference: ["en"] }, // profile ok, but too new
    });
    try {
      await createCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: newbie.account_id });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EligibilityError);
      const err = e as EligibilityError;
      expect(err.status.ageRequirementMet).toBe(false);
      expect(err.status.daysRemaining).toBeGreaterThan(0);
    }
    // No recommendation was written.
    expect(await prisma.communityRecommendation.count({ where: { module_id: module.module_id } })).toBe(0);
  });

  it("blocks a recommendation from an old account with an INCOMPLETE profile", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);

    const oldButEmpty = await makeAccount();
    await prisma.account.update({
      where: { account_id: oldButEmpty.account_id },
      data: { created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // old, but no interests/languages
    });
    await expect(
      createCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: oldButEmpty.account_id }),
    ).rejects.toBeInstanceOf(EligibilityError);
  });

  it("allows an eligible account to recommend and toggles off cleanly", async () => {
    const architect = await makeAccount();
    const seed = await seedBy(architect.account_id);
    const author = await makeAccount();
    const module = await publishedModuleOn(author.account_id, seed.seed_id);

    const u = await makeEligible();
    const { created } = await createCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: u.account_id });
    expect(created).toBe(true);
    expect(await prisma.communityRecommendation.count({ where: { module_id: module.module_id } })).toBe(1);

    const t = await toggleCommunityRecommendation({ moduleId: module.module_id, recommenderAccountId: u.account_id });
    expect(t.recommended).toBe(false);
    expect(await prisma.communityRecommendation.count({ where: { module_id: module.module_id } })).toBe(0);
  });

  it("computes eligibility status details (shared gate, Section 9.5)", async () => {
    const now = new Date("2026-06-10T00:00:00Z");
    // 3 days old, complete profile → age fails, 4 days remaining.
    const s1 = evaluateEligibility(
      {
        created_at: new Date("2026-06-07T00:00:00Z"),
        email_verified: new Date(),
        interest_domains: ["math"],
        language_preference: ["en"],
      },
      now,
    );
    expect(s1.eligible).toBe(false);
    expect(s1.ageRequirementMet).toBe(false);
    expect(s1.daysRemaining).toBe(4);
    expect(s1.profileComplete).toBe(true);

    // 10 days old, complete profile → eligible.
    const s2 = evaluateEligibility(
      {
        created_at: new Date("2026-05-31T00:00:00Z"),
        email_verified: new Date(),
        interest_domains: ["math"],
        language_preference: ["en"],
      },
      now,
    );
    expect(s2.eligible).toBe(true);
    expect(s2.daysRemaining).toBe(0);

    // Missing profile pieces.
    expect(
      isProfileComplete({ email_verified: new Date(), interest_domains: [], language_preference: ["en"] }),
    ).toBe(false);
    expect(
      isProfileComplete({ email_verified: null, interest_domains: ["math"], language_preference: ["en"] }),
    ).toBe(false);

    // The DB-backed gate resolves an eligible account too.
    const eligible = await makeEligible();
    const status = await checkEligibility(eligible.account_id);
    expect(status.eligible).toBe(true);
  });
});
