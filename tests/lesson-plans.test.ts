import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { publishModule, submitForReview } from "@/lib/modules";
import {
  addModuleToPlan,
  assignLessonPlan,
  completionSubmissionPrompts,
  createLessonPlan,
  getLessonPlanSequence,
  removeModuleFromPlan,
  reorderPlanModules,
} from "@/lib/lesson-plans";
import {
  buildAssignerDashboard,
  type CompletionSignal,
} from "@/lib/lesson-plan-dashboard";
import {
  CSS_CREATOR_EGREGIOUS,
  CSS_CREATOR_STANDARD,
  fileLessonPlanReport,
  listPendingLessonPlanReports,
  LessonPlanReportError,
  resolveLessonPlanReportUnfounded,
  resolveLessonPlanReportUpheld,
} from "@/lib/lesson-plan-reports";
import { fileSeedReport } from "@/lib/seed-reports";
import { getStandingScore, lockStandingScoreDirectly } from "@/lib/standing-scores";
import { makeAccount } from "./helpers/factory";
import { makePublishedPrimarySeed, makeModuleWithText } from "./helpers/module-factory";

function value(row: { current_value: unknown }): number {
  return Number(row.current_value);
}

// A published module authored by a fresh author, returned with its author.
async function publishedModule(text = "module content") {
  const { seed } = await makePublishedPrimarySeed();
  const author = await makeAccount();
  const module = await makeModuleWithText(author.account_id, seed.seed_id, text);
  await submitForReview(module.module_id, author.account_id);
  const published = await publishModule(module.module_id, author.account_id);
  return { module: published, author };
}

