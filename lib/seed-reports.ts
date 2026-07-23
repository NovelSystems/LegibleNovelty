import { prisma } from "@/lib/prisma";
import { startOfPacificDay } from "@/lib/pacific-time";
import { recordStandingScoreDelta } from "@/lib/standing-scores";

// Seed content reporting (Standing Scores Task 5) — the free-text vandalism gap
// the Seed Editor lacked. A report surfaces to Moderators; RESOLUTION happens
// through the already-built SeedRevision moderator-edit path (no new takedown
// mechanism). Score consequences on resolution are applied here.

export const REPORT_DAILY_CAP = 3;

// PROPOSED CSS point values (flagged in the summary as not confirmed): a seed
// report is severity-closest to a comment report, so +5 if upheld / -2 if
// unfounded, mirroring the comment tier.
export const CSS_REPORT_UPHELD = 5;
export const CSS_REPORT_UNFOUNDED = -2;

// PROPOSED DSS tiers on the architect (flagged in the summary as a synthesis of a
// previously-unexplained trigger, not confirmed): the moderator may
// severity-classify a correction.
export const DSS_TIER: Record<SeedReportSeverity, number> = {
  insufficiency: 0, // good-faith error — no penalty (still recorded)
  inappropriate: -10,
  egregious: -20,
};
export type SeedReportSeverity = "insufficiency" | "inappropriate" | "egregious";

export class SeedReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedReportError";
  }
}

// Combined daily report count for this reporter across comments, modules, and
// seeds. Only SeedReports exist today — comment/module reports would be added to
// this sum once those systems land; the cap and reset stay the same.
export async function reportsTodayCount(
  reporterAccountId: string,
  now: Date = new Date(),
): Promise<number> {
  const since = startOfPacificDay(now);
  const seedReports = await prisma.seedReport.count({
    where: { reporter_account_id: reporterAccountId, created_at: { gte: since } },
  });
  return seedReports;
}

// File a report on a seed's content. Enforces the shared 3-per-day cap
// (calendar day, midnight Pacific — the same convention as the publish quota).
export async function fileSeedReport(
  args: { seedId: string; reporterAccountId: string; reason: string },
  now: Date = new Date(),
) {
  const seed = await prisma.learningSeed.findUnique({ where: { seed_id: args.seedId } });
  if (!seed || seed.deleted_at) throw new SeedReportError("Seed not found.");
  if (!args.reason.trim()) throw new SeedReportError("A report reason is required.");

  if ((await reportsTodayCount(args.reporterAccountId, now)) >= REPORT_DAILY_CAP) {
    throw new SeedReportError(
      `You have reached the limit of ${REPORT_DAILY_CAP} reports per day (resets at midnight Pacific).`,
    );
  }

  return prisma.seedReport.create({
    data: {
      seed_id: args.seedId,
      reporter_account_id: args.reporterAccountId,
      reason: args.reason,
      created_at: now, // Honor the caller's clock (drives the Pacific-day cap).
    },
  });
}

// Pending reports surfaced to Moderators.
export function listPendingSeedReports() {
  return prisma.seedReport.findMany({
    where: { status: "pending" },
    orderBy: { created_at: "asc" },
  });
}

async function markResolved(reportId: string, moderatorAccountId: string, now: Date) {
  const report = await prisma.seedReport.findUniqueOrThrow({ where: { report_id: reportId } });
  if (report.status !== "pending") {
    throw new SeedReportError("Report is already resolved.");
  }
  await prisma.seedReport.update({
    where: { report_id: reportId },
    data: { status: "resolved", resolved_at: now, resolved_by: moderatorAccountId },
  });
  return report;
}

// Resolve a report by CORRECTING the seed (the actual fix is a separate
// SeedRevision moderator edit). Applies +5 CSS to the reporter, and — if the
// moderator severity-classifies the correction — the corresponding DSS tier to
// the seed's architect. Both are moderator decisions, so both events carry the
// moderator + explanation.
export async function resolveSeedReportWithCorrection(
  args: {
    reportId: string;
    moderatorAccountId: string;
    explanation: string;
    severity?: SeedReportSeverity;
  },
  now: Date = new Date(),
) {
  if (!args.explanation.trim()) {
    throw new SeedReportError("A resolution explanation is required.");
  }
  const report = await markResolved(args.reportId, args.moderatorAccountId, now);

  // Reward the reporter for a report that led to a correction.
  await recordStandingScoreDelta(
    {
      accountId: report.reporter_account_id,
      scoreType: "CSS",
      delta: CSS_REPORT_UPHELD,
      eventType: "seed_report_upheld",
      moderatorAccountId: args.moderatorAccountId,
      explanation: args.explanation,
    },
    now,
  );

  // Optional DSS penalty on the architect, by severity tier.
  if (args.severity) {
    const seed = await prisma.learningSeed.findUniqueOrThrow({
      where: { seed_id: report.seed_id },
    });
    await recordStandingScoreDelta(
      {
        accountId: seed.architect_account_id,
        scoreType: "DSS",
        delta: DSS_TIER[args.severity],
        eventType: `seed_report_dss_${args.severity}`,
        moderatorAccountId: args.moderatorAccountId,
        explanation: args.explanation,
      },
      now,
    );
  }

  return prisma.seedReport.findUniqueOrThrow({ where: { report_id: args.reportId } });
}

// Resolve a report as UNFOUNDED — content retained as-is. Applies -2 CSS to the
// reporter. No DSS effect on the architect.
export async function resolveSeedReportUnfounded(
  args: { reportId: string; moderatorAccountId: string; explanation: string },
  now: Date = new Date(),
) {
  if (!args.explanation.trim()) {
    throw new SeedReportError("A resolution explanation is required.");
  }
  const report = await markResolved(args.reportId, args.moderatorAccountId, now);

  await recordStandingScoreDelta(
    {
      accountId: report.reporter_account_id,
      scoreType: "CSS",
      delta: CSS_REPORT_UNFOUNDED,
      eventType: "seed_report_unfounded",
      moderatorAccountId: args.moderatorAccountId,
      explanation: args.explanation,
    },
    now,
  );

  return prisma.seedReport.findUniqueOrThrow({ where: { report_id: args.reportId } });
}
