import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createSeedDraft,
  updateSeedDraft,
  publishDraft,
  assertSeedComplete,
  SeedError,
} from "@/lib/seeds";
import { makeAccount } from "./helpers/factory";
import { makeTaxonomyPair } from "./helpers/seed-factory";

// Seed Editor screen backend: the `title` column, the SAVE-vs-PUBLISH gates
// (updateSeedDraft / assertSeedComplete / publishDraft), and the fact that a
// draft PUBLISHES (the old promote-to-module button was dropped because
// promotion needs a published revision a draft doesn't have).
describe("Seed Editor — editor save/publish backend", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Fully-complete draft args (everything assertSeedComplete requires).
  async function completeDraft() {
    const architect = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();
    const seed = await createSeedDraft({
      architectAccountId: architect.account_id,
      title: "Single-digit multiplication fluency",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
      learningObjective: "Recall single-digit products fluently.",
      entryPrerequisite: "Can skip-count.",
      curriculumLoad: "worksheet",
      complexity: "beginner",
      content: "Worked examples and spaced practice.",
    });
    return { architect, subject, topic, seed };
  }

  it("stores a title, and defaults omitted optional text fields to empty (not null)", async () => {
    const architect = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();
    // Minimum save payload: title + subject + topic only.
    const seed = await createSeedDraft({
      architectAccountId: architect.account_id,
      title: "Just a title",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
    });
    expect(seed.title).toBe("Just a title");
    expect(seed.learning_objective).toBe("");
    expect(seed.entry_prerequisite).toBe("");
    expect(seed.notes).toBe("");
    expect(seed.curriculum_load).toBeNull();
    expect(seed.content).toBeNull();
    expect(seed.status).toBe("draft");
  });

  it("assertSeedComplete lists every missing field and passes on a complete seed", () => {
    expect(() =>
      assertSeedComplete({
        title: "",
        subject_id: null,
        topic_id: null,
        curriculum_load: null,
        complexity: null,
        entry_prerequisite: "  ",
        learning_objective: "",
        content: null,
      }),
    ).toThrowError(/title.*subject.*topic.*curriculumLoad.*complexity.*prerequisiteKnowledge.*learningOutcome.*content/);

    expect(() =>
      assertSeedComplete({
        title: "t",
        subject_id: "s",
        topic_id: "tp",
        curriculum_load: "worksheet",
        complexity: "beginner",
        entry_prerequisite: "p",
        learning_objective: "o",
        content: "c",
      }),
    ).not.toThrow();
  });

  it("updateSeedDraft patches only provided fields on a draft, owner-only", async () => {
    const { architect, seed } = await completeDraft();
    const stranger = await makeAccount();

    const updated = await updateSeedDraft(seed.seed_id, architect.account_id, {
      title: "Renamed",
      content: "Revised body.",
    });
    expect(updated.title).toBe("Renamed");
    expect(updated.content).toBe("Revised body.");
    // Untouched field kept its prior value.
    expect(updated.learning_objective).toBe("Recall single-digit products fluently.");

    // A non-owner cannot edit.
    await expect(
      updateSeedDraft(seed.seed_id, stranger.account_id, { title: "hijack" }),
    ).rejects.toBeInstanceOf(SeedError);
  });

  it("updateSeedDraft re-validates placement when subject/topic change", async () => {
    const { architect, seed, subject } = await completeDraft();
    // A Topic that is NOT under this subject is rejected.
    const otherPair = await makeTaxonomyPair({ subject: "Science", topic: "Cells" });
    await expect(
      updateSeedDraft(seed.seed_id, architect.account_id, {
        subjectId: subject.taxonomy_id,
        topicId: otherPair.topic.taxonomy_id,
      }),
    ).rejects.toBeInstanceOf(SeedError);
  });

  it("publishDraft blocks an incomplete draft and stays a Draft", async () => {
    const architect = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();
    const draft = await createSeedDraft({
      architectAccountId: architect.account_id,
      title: "Incomplete",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
      // no curriculumLoad / complexity / content
    });
    await expect(
      publishDraft(draft.seed_id, architect.account_id),
    ).rejects.toBeInstanceOf(SeedError);
    const after = await prisma.learningSeed.findUniqueOrThrow({
      where: { seed_id: draft.seed_id },
    });
    expect(after.status).toBe("draft");
  });

  it("publishDraft publishes a complete draft and writes the baseline revision", async () => {
    const { architect, seed } = await completeDraft();
    const published = await publishDraft(seed.seed_id, architect.account_id);
    expect(published.status).toBe("published");
    expect(published.published_at).not.toBeNull();
    const revisions = await prisma.seedRevision.count({
      where: { seed_id: seed.seed_id },
    });
    expect(revisions).toBe(1);
  });

  it("publishDraft refuses a seed that is not a draft", async () => {
    const { architect, seed } = await completeDraft();
    await publishDraft(seed.seed_id, architect.account_id);
    // Second attempt: it is now published, not a draft.
    await expect(
      publishDraft(seed.seed_id, architect.account_id),
    ).rejects.toBeInstanceOf(SeedError);
  });

  // --- Structured prerequisite-seed link ------------------------------------

  it("stores a prerequisite link to the author's own prior seed", async () => {
    const { architect, subject, topic, seed: prior } = await completeDraft();
    const next = await createSeedDraft({
      architectAccountId: architect.account_id,
      title: "Next in sequence",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
      prerequisiteSeedId: prior.seed_id,
    });
    expect(next.prerequisite_seed_id).toBe(prior.seed_id);
  });

  it("rejects a prerequisite that is not one of the author's own seeds", async () => {
    const owner = await completeDraft(); // owner + a seed
    const stranger = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();
    await expect(
      createSeedDraft({
        architectAccountId: stranger.account_id,
        title: "Points at someone else's seed",
        subjectId: subject.taxonomy_id,
        topicId: topic.taxonomy_id,
        prerequisiteSeedId: owner.seed.seed_id,
      }),
    ).rejects.toBeInstanceOf(SeedError);
  });

  it("updateSeedDraft sets, clears, and refuses a self-referential prerequisite", async () => {
    const { architect, subject, topic, seed } = await completeDraft();
    const prior = await createSeedDraft({
      architectAccountId: architect.account_id,
      title: "A prior seed",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
    });

    const linked = await updateSeedDraft(seed.seed_id, architect.account_id, {
      prerequisiteSeedId: prior.seed_id,
    });
    expect(linked.prerequisite_seed_id).toBe(prior.seed_id);

    // "" clears it back to null (no FK).
    const cleared = await updateSeedDraft(seed.seed_id, architect.account_id, {
      prerequisiteSeedId: "",
    });
    expect(cleared.prerequisite_seed_id).toBeNull();

    // A seed cannot be its own prerequisite.
    await expect(
      updateSeedDraft(seed.seed_id, architect.account_id, {
        prerequisiteSeedId: seed.seed_id,
      }),
    ).rejects.toBeInstanceOf(SeedError);
  });
});
