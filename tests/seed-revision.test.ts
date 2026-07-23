import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createSeedRevision,
  getSeedRevisionHistory,
  SeedError,
} from "@/lib/seeds";
import { makeAccount } from "./helpers/factory";
import { makeTaxonomyPair, publishSeedFixture } from "./helpers/seed-factory";

// Revision history is a "controlled document": a fixed owner (the seed's
// architect_account_id) plus a per-revision editor. Only the architect or a
// Moderator may create a revision; edits are exempt from the publish quota; the
// history is view-only (no restore).

async function publishedSeed(architectId: string) {
  const { subject, topic } = await makeTaxonomyPair({ subject: `Rev-${Date.now()}-${Math.random()}` });
  // Architect is past the endorsement threshold so the publish itself isn't
  // capped; unrelated to the revision logic under test.
  const seed = await publishSeedFixture({
    architectId,
    subjectId: subject.taxonomy_id,
    topicId: topic.taxonomy_id,
  });
  return { seed, subject, topic };
}

function contentFor(subjectId: string, topicId: string, objective: string) {
  return {
    learningObjective: objective,
    entryPrerequisite: "prereq",
    lessonSizeScope: "single-session",
    subjectId,
    topicId,
    gradeRange: "ages 8-10",
    notes: "",
  };
}

describe("SeedRevision — controlled-document edits", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lets the architect revise their own published seed (summary optional)", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { seed, subject, topic } = await publishedSeed(architect.account_id);

    const rev = await createSeedRevision({
      seedId: seed.seed_id,
      editorAccountId: architect.account_id,
      content: contentFor(subject.taxonomy_id, topic.taxonomy_id, "Sharper objective."),
      // No editSummary — optional for the architect's own edit.
    });
    expect(rev.revision_number).toBe(1);
    expect(rev.made_as_moderator).toBe(false);
    expect(rev.edit_summary).toBeNull();
    expect(rev.editor_account_id).toBe(architect.account_id);

    // The live seed reflects the edit; content snapshot is full, not a diff.
    const after = await prisma.learningSeed.findUniqueOrThrow({ where: { seed_id: seed.seed_id } });
    expect(after.learning_objective).toBe("Sharper objective.");
  });

  it("lets a Moderator revise someone else's seed WITH a mandatory summary, and rejects a missing summary", async () => {
    const architect = await makeAccount({ endorsed: true });
    const moderator = await makeAccount();
    await prisma.account.update({
      where: { account_id: moderator.account_id },
      data: { role: "Moderator" },
    });
    const { seed, subject, topic } = await publishedSeed(architect.account_id);

    // Missing summary on a moderator edit → rejected (mandatory).
    await expect(
      createSeedRevision({
        seedId: seed.seed_id,
        editorAccountId: moderator.account_id,
        content: contentFor(subject.taxonomy_id, topic.taxonomy_id, "Mod edit"),
      }),
    ).rejects.toBeInstanceOf(SeedError);

    // With a summary → allowed, and snapshotted as a moderator edit.
    const rev = await createSeedRevision({
      seedId: seed.seed_id,
      editorAccountId: moderator.account_id,
      content: contentFor(subject.taxonomy_id, topic.taxonomy_id, "Mod-corrected objective."),
      editSummary: "Fixed a factual error in the objective.",
    });
    expect(rev.made_as_moderator).toBe(true);
    expect(rev.edit_summary).toBe("Fixed a factual error in the objective.");
    expect(rev.editor_account_id).toBe(moderator.account_id);
  });

  it("keeps architect_account_id (the fixed owner) unchanged after a moderator's edit", async () => {
    const architect = await makeAccount({ endorsed: true });
    const moderator = await makeAccount();
    await prisma.account.update({
      where: { account_id: moderator.account_id },
      data: { role: "Moderator" },
    });
    const { seed, subject, topic } = await publishedSeed(architect.account_id);

    await createSeedRevision({
      seedId: seed.seed_id,
      editorAccountId: moderator.account_id,
      content: contentFor(subject.taxonomy_id, topic.taxonomy_id, "Moderator revision content."),
      editSummary: "Clarified scope.",
    });

    const after = await prisma.learningSeed.findUniqueOrThrow({ where: { seed_id: seed.seed_id } });
    // Owner is permanent — the moderator's edit records editor_account_id on the
    // revision, but never reassigns the document owner.
    expect(after.architect_account_id).toBe(architect.account_id);
  });

  it("rejects an edit from an account that is neither the architect nor a Moderator", async () => {
    const architect = await makeAccount({ endorsed: true });
    const stranger = await makeAccount(); // Community_Member, not the owner.
    const ve = await makeAccount({ ve: true }); // A VE is still not permitted.
    const { seed, subject, topic } = await publishedSeed(architect.account_id);

    await expect(
      createSeedRevision({
        seedId: seed.seed_id,
        editorAccountId: stranger.account_id,
        content: contentFor(subject.taxonomy_id, topic.taxonomy_id, "nope"),
        editSummary: "trying anyway",
      }),
    ).rejects.toBeInstanceOf(SeedError);

    await expect(
      createSeedRevision({
        seedId: seed.seed_id,
        editorAccountId: ve.account_id,
        content: contentFor(subject.taxonomy_id, topic.taxonomy_id, "nope"),
        editSummary: "trying anyway",
      }),
    ).rejects.toBeInstanceOf(SeedError);
  });

  it("only allows revisions on published seeds and exposes queryable, ordered history", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { subject, topic } = await makeTaxonomyPair({ subject: `RevDraft-${Date.now()}` });
    // A draft seed cannot be revised.
    const { createSeedDraft } = await import("@/lib/seeds");
    const draft = await createSeedDraft({
      architectAccountId: architect.account_id,
      learningObjective: "x",
      entryPrerequisite: "y",
      lessonSizeScope: "single-session",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
      gradeRange: "ages 8-10",
      notes: "",
    });
    await expect(
      createSeedRevision({
        seedId: draft.seed_id,
        editorAccountId: architect.account_id,
        content: contentFor(subject.taxonomy_id, topic.taxonomy_id, "no"),
      }),
    ).rejects.toBeInstanceOf(SeedError);

    // History accumulates in order across multiple edits of a published seed.
    const { seed, subject: s2, topic: t2 } = await publishedSeed(architect.account_id);
    await createSeedRevision({ seedId: seed.seed_id, editorAccountId: architect.account_id, content: contentFor(s2.taxonomy_id, t2.taxonomy_id, "v1") });
    await createSeedRevision({ seedId: seed.seed_id, editorAccountId: architect.account_id, content: contentFor(s2.taxonomy_id, t2.taxonomy_id, "v2") });
    const history = await getSeedRevisionHistory(seed.seed_id);
    expect(history.map((r) => r.revision_number)).toEqual([1, 2]);
    expect(history.map((r) => r.learning_objective)).toEqual(["v1", "v2"]);
  });
});
