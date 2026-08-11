import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createSeedDraft,
  createSeedRevision,
  getSeedRevisionHistory,
  publishSeed,
  submitForReview,
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
    topicId,    notes: "",
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
    // Publication is revision 1 (baseline), so the architect's first EDIT is
    // revision 2.
    expect(rev.revision_number).toBe(2);
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
      topicId: topic.taxonomy_id,      notes: "",
    });
    await expect(
      createSeedRevision({
        seedId: draft.seed_id,
        editorAccountId: architect.account_id,
        content: contentFor(subject.taxonomy_id, topic.taxonomy_id, "no"),
      }),
    ).rejects.toBeInstanceOf(SeedError);

    // History accumulates in order: baseline (rev 1) + two edits (rev 2, 3).
    const { seed, subject: s2, topic: t2 } = await publishedSeed(architect.account_id);
    await createSeedRevision({ seedId: seed.seed_id, editorAccountId: architect.account_id, content: contentFor(s2.taxonomy_id, t2.taxonomy_id, "v1") });
    await createSeedRevision({ seedId: seed.seed_id, editorAccountId: architect.account_id, content: contentFor(s2.taxonomy_id, t2.taxonomy_id, "v2") });
    const history = await getSeedRevisionHistory(seed.seed_id);
    expect(history.map((r) => r.revision_number)).toEqual([1, 2, 3]);
    // First is the publish-time baseline; the two edits follow in order.
    expect(history[0].made_as_moderator).toBe(false);
    expect(history.slice(1).map((r) => r.learning_objective)).toEqual(["v1", "v2"]);
  });

  it("records publication itself as revision 1 (baseline), before any edits", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { seed } = await publishedSeed(architect.account_id);

    // A freshly-published seed with no edits still has exactly one revision.
    const history = await getSeedRevisionHistory(seed.seed_id);
    expect(history).toHaveLength(1);
    const baseline = history[0];
    expect(baseline.revision_number).toBe(1);
    expect(baseline.editor_account_id).toBe(architect.account_id);
    expect(baseline.made_as_moderator).toBe(false);
    expect(baseline.edit_summary).toBeNull();

    // The baseline matches the seed's published content.
    const pub = await prisma.learningSeed.findUniqueOrThrow({
      where: { seed_id: seed.seed_id },
    });
    expect(baseline.learning_objective).toBe(pub.learning_objective);
    expect(baseline.subject_id).toBe(pub.subject_id);
    expect(baseline.topic_id).toBe(pub.topic_id);
    expect(baseline.language).toBe(pub.language);
  });

  it("baseline revision snapshots EVERY content field, and freezes taxonomy labels against later renames", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { subject, topic } = await makeTaxonomyPair({
      subject: `SnapSub-${Math.random()}`,
      topic: `SnapTop-${Math.random()}`,
    });

    // A prior published seed of the same architect, to be the structured
    // prerequisite link (assertOwnPrerequisite requires an own, non-deleted seed).
    const prior = await createSeedDraft({
      architectAccountId: architect.account_id,
      title: "Prior seed",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
    });
    await submitForReview(prior.seed_id, architect.account_id);
    await publishSeed(prior.seed_id, architect.account_id);

    // A fully-populated seed: every content/pedagogical field set to a distinct,
    // checkable value.
    const draft = await createSeedDraft({
      architectAccountId: architect.account_id,
      title: "Fully populated seed",
      learningObjective: "Recall single-digit products.",
      entryPrerequisite: "Can skip-count.",
      lessonSizeScope: "single-session",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
      notes: "catch-all notes",
      language: "es",
      algorithmicConstraints: { multiplier: [2, 9] },
      targetLearnerCharacteristics: "visual learners",
      isEnrichment: true,
      curriculumLoad: "worksheet",
      complexity: "beginner",
      content: "Worked examples and practice.",
      prerequisiteSeedId: prior.seed_id,
    });
    await submitForReview(draft.seed_id, architect.account_id);
    await publishSeed(draft.seed_id, architect.account_id);

    const baseline = (await getSeedRevisionHistory(draft.seed_id))[0];

    // Every content field survives into the snapshot.
    expect(baseline.title).toBe("Fully populated seed");
    expect(baseline.learning_objective).toBe("Recall single-digit products.");
    expect(baseline.entry_prerequisite).toBe("Can skip-count.");
    expect(baseline.lesson_size_scope).toBe("single-session");
    expect(baseline.subject_id).toBe(subject.taxonomy_id);
    expect(baseline.topic_id).toBe(topic.taxonomy_id);
    expect(baseline.target_learner_characteristics).toBe("visual learners");
    expect(baseline.language).toBe("es");
    expect(baseline.notes).toBe("catch-all notes");
    expect(baseline.algorithmic_constraints).toEqual({ multiplier: [2, 9] });
    expect(baseline.is_enrichment).toBe(true);
    expect(baseline.curriculum_load).toBe("worksheet");
    expect(baseline.complexity).toBe("beginner");
    expect(baseline.content).toBe("Worked examples and practice.");

    // Placement is stored as ids (FK follows the live node).
    expect(baseline.subject_id).toBe(subject.taxonomy_id);
    expect(baseline.topic_id).toBe(topic.taxonomy_id);
    // Prerequisite: the id (FK) AND the frozen title, per the design.
    expect(baseline.prerequisite_seed_id).toBe(prior.seed_id);
    expect(baseline.prerequisite_seed_title).toBe("Prior seed");

    // Subject/topic are FOREIGN KEYS — a Taxonomy rename FOLLOWS the id, it does
    // not freeze: the revision joined to its subject reflects the new name.
    await prisma.taxonomy.update({
      where: { taxonomy_id: subject.taxonomy_id },
      data: { name: "RENAMED SUBJECT" },
    });
    const joined = await prisma.seedRevision.findUniqueOrThrow({
      where: { revision_id: baseline.revision_id },
      include: { subject: true, prerequisite_seed: true },
    });
    expect(joined.subject_id).toBe(subject.taxonomy_id); // id unchanged
    expect(joined.subject.name).toBe("RENAMED SUBJECT"); // label follows the id

    // Prerequisite: the FK follows the live seed, but the frozen title stays as
    // of citation. Rename the prior seed's title and confirm both behaviors.
    await prisma.learningSeed.update({
      where: { seed_id: prior.seed_id },
      data: { title: "Prior seed RENAMED" },
    });
    const after = await prisma.seedRevision.findUniqueOrThrow({
      where: { revision_id: baseline.revision_id },
      include: { prerequisite_seed: true },
    });
    expect(after.prerequisite_seed_title).toBe("Prior seed"); // frozen
    expect(after.prerequisite_seed?.title).toBe("Prior seed RENAMED"); // FK follows live
  });
});