describe("Lesson Planner — creation, assignment, live refs, dashboard, reports", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a lesson plan with no VE-status gate and no DSS gate", async () => {
    // A plainly non-VE account (makeAccount defaults ve_status:false).
    const creator = await makeAccount();
    expect(creator.ve_status).toBe(false);
    const plan = await createLessonPlan({ creatorAccountId: creator.account_id, title: "My Playlist" });
    expect(plan.title).toBe("My Playlist");
    expect(plan.is_public).toBe(false);
    expect(plan.creator_account_id).toBe(creator.account_id);
  });

  it("lets a DSS-latched account STILL create and assign lesson plans (no DSS gate)", async () => {
    const creator = await makeAccount();
    // Latch DSS directly (value forced to 0, locked) — the same state that blocks
    // seed/module authoring. Lesson plan curation must remain available.
    await lockStandingScoreDirectly({ accountId: creator.account_id, scoreType: "DSS", eventType: "lock" });
    const dss = await getStandingScore(creator.account_id, "DSS");
    expect(dss.locked_at).not.toBeNull();

    // Creation succeeds despite the DSS latch.
    const plan = await createLessonPlan({ creatorAccountId: creator.account_id, title: "Latched but allowed" });
    // Assignment (by the same latched account, acting as assigner) also succeeds.
    const learner = await makeAccount();
    const assignment = await assignLessonPlan({
      lessonPlanId: plan.lesson_plan_id,
      assignerAccountId: creator.account_id,
      learnerIds: [learner.account_id],
      dateRangeStart: new Date("2026-01-01"),
      dateRangeEnd: new Date("2026-06-01"),
    });
    expect(assignment.assignment_id).toBeTruthy();
  });

  it("assigns with a creator/assigner distinction and no VE gate on the assigner", async () => {
    const creator = await makeAccount();
    const assigner = await makeAccount(); // different account, non-VE
    expect(assigner.ve_status).toBe(false);
    const plan = await createLessonPlan({ creatorAccountId: creator.account_id, title: "Shared plan", isPublic: true });
    const learner = await makeAccount();
    const assignment = await assignLessonPlan({
      lessonPlanId: plan.lesson_plan_id,
      assignerAccountId: assigner.account_id,
      learnerIds: [learner.account_id],
      dateRangeStart: new Date("2026-02-01"),
      dateRangeEnd: new Date("2026-03-01"),
    });
    // Authorship credit stays with the creator; the assignment is the assigner's.
    expect(plan.creator_account_id).toBe(creator.account_id);
    expect(assignment.assigner_account_id).toBe(assigner.account_id);
    expect(assignment.assigner_account_id).not.toBe(plan.creator_account_id);
  });

  it("stores module_sequence as LIVE references — a module edit is reflected immediately, no pin", async () => {
    const creator = await makeAccount();
    const { module, author } = await publishedModule("v1 content");
    expect(module.version).toBe(1);

    const plan = await createLessonPlan({
      creatorAccountId: creator.account_id,
      title: "Live ref plan",
      moduleIds: [module.module_id],
    });

    // Publish a NEW version of the module AFTER it was added to the plan.
    const republished = await publishModule(module.module_id, author.account_id);
    expect(republished.version).toBe(2);

    // The plan's sequence resolves to the module's CURRENT row (version 2) —
    // there is no frozen snapshot of version 1 anywhere.
    const seq = await getLessonPlanSequence(plan.lesson_plan_id);
    expect(seq).toHaveLength(1);
    expect(seq[0].moduleId).toBe(module.module_id);
    expect(seq[0].module.version).toBe(2); // live, not pinned to the added-at state
  });

  it("adds, removes, and reorders playlist entries with dense positions", async () => {
    const creator = await makeAccount();
    const { module: m1 } = await publishedModule("one");
    const { module: m2 } = await publishedModule("two");
    const { module: m3 } = await publishedModule("three");
    const plan = await createLessonPlan({ creatorAccountId: creator.account_id, title: "Ordered" });

    await addModuleToPlan(plan.lesson_plan_id, creator.account_id, m1.module_id);
    const e2 = await addModuleToPlan(plan.lesson_plan_id, creator.account_id, m2.module_id);
    await addModuleToPlan(plan.lesson_plan_id, creator.account_id, m3.module_id);

    let seq = await getLessonPlanSequence(plan.lesson_plan_id);
    expect(seq.map((s) => s.moduleId)).toEqual([m1.module_id, m2.module_id, m3.module_id]);

    // Reorder to reverse.
    const ids = seq.map((s) => s.entryId).reverse();
    await reorderPlanModules(plan.lesson_plan_id, creator.account_id, ids);
    seq = await getLessonPlanSequence(plan.lesson_plan_id);
    expect(seq.map((s) => s.moduleId)).toEqual([m3.module_id, m2.module_id, m1.module_id]);
    expect(seq.map((s) => s.position)).toEqual([0, 1, 2]);

    // Remove the middle (m2) → positions stay dense.
    await removeModuleFromPlan(plan.lesson_plan_id, creator.account_id, e2.id);
    seq = await getLessonPlanSequence(plan.lesson_plan_id);
    expect(seq.map((s) => s.moduleId)).toEqual([m3.module_id, m1.module_id]);
    expect(seq.map((s) => s.position)).toEqual([0, 1]);
  });

  it("keeps multiple assignments of the same plan to different cohorts from conflating data", async () => {
    const creator = await makeAccount();
    const assigner = await makeAccount();
    const { module } = await publishedModule("shared module");
    const plan = await createLessonPlan({
      creatorAccountId: creator.account_id,
      title: "Reused across cohorts",
      moduleIds: [module.module_id],
    });
    const learner = await makeAccount(); // SAME learner in both cohorts

    const cohortA = await assignLessonPlan({
      lessonPlanId: plan.lesson_plan_id,
      assignerAccountId: assigner.account_id,
      learnerIds: [learner.account_id],
      dateRangeStart: new Date("2026-01-01"),
      dateRangeEnd: new Date("2026-02-01"),
    });
    const cohortB = await assignLessonPlan({
      lessonPlanId: plan.lesson_plan_id,
      assignerAccountId: assigner.account_id,
      learnerIds: [learner.account_id],
      dateRangeStart: new Date("2026-06-01"),
      dateRangeEnd: new Date("2026-07-01"),
    });

    // Stub: completed under cohort A only, not under cohort B — keyed by assignment.
    const signal: CompletionSignal = ({ assignmentId }) =>
      assignmentId === cohortA.assignment_id ? "completed" : "not_started";

    const cells = await buildAssignerDashboard(assigner.account_id, {}, signal);
    const a = cells.find((c) => c.assignmentId === cohortA.assignment_id)!;
    const b = cells.find((c) => c.assignmentId === cohortB.assignment_id)!;
    expect(a.status).toBe("completed");
    expect(b.status).toBe("not_started"); // NOT conflated with cohort A
  });

  it("filters the dashboard by date range, learner, and module against a stubbed signal", async () => {
    const assigner = await makeAccount();
    const creator = await makeAccount();
    const { module: mA } = await publishedModule("A");
    const { module: mB } = await publishedModule("B");
    const plan = await createLessonPlan({
      creatorAccountId: creator.account_id,
      title: "Filterable",
      moduleIds: [mA.module_id, mB.module_id],
    });
    const l1 = await makeAccount();
    const l2 = await makeAccount();

    // Spring assignment (l1, l2) and a Fall assignment (l1 only).
    await assignLessonPlan({
      lessonPlanId: plan.lesson_plan_id,
      assignerAccountId: assigner.account_id,
      learnerIds: [l1.account_id, l2.account_id],
      dateRangeStart: new Date("2026-03-01"),
      dateRangeEnd: new Date("2026-05-01"),
    });
    await assignLessonPlan({
      lessonPlanId: plan.lesson_plan_id,
      assignerAccountId: assigner.account_id,
      learnerIds: [l1.account_id],
      dateRangeStart: new Date("2026-09-01"),
      dateRangeEnd: new Date("2026-11-01"),
    });

    // Unfiltered: spring (2 learners × 2 modules) + fall (1 × 2) = 6 cells.
    const all = await buildAssignerDashboard(assigner.account_id);
    expect(all).toHaveLength(6);

    // Date filter to the spring window only → 4 cells (2 learners × 2 modules).
    const spring = await buildAssignerDashboard(assigner.account_id, {
      dateRangeStart: new Date("2026-03-15"),
      dateRangeEnd: new Date("2026-04-15"),
    });
    expect(spring).toHaveLength(4);
    expect(spring.every((c) => c.learnerId === l1.account_id || c.learnerId === l2.account_id)).toBe(true);

    // Learner filter → only l2's rows (l2 is only in spring): 2 cells.
    const l2rows = await buildAssignerDashboard(assigner.account_id, { learnerId: l2.account_id });
    expect(l2rows).toHaveLength(2);
    expect(l2rows.every((c) => c.learnerId === l2.account_id)).toBe(true);

    // Module filter → only module A rows across both assignments: 3 cells
    // (spring l1+l2, fall l1).
    const modA = await buildAssignerDashboard(assigner.account_id, { moduleId: mA.module_id });
    expect(modA).toHaveLength(3);
    expect(modA.every((c) => c.moduleId === mA.module_id)).toBe(true);
  });

  it("prompts completion routing to the assigner, keyed off the assignment relationship", async () => {
    const creator = await makeAccount();
    const assigner = await makeAccount();
    const { module } = await publishedModule("finish me");
    const plan = await createLessonPlan({
      creatorAccountId: creator.account_id,
      title: "Prompt plan",
      moduleIds: [module.module_id],
    });
    const learner = await makeAccount();
    const assignment = await assignLessonPlan({
      lessonPlanId: plan.lesson_plan_id,
      assignerAccountId: assigner.account_id,
      learnerIds: [learner.account_id],
      dateRangeStart: new Date("2026-01-01"),
      dateRangeEnd: new Date("2026-12-31"),
    });

    const prompts = await completionSubmissionPrompts({
      learnerId: learner.account_id,
      moduleId: module.module_id,
      completedAt: new Date("2026-05-05"),
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0].assignmentId).toBe(assignment.assignment_id);
    expect(prompts[0].routeToAssignerAccountId).toBe(assigner.account_id);

    // A learner not on any assignment gets no prompt (nothing to route).
    const stranger = await makeAccount();
    const none = await completionSubmissionPrompts({
      learnerId: stranger.account_id,
      moduleId: module.module_id,
      completedAt: new Date("2026-05-05"),
    });
    expect(none).toHaveLength(0);
  });

  it("files a report that surfaces to Moderators, then upholds it: reporter +5 CSS, creator -5 CSS", async () => {
    const creator = await makeAccount();
    const reporter = await makeAccount();
    const mod = await makeAccount();
    const plan = await createLessonPlan({
      creatorAccountId: creator.account_id,
      title: "Bad Title Here",
      isPublic: true,
    });

    const report = await fileLessonPlanReport({
      lessonPlanId: plan.lesson_plan_id,
      reporterAccountId: reporter.account_id,
      reason: "title is a slur",
    });
    const pending = await listPendingLessonPlanReports();
    expect(pending.some((r) => r.report_id === report.report_id)).toBe(true);

    await resolveLessonPlanReportUpheld({
      reportId: report.report_id,
      moderatorAccountId: mod.account_id,
      explanation: "corrected the title and deactivated",
      correctedTitle: "Clean Title",
      deactivate: true,
    });

    // Corrective action applied.
    const fixed = await prisma.lessonPlan.findUniqueOrThrow({ where: { lesson_plan_id: plan.lesson_plan_id } });
    expect(fixed.title).toBe("Clean Title");
    expect(fixed.is_public).toBe(false);

    // Reporter +5, creator -5 (standard tier), both on CSS. Neither on DSS.
    expect(value(await getStandingScore(reporter.account_id, "CSS"))).toBe(55);
    expect(value(await getStandingScore(creator.account_id, "CSS"))).toBe(50 + CSS_CREATOR_STANDARD);
    expect(value(await getStandingScore(creator.account_id, "DSS"))).toBe(50); // untouched

    const creatorEv = await prisma.standingScoreEvent.findFirstOrThrow({
      where: { account_id: creator.account_id, event_type: "lesson_plan_removed_standard" },
    });
    expect(creatorEv.moderator_account_id).toBe(mod.account_id);
    expect(creatorEv.explanation).toContain("corrected");
    expect(creatorEv.score_type).toBe("CSS");
  });

  it("applies the egregious creator tier (-20 CSS) when the moderator classifies it so", async () => {
    const creator = await makeAccount();
    const reporter = await makeAccount();
    const mod = await makeAccount();
    const plan = await createLessonPlan({ creatorAccountId: creator.account_id, title: "vile", isPublic: true });
    const report = await fileLessonPlanReport({
      lessonPlanId: plan.lesson_plan_id,
      reporterAccountId: reporter.account_id,
      reason: "egregious",
    });
    await resolveLessonPlanReportUpheld({
      reportId: report.report_id,
      moderatorAccountId: mod.account_id,
      explanation: "egregious content, taken down",
      deactivate: true,
      severity: "egregious",
    });
    expect(value(await getStandingScore(creator.account_id, "CSS"))).toBe(50 + CSS_CREATOR_EGREGIOUS);
  });

  it("resolves an unfounded report: reporter -2 CSS, creator untouched, plan retained", async () => {
    const creator = await makeAccount();
    const reporter = await makeAccount();
    const mod = await makeAccount();
    const plan = await createLessonPlan({ creatorAccountId: creator.account_id, title: "Fine Title", isPublic: true });
    const report = await fileLessonPlanReport({
      lessonPlanId: plan.lesson_plan_id,
      reporterAccountId: reporter.account_id,
      reason: "I disagree",
    });
    await resolveLessonPlanReportUnfounded({
      reportId: report.report_id,
      moderatorAccountId: mod.account_id,
      explanation: "title is fine, retained",
    });
    expect(value(await getStandingScore(reporter.account_id, "CSS"))).toBe(48); // 50 - 2
    expect(value(await getStandingScore(creator.account_id, "CSS"))).toBe(50); // untouched
    const retained = await prisma.lessonPlan.findUniqueOrThrow({ where: { lesson_plan_id: plan.lesson_plan_id } });
    expect(retained.is_public).toBe(true); // not deactivated
    expect(retained.title).toBe("Fine Title"); // not corrected
  });

  it("counts lesson plan reports toward the SAME combined 3/day cap as seeds and modules", async () => {
    const reporter = await makeAccount();
    const creator = await makeAccount();
    const plan = await createLessonPlan({ creatorAccountId: creator.account_id, title: "cap test", isPublic: true });
    const { seed } = await makePublishedPrimarySeed();

    // 2 seed reports + 1 lesson plan report = 3 (cap reached).
    await fileSeedReport({ seedId: seed.seed_id, reporterAccountId: reporter.account_id, reason: "s1" });
    await fileSeedReport({ seedId: seed.seed_id, reporterAccountId: reporter.account_id, reason: "s2" });
    await fileLessonPlanReport({ lessonPlanId: plan.lesson_plan_id, reporterAccountId: reporter.account_id, reason: "lp1" });

    // 4th (a lesson plan report) is blocked by the shared cap.
    await expect(
      fileLessonPlanReport({ lessonPlanId: plan.lesson_plan_id, reporterAccountId: reporter.account_id, reason: "lp2" }),
    ).rejects.toBeInstanceOf(LessonPlanReportError);
  });

  it("closes Stage 1's soft reference: ParentApproval.lesson_plan_id now has a real FK", async () => {
    const child = await makeAccount({ ageYears: 10 });
    const adult = await makeAccount();
    const creator = await makeAccount();
    const plan = await createLessonPlan({ creatorAccountId: creator.account_id, title: "Approved plan" });

    // A ParentApproval pointing at a REAL lesson plan is accepted.
    const approval = await prisma.parentApproval.create({
      data: {
        child_account_id: child.account_id,
        requesting_adult_account_id: adult.account_id,
        approval_type: "one_time_pass",
        lesson_plan_id: plan.lesson_plan_id,
      },
    });
    expect(approval.lesson_plan_id).toBe(plan.lesson_plan_id);

    // Existing rows without a plan (the Stage 1 shape) remain valid.
    const noPlan = await prisma.parentApproval.create({
      data: {
        child_account_id: child.account_id,
        requesting_adult_account_id: adult.account_id,
        approval_type: "standing_connection",
      },
    });
    expect(noPlan.lesson_plan_id).toBeNull();

    // A bogus lesson_plan_id is now rejected by the FK constraint.
    await expect(
      prisma.parentApproval.create({
        data: {
          child_account_id: child.account_id,
          requesting_adult_account_id: adult.account_id,
          approval_type: "one_time_pass",
          lesson_plan_id: "00000000-0000-0000-0000-000000000000",
        },
      }),
    ).rejects.toThrow();
  });
});
