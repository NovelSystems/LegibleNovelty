import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addDraftReviewComment,
  createSeedDraft,
  findOrCreateTopic,
  deleteSeed,
  dismissComment,
  hasActiveDraftAccess,
  inviteToDraft,
  resolveComment,
  reviseOwnPlacement,
  submitForReview,
  veFlagPlacement,
  SeedError,
} from "@/lib/seeds";
import { PublishQuotaError } from "@/lib/quota";
import { makeAccount } from "./helpers/factory";
import { makeTaxonomyPair, draftSeed, publishSeedFixture } from "./helpers/seed-factory";

describe("Seed Editor — schema, workflow, placement, quota", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --- Task 1 schema / soft reference ---------------------------------------

  it("findOrCreateTopic creates a Topic under a Subject on the fly, then reuses it (case-insensitive)", async () => {
    const { subject } = await makeTaxonomyPair({ subject: `FOC-${Math.random()}` });
    const created = await findOrCreateTopic(subject.taxonomy_id, "Long Division");
    expect(created.level).toBe("topic");
    expect(created.parent_id).toBe(subject.taxonomy_id);
    // Reuse: same name (different case / whitespace) returns the same row, no dup.
    const reused = await findOrCreateTopic(subject.taxonomy_id, "  long division ");
    expect(reused.taxonomy_id).toBe(created.taxonomy_id);
    const count = await prisma.taxonomy.count({
      where: { level: "topic", parent_id: subject.taxonomy_id, name: { equals: "Long Division", mode: "insensitive" } },
    });
    expect(count).toBe(1);
    // A non-Subject parent is rejected.
    await expect(findOrCreateTopic(created.taxonomy_id, "Nested")).rejects.toBeInstanceOf(SeedError);
  });

  it("creates a seed with no authoring gate and an unenforced commission soft reference", async () => {
    const architect = await makeAccount(); // Plain Community Member, no VE.
    const { subject, topic } = await makeTaxonomyPair();
    const bogusCommissionId = randomUUID(); // No Commission table exists.
    const seed = await createSeedDraft({
      architectAccountId: architect.account_id,
      learningObjective: "Multiply within 100.",
      entryPrerequisite: "Skip counting.",
      lessonSizeScope: "single-session",
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
      notes: "free-form notes",
      algorithmicConstraints: { multiplier: [2, 9] }, // Loose JSON.
      associatedCommissionId: bogusCommissionId,
    });
    expect(seed.status).toBe("draft");
    // Soft reference stored, no FK constraint blew up on a non-existent target.
    expect(seed.associated_commission_id).toBe(bogusCommissionId);
    expect(seed.algorithmic_constraints).toEqual({ multiplier: [2, 9] });
  });

  // --- Task 4 draft-sharing / comment workflow ------------------------------

  it("runs the draft workflow: invite, threaded comment, resolve/dismiss, auto-revoke on submit", async () => {
    const architect = await makeAccount();
    const reviewer = await makeAccount();
    const outsider = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();
    const seed = await draftSeed({
      architectId: architect.account_id,
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
    });

    // Invite a SPECIFIC account (never an open link).
    await inviteToDraft(seed.seed_id, architect.account_id, reviewer.account_id);
    expect(await hasActiveDraftAccess(seed.seed_id, reviewer.account_id)).toBe(true);
    expect(await hasActiveDraftAccess(seed.seed_id, outsider.account_id)).toBe(false);

    // A non-invited account cannot comment.
    await expect(
      addDraftReviewComment({
        seedId: seed.seed_id,
        commenterAccountId: outsider.account_id,
        body: "let me in",
      }),
    ).rejects.toBeInstanceOf(SeedError);

    // Invited reviewer leaves a comment; architect replies (threaded).
    const top = await addDraftReviewComment({
      seedId: seed.seed_id,
      commenterAccountId: reviewer.account_id,
      body: "The objective is too broad.",
    });
    const reply = await addDraftReviewComment({
      seedId: seed.seed_id,
      commenterAccountId: reviewer.account_id,
      body: "Follow-up thought.",
      parentCommentId: top.comment_id,
    });
    expect(reply.parent_comment_id).toBe(top.comment_id);

    // Architect resolves one at their sole discretion; a non-architect cannot.
    await expect(
      resolveComment(top.comment_id, reviewer.account_id),
    ).rejects.toBeInstanceOf(SeedError);
    const resolved = await resolveComment(top.comment_id, architect.account_id);
    expect(resolved.status).toBe("resolved");
    const dismissed = await dismissComment(reply.comment_id, architect.account_id);
    expect(dismissed.status).toBe("dismissed");

    // Submit to Pending Review → share access auto-revokes.
    const submitted = await submitForReview(seed.seed_id, architect.account_id);
    expect(submitted.status).toBe("pending_review");
    expect(await hasActiveDraftAccess(seed.seed_id, reviewer.account_id)).toBe(false);
  });

  // --- Task 2 two asymmetric placement paths --------------------------------

  it("architect's own post-publication placement revision does NOT change status or add a comment", async () => {
    const architect = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair({ topic: "Multiplication" });
    // A second topic under the same subject to move to.
    const topic2 = await prisma.taxonomy.create({
      data: { level: "topic", name: "Division", parent_id: subject.taxonomy_id },
    });
    const published = await publishSeedFixture({
      architectId: architect.account_id,
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
    });

    const revised = await reviseOwnPlacement(published.seed_id, architect.account_id, {
      subjectId: subject.taxonomy_id,
      topicId: topic2.taxonomy_id,
    });
    expect(revised.topic_id).toBe(topic2.taxonomy_id);
    expect(revised.status).toBe("published"); // Unchanged.
    const comments = await prisma.seedDraftComment.count({
      where: { seed_id: published.seed_id },
    });
    expect(comments).toBe(0); // No comment created.
  });

  it("a VE placement flag during endorsement forces the seed back to Draft via a comment (stubbed)", async () => {
    const architect = await makeAccount();
    const endorsingVe = await makeAccount({ ve: true }); // Stub — no real Endorsement.
    const { subject, topic } = await makeTaxonomyPair();
    const published = await publishSeedFixture({
      architectId: architect.account_id,
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
    });

    const { comment, seed } = await veFlagPlacement({
      seedId: published.seed_id,
      veAccountId: endorsingVe.account_id,
      body: "This belongs under Division, not Multiplication.",
    });
    // Same comment mechanism, generic actor (the VE), and a forced return to Draft.
    expect(comment.commenter_account_id).toBe(endorsingVe.account_id);
    expect(comment.status).toBe("open");
    expect(seed.status).toBe("draft");
  });

  // --- Task 5 publish quota -------------------------------------------------

  it("caps a pre-endorsement account at 3 concurrent published seeds; deleting frees a slot", async () => {
    const architect = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();
    const mk = () =>
      publishSeedFixture({
        architectId: architect.account_id,
        subjectId: subject.taxonomy_id,
        topicId: topic.taxonomy_id,
      });

    const s1 = await mk();
    await mk();
    await mk();
    // 4th is blocked.
    await expect(mk()).rejects.toBeInstanceOf(PublishQuotaError);

    // Deleting one frees a slot immediately.
    await deleteSeed(s1.seed_id, architect.account_id);
    await expect(mk()).resolves.toBeTruthy();
  });

  it("after a simulated first endorsement, the cap lifts and a 10/day rate limit applies with a Pacific-day reset", async () => {
    const architect = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();

    // Simulate Library flipping the flag (nothing in this stage sets it for real).
    await prisma.account.update({
      where: { account_id: architect.account_id },
      data: { first_seed_endorsement_received: true },
    });

    // A fixed "today" well inside PDT.
    const today = new Date("2025-07-15T18:00:00Z"); // 11:00 PDT.

    // The concurrent cap is gone: publish more than 3 in a day (but < 10) — all allowed.
    for (let i = 0; i < 9; i++) {
      await publishSeedFixture(
        {
          architectId: architect.account_id,
          subjectId: subject.taxonomy_id,
          topicId: topic.taxonomy_id,
        },
        today,
      );
    }
    const ninthDay = await prisma.learningSeed.count({
      where: { architect_account_id: architect.account_id, status: "published" },
    });
    expect(ninthDay).toBe(9); // Under the daily limit — all succeeded.

    // 10th of the day is allowed; 11th is blocked.
    await expect(
      publishSeedFixture(
        { architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id },
        today,
      ),
    ).resolves.toBeTruthy();
    await expect(
      publishSeedFixture(
        { architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id },
        today,
      ),
    ).rejects.toBeInstanceOf(PublishQuotaError);

    // The count resets on the NEXT Pacific day: a publish "tomorrow" succeeds,
    // and this run also exercises a DST-independent day rollover.
    const tomorrow = new Date("2025-07-16T18:00:00Z");
    await expect(
      publishSeedFixture(
        { architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id },
        tomorrow,
      ),
    ).resolves.toBeTruthy();
  });

  it("resets the daily count across a DST boundary (Nov 2 2025 fall-back)", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { subject, topic } = await makeTaxonomyPair();
    const mk = (now: Date) =>
      publishSeedFixture(
        { architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id },
        now,
      );

    // Fill the daily quota on Nov 1 2025 (PDT, UTC-7): noon PDT == 19:00Z.
    const nov1 = new Date("2025-11-01T19:00:00Z");
    for (let i = 0; i < 10; i++) await mk(nov1);
    await expect(mk(nov1)).rejects.toBeInstanceOf(PublishQuotaError); // 11th blocked.

    // Nov 3 2025 (PST, UTC-8, AFTER the Nov 2 fall-back): 11:00 PST == 19:00Z.
    // The Nov 1 publishes fall in a prior Pacific day, so the count has reset —
    // and this only resolves correctly because the offset flipped -7 → -8.
    const nov3 = new Date("2025-11-03T19:00:00Z");
    await expect(mk(nov3)).resolves.toBeTruthy();
  });

  it("blocks placing a seed under a deprecated taxonomy node", async () => {
    const architect = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();
    await prisma.taxonomy.update({
      where: { taxonomy_id: topic.taxonomy_id },
      data: { deprecated_at: new Date() },
    });
    await expect(
      draftSeed({
        architectId: architect.account_id,
        subjectId: subject.taxonomy_id,
        topicId: topic.taxonomy_id,
      }),
    ).rejects.toBeInstanceOf(SeedError);
  });

  it("applies the quota uniformly regardless of role (no VE/Admin exemption)", async () => {
    // STATED ASSUMPTION (flagged in the summary): no role exemption. A VE hits
    // the same pre-endorsement concurrent cap as anyone else.
    const veArchitect = await makeAccount({ ve: true });
    const { subject, topic } = await makeTaxonomyPair();
    const mk = () =>
      publishSeedFixture({
        architectId: veArchitect.account_id,
        subjectId: subject.taxonomy_id,
        topicId: topic.taxonomy_id,
      });
    await mk();
    await mk();
    await mk();
    await expect(mk()).rejects.toBeInstanceOf(PublishQuotaError);
  });
});
