import { prisma } from "@/lib/prisma";
import { recordStandingScoreDelta } from "@/lib/standing-scores";
import {
  REPORT_DAILY_CAP,
  combinedReportsTodayCount,
  overReportCap,
} from "@/lib/report-quota";

// Lesson Planner — title reporting (Task 3). A lesson plan's `title` is open
// free text and, when is_public, immediately searchable — the same vandalism gap
// SeedReport/ModuleReport closed. Same lightweight shape (no auto-escalation
// ladder): a report surfaces to a Moderator who directly CORRECTS the title or
// DEACTIVATES the plan (is_public → false).

// Reporter CSS tiers — IDENTICAL to SeedReport (Section 10.5): +5 if the report
// leads to a correction/takedown, -2 if unfounded and the plan is retained.
export const CSS_REPORT_UPHELD = 5;
export const CSS_REPORT_UNFOUNDED = -2;

// Creator CSS tiers — lesson plan creation is NOT DSS-tracked (Task 1), so the
// creator's consequence lands on CSS. REUSES the exact three-way severity
// classification already established for DSS (insufficiency / inappropriate /
// egregious), but with CSS-SCALED point values instead of DSS's 0/-10/-20:
//
//   insufficiency  0    good-faith, trivial issue a moderator just fixes — no
//                       penalty, but still recorded (proportionality)
//   inappropriate  -5   an ordinary correctable problem
//   egregious      -20  malicious / severe
//
// Same enum and same "moderator's optional call" pattern used for module/seed
// reports — one classification scheme, different point values for this
// consequence type. PROPOSED values, flagged in the summary as not confirmed.
export const CSS_CREATOR_TIER: Record<LessonPlanSeverity, number> = {
  insufficiency: 0,
  inappropriate: -5,
  egregious: -20,
};
export type LessonPlanSeverity = "insufficiency" | "inappropriate" | "egregious";

export class LessonPlanReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonPlanReportError";
  }
}

// File a report against a lesson plan's title/content. Enforces the SHARED
// 3-per-day cap combined across seeds, modules, AND lesson plans.
export async function fileLessonPlanReport(
  args: { lessonPlanId: string; reporterAccountId: string; reason: string },
  now: Date = new Date(),
) {
  const plan = await prisma.lessonPlan.findUnique({ where: { lesson_plan_id: args.lessonPlanId } });
  if (!plan) throw new LessonPlanReportError("Lesson plan not found.");
  if (!args.reason.trim()) throw new LessonPlanReportError("A report reason is required.");

  if (overReportCap(await combinedReportsTodayCount(args.reporterAccountId, now))) {
    throw new LessonPlanReportError(
      `You have reached the limit of ${REPORT_DAILY_CAP} reports per day (resets at midnight Pacific).`,
    );
  }

  return prisma.lessonPlanReport.create({
    data: {
      lesson_plan_id: args.lessonPlanId,
      reporter_account_id: args.reporterAccountId,
      reason: args.reason,
      created_at: now, // Honor the caller's clock (drives the Pacific-day cap).
    },
  });
}

// Pending reports surfaced to Moderators.
export function listPendingLessonPlanReports() {
  return prisma.lessonPlanReport.findMany({
    where: { status: "pending" },
    orderBy: { created_at: "asc" },
  });
}

async function markResolved(reportId: string, moderatorAccountId: string, now: Date) {
  const report = await prisma.lessonPlanReport.findUniqueOrThrow({ where: { report_id: reportId } });
  if (report.status !== "pending") {
    throw new LessonPlanReportError("Report is already resolved.");
  }
  await prisma.lessonPlanReport.update({
    where: { report_id: reportId },
    data: { status: "resolved", resolved_at: now, resolved_by: moderatorAccountId },
  });
  return report;
}

// Resolve a report by UPHOLDING it — the moderator corrects the title and/or
// deactivates the plan. Applies +5 CSS to the reporter and a CSS penalty to the
// creator (standard -5, or -20 if the moderator classifies it egregious). All
// three writes (the plan edit + both score events) are moderator-attributed and
// carry the required explanation.
export async function resolveLessonPlanReportUpheld(
  args: {
    reportId: string;
    moderatorAccountId: string;
    explanation: string;
    // At least one corrective action is required for an upheld resolution.
    correctedTitle?: string;
    deactivate?: boolean;
    severity?: LessonPlanSeverity; // creator tier; defaults to standard
  },
  now: Date = new Date(),
) {
  if (!args.explanation.trim()) {
    throw new LessonPlanReportError("A resolution explanation is required.");
  }
  const hasCorrection = args.correctedTitle != null && args.correctedTitle.trim().length > 0;
  if (!hasCorrection && !args.deactivate) {
    throw new LessonPlanReportError(
      "An upheld resolution must correct the title, deactivate the plan, or both.",
    );
  }

  const report = await markResolved(args.reportId, args.moderatorAccountId, now);

  // Apply the moderator's corrective action to the plan.
  await prisma.lessonPlan.update({
    where: { lesson_plan_id: report.lesson_plan_id },
    data: {
      ...(hasCorrection ? { title: args.correctedTitle!.trim() } : {}),
      ...(args.deactivate ? { is_public: false } : {}),
    },
  });

  // Reporter reward for a report that led to a correction/takedown.
  await recordStandingScoreDelta(
    {
      accountId: report.reporter_account_id,
      scoreType: "CSS",
      delta: CSS_REPORT_UPHELD,
      eventType: "lesson_plan_report_upheld",
      moderatorAccountId: args.moderatorAccountId,
      explanation: args.explanation,
    },
    now,
  );

  // Creator CSS consequence (NOT DSS — lesson plan creation isn't DSS-tracked).
  // ALWAYS write a StandingScoreEvent — even at 0 delta when severity is
  // insufficiency or unclassified — so every upheld resolution leaves a
  // moderator-attributed accountability record (the same "0-delta is a valid
  // outcome; no event is not" rule established in the Module Editor fix chain).
  const plan = await prisma.lessonPlan.findUniqueOrThrow({
    where: { lesson_plan_id: report.lesson_plan_id },
  });
  await recordStandingScoreDelta(
    {
      accountId: plan.creator_account_id,
      scoreType: "CSS",
      delta: args.severity ? CSS_CREATOR_TIER[args.severity] : 0, // 0 when unclassified
      eventType: args.severity
        ? `lesson_plan_removed_${args.severity}`
        : "lesson_plan_removed_unclassified",
      moderatorAccountId: args.moderatorAccountId,
      explanation: args.explanation,
    },
    now,
  );

  return prisma.lessonPlanReport.findUniqueOrThrow({ where: { report_id: args.reportId } });
}

// Resolve a report as UNFOUNDED — the plan is retained as-is. Applies -2 CSS to
// the reporter and NOTHING to the creator (no infraction occurred).
export async function resolveLessonPlanReportUnfounded(
  args: { reportId: string; moderatorAccountId: string; explanation: string },
  now: Date = new Date(),
) {
  if (!args.explanation.trim()) {
    throw new LessonPlanReportError("A resolution explanation is required.");
  }
  const report = await markResolved(args.reportId, args.moderatorAccountId, now);

  await recordStandingScoreDelta(
    {
      accountId: report.reporter_account_id,
      scoreType: "CSS",
      delta: CSS_REPORT_UNFOUNDED,
      eventType: "lesson_plan_report_unfounded",
      moderatorAccountId: args.moderatorAccountId,
      explanation: args.explanation,
    },
    now,
  );

  return prisma.lessonPlanReport.findUniqueOrThrow({ where: { report_id: args.reportId } });
}
