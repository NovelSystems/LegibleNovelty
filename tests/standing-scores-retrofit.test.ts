import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSeedRevision, publishSeed, submitForReview } from "@/lib/seeds";
import { PublishQuotaError } from "@/lib/quota";
import {
  isScoreLocked,
  lockStandingScoreDirectly,
  StandingScoreError,
} from "@/lib/standing-scores";
import {
  flagVeConductReview,
  initiateConductReview,
  secondaryConfirmConductReview,
} from "@/lib/flags";
import { makeAccount } from "./helpers/factory";
import { makeTaxonomyPair, draftSeed, publishSeedFixture } from "./helpers/seed-factory";

describe("Standing Scores retrofit into the Seed Editor + flag wiring", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("DSS lock blocks seed CREATION for an account well within its quota", async () => {
    const architect = await makeAccount(); // 0 published seeds — far under the cap.
    const { subject, topic } = await makeTaxonomyPair();
    await lockStandingScoreDirectly({ accountId: architect.account_id, scoreType: "DSS", eventType: "lock" });

    // Blocked outright, independent of quota standing (a StandingScoreError, not
    // a PublishQuotaError — this is not a fourth quota tier).
    await expect(
      draftSeed({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id }),
    ).rejects.toBeInstanceOf(StandingScoreError);
  });

  it("DSS lock blocks PUBLISH even for an account within its quota", async () => {
    const architect = await makeAccount();
    const { subject, topic } = await makeTaxonomyPair();
    // Create + submit a seed BEFORE locking (creation allowed while unlocked).
    const seed = await draftSeed({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });
    await submitForReview(seed.seed_id, architect.account_id);

    await lockStandingScoreDirectly({ accountId: architect.account_id, scoreType: "DSS", eventType: "lock" });

    // Well within quota (0 published), yet publish is blocked by the DSS lock —
    // and the DSS check runs BEFORE quota, so the error is the lock, not quota.
    await expect(publishSeed(seed.seed_id, architect.account_id)).rejects.toBeInstanceOf(
      StandingScoreError,
    );
    await expect(publishSeed(seed.seed_id, architect.account_id)).rejects.not.toBeInstanceOf(
      PublishQuotaError,
    );
  });

  it("leaves a moderator's SeedRevision edit UNAFFECTED by the architect's DSS lock", async () => {
    const architect = await makeAccount({ endorsed: true });
    const moderator = await makeAccount();
    await prisma.account.update({ where: { account_id: moderator.account_id }, data: { role: "Moderator" } });
    const { subject, topic } = await makeTaxonomyPair();
    const seed = await publishSeedFixture({
      architectId: architect.account_id,
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
    });

    // Lock the architect's DSS AFTER publication.
    await lockStandingScoreDirectly({ accountId: architect.account_id, scoreType: "DSS", eventType: "lock" });

    // The moderator's accountability edit still works (separate permission path,
    // no DSS gate).
    const rev = await createSeedRevision({
      seedId: seed.seed_id,
      editorAccountId: moderator.account_id,
      content: {
        learningObjective: "Corrected objective.",
        entryPrerequisite: "prereq",
        lessonSizeScope: "single-session",
        subjectId: subject.taxonomy_id,
        topicId: topic.taxonomy_id,
        gradeRange: "ages 8-10",
        notes: "",
      },
      editSummary: "Removed vandalism.",
    });
    expect(rev.made_as_moderator).toBe(true);
  });

  it("a two-moderator confirmed ve_conduct_review triggers an ESS lock (supersedes Stage 1 Task 7)", async () => {
    const educator = await makeAccount({ ve: true });
    await prisma.account.update({ where: { account_id: educator.account_id }, data: { lnc_status: true } });
    const primary = await makeAccount();
    const secondary = await makeAccount();

    const flag = await flagVeConductReview({
      accountId: educator.account_id,
      reason: "Repeated conduct violations in reviews.",
    });
    await initiateConductReview(flag.flag_id, primary.account_id);
    await secondaryConfirmConductReview(flag.flag_id, secondary.account_id);

    // ESS lock fired: both credentials revoked and the ESS score is locked.
    const after = await prisma.account.findUniqueOrThrow({ where: { account_id: educator.account_id } });
    expect(after.ve_status).toBe(false);
    expect(after.lnc_status).toBe(false);
    expect(await isScoreLocked(educator.account_id, "ESS")).toBe(true);

    // The lock event carries the confirming (secondary) moderator + the reason.
    const ev = await prisma.standingScoreEvent.findFirstOrThrow({
      where: { account_id: educator.account_id, event_type: "ve_conduct_review_confirmed" },
    });
    expect(ev.moderator_account_id).toBe(secondary.account_id);
    expect(ev.explanation).toContain("conduct");
  });
});
