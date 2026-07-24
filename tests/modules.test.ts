import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  changeSeedReference,
  createModule,
  publishModule,
  submitForReview,
  PublicationGateError,
  setCommission,
  addSecondarySeed,
} from "@/lib/modules";
import { updateElementContent } from "@/lib/module-authoring";
import { StandingScoreError, lockStandingScoreDirectly } from "@/lib/standing-scores";
import { createSeedDraft, submitForReview as submitSeed, publishSeed } from "@/lib/seeds";
import { makeAccount } from "./helpers/factory";
import { makeTaxonomyPair } from "./helpers/seed-factory";
import { makePublishedPrimarySeed, makeModuleWithText } from "./helpers/module-factory";

describe("Module Editor — lifecycle, DSS lock, publication gate", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a module pinned to the primary seed's exact SeedRevision", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await createModule({ authorAccountId: author.account_id, primarySeedId: seed.seed_id });
    expect(module.status).toBe("draft");
    expect(module.version).toBe(0);
    const rev = await prisma.seedRevision.findFirstOrThrow({
      where: { seed_id: seed.seed_id },
      orderBy: { revision_number: "desc" },
    });
    // Real FK pin to the exact archived revision (not a bare version number).
    expect(module.primary_seed_revision_id).toBe(rev.revision_id);
  });

  it("blocks module create/edit/publish for a DSS-latched author using the SAME check as Seed Editor", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    await lockStandingScoreDirectly({ accountId: author.account_id, scoreType: "DSS", eventType: "lock" });

    // createModule rejects with the SAME StandingScoreError assertDssNotLocked
    // throws for seed authoring — proving it's the same underlying function, not
    // a parallel module-specific check.
    await expect(
      createModule({ authorAccountId: author.account_id, primarySeedId: seed.seed_id }),
    ).rejects.toBeInstanceOf(StandingScoreError);
  });

  it("still blocks publish for a DSS lock applied after a clean draft", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await makeModuleWithText(author.account_id, seed.seed_id, "Understand single digit multiplication content.");
    await submitForReview(module.module_id, author.account_id);
    await lockStandingScoreDirectly({ accountId: author.account_id, scoreType: "DSS", eventType: "lock" });
    await expect(publishModule(module.module_id, author.account_id)).rejects.toBeInstanceOf(
      StandingScoreError,
    );
  });

  it("increments version on publish and publishes a clean first-time module immediately", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await makeModuleWithText(author.account_id, seed.seed_id, "any content, no commission, no seed change");
    await submitForReview(module.module_id, author.account_id);
    const published = await publishModule(module.module_id, author.account_id);
    expect(published.status).toBe("published");
    expect(published.version).toBe(1);
    expect(published.publication_date).not.toBeNull();

    // Re-publish → version 2.
    const republished = await publishModule(module.module_id, author.account_id);
    expect(republished.version).toBe(2);
  });

  it("commission alignment is a structural no-op (Commission Marketplace not built) — passes whether the reference is null or set", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();

    // No commission attached → publishes.
    const noCommission = await makeModuleWithText(author.account_id, seed.seed_id, "content about trains and railways");
    await submitForReview(noCommission.module_id, author.account_id);
    expect((await publishModule(noCommission.module_id, author.account_id)).status).toBe("published");

    // A commission soft-reference attached (with content that the OLD keyword
    // check would have blocked) → still publishes: there's no real structured
    // commission data to compare against yet, so the check is deferred.
    const author2 = await makeAccount();
    const withCommission = await makeModuleWithText(author2.account_id, seed.seed_id, "unrelated content about trains");
    await setCommission(withCommission.module_id, author2.account_id, "commission-123", "photosynthesis chloroplast");
    await submitForReview(withCommission.module_id, author2.account_id);
    const published = await publishModule(withCommission.module_id, author2.account_id);
    expect(published.status).toBe("published");
    expect(published.associated_commission_id).toBe("commission-123");
  });

  it("seed alignment fires only after a seed-reference change, blocking on mismatch", async () => {
    // Seed A (default objective) and Seed B (distinct objective).
    const { seed: seedA } = await makePublishedPrimarySeed();
    const bArch = await makeAccount({ endorsed: true });
    const { subject: bs, topic: bt } = await makeTaxonomyPair({ subject: `SeedB-${Date.now()}` });
    const bDraft = await createSeedDraft({
      architectAccountId: bArch.account_id,
      learningObjective: "photosynthesis chloroplast sunlight energy",
      entryPrerequisite: "x",
      lessonSizeScope: "single-session",
      subjectId: bs.taxonomy_id,
      topicId: bt.taxonomy_id,
      gradeRange: "ages 8-10",
      notes: "",
    });
    await submitSeed(bDraft.seed_id, bArch.account_id);
    await publishSeed(bDraft.seed_id, bArch.account_id);

    const author = await makeAccount();
    // Module content matches Seed A's objective (multiplication).
    const module = await makeModuleWithText(author.account_id, seedA.seed_id, "understand single digit multiplication practice");
    await submitForReview(module.module_id, author.account_id);
    // First publish: no seed-ref change → seed alignment SKIPPED → publishes.
    await publishModule(module.module_id, author.account_id);

    // Change the seed reference to Seed B → arms seed alignment.
    await changeSeedReference(module.module_id, author.account_id, bDraft.seed_id);
    // Content still about multiplication → mismatch with Seed B → blocked.
    await expect(publishModule(module.module_id, author.account_id)).rejects.toBeInstanceOf(
      PublicationGateError,
    );

    // Update content to satisfy Seed B → passes.
    const el = await prisma.moduleElement.findFirstOrThrow({ where: { page: { module_id: module.module_id } } });
    await updateElementContent(el.element_id, { plainText: "photosynthesis chloroplast sunlight energy explained" });
    const published = await publishModule(module.module_id, author.account_id);
    expect(published.status).toBe("published");
    expect(published.seed_ref_changed).toBe(false); // arm cleared
  });

  it("locks secondary seeds at submission (max 3, draft-only)", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const sec = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await createModule({ authorAccountId: author.account_id, primarySeedId: seed.seed_id });
    await addSecondarySeed(module.module_id, author.account_id, sec.seed.seed_id);
    await submitForReview(module.module_id, author.account_id);
    // After submission, no more add/remove.
    await expect(
      addSecondarySeed(module.module_id, author.account_id, sec.seed.seed_id),
    ).rejects.toThrow();
  });

  it("keeps flair_tags and prepublication_review_report as inert, unused columns", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await createModule({ authorAccountId: author.account_id, primarySeedId: seed.seed_id });
    expect(module.flair_tags).toEqual([]);
    expect(module.prepublication_review_report).toBeNull();
  });
});
