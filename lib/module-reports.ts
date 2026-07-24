import { prisma } from "@/lib/prisma";
import type { CitedClause, Prisma } from "@prisma/client";
import { REPORT_DAILY_CAP, combinedReportsTodayCount, overReportCap } from "@/lib/report-quota";
import { applyStandingScoreDeltaWithin } from "@/lib/standing-scores";

// Report-driven takedown + content-governance review for modules (Module Editor
// Tasks 4-5). The report → Standing Score wiring MIRRORS SeedReport's pattern
// exactly (CSS to the reporter, DSS tier to the author, a moderator-attributed
// StandingScoreEvent) — different content type, same shape.

// Module CSS values (Section 10.5): a full module report is weightier than a
// seed report — +10 if the report leads to rejection, -5 if unfounded.
export const CSS_MODULE_REJECT = 10;
export const CSS_MODULE_RETAIN = -5;

// Same three DSS tiers as SeedReport (Section 10.4 of the governance policy).
export const DSS_TIER: Record<ModuleSeverity, number> = {
  insufficiency: 0,
  inappropriate: -10,
  egregious: -20,
};
export type ModuleSeverity = "insufficiency" | "inappropriate" | "egregious";

export class ModuleReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleReportError";
  }
}

// The single DSS-tier-application logic shared by BOTH the report path and the
// manual-takedown path (Module Editor). It ALWAYS records a StandingScoreEvent
// for the moderator's decision — 0-delta when no severity is classified, not
// skipped — since every moderator retain/reject decision must leave an
// accountability record (moderator_account_id + required explanation) INDEPENDENT
// of point value. Severity classification stays the moderator's optional call;
// what drives the DSS delta is the moderator's substantiated judgment about the
// content, not which path surfaced it. One shared function, never two versions.
async function applyAuthorDssTierWithin(
  tx: Prisma.TransactionClient,
  args: {
    authorAccountId: string;
    severity?: ModuleSeverity;
    moderatorAccountId: string;
    explanation: string;
  },
  now: Date,
) {
  await applyStandingScoreDeltaWithin(
    tx,
    {
      accountId: args.authorAccountId,
      scoreType: "DSS",
      delta: args.severity ? DSS_TIER[args.severity] : 0, // 0-delta when unclassified
      eventType: args.severity ? `module_dss_${args.severity}` : "module_dss_unclassified",
      moderatorAccountId: args.moderatorAccountId,
      explanation: args.explanation,
    },
    now,
  );
}

// --- filing + automatic takedown thresholds (Task 4) -------------------------

export async function fileModuleReport(
  args: { moduleId: string; reporterAccountId: string; reason: string },
  now: Date = new Date(),
) {
  const module = await prisma.contextualizedModule.findUnique({ where: { module_id: args.moduleId } });
  if (!module) throw new ModuleReportError("Module not found.");
  if (!args.reason.trim()) throw new ModuleReportError("A report reason is required.");

  // Shared 3/day cap combined across seeds AND modules.
  if (overReportCap(await combinedReportsTodayCount(args.reporterAccountId, now))) {
    throw new ModuleReportError(
      `You have reached the limit of ${REPORT_DAILY_CAP} reports per day (resets at midnight Pacific).`,
    );
  }

  // A report against a version a moderator already cleared is "previously
  // reviewed": logged and flagged, but never auto-arms takedown again.
  const previouslyReviewed = module.takedown_disarmed_version === module.version;

  const report = await prisma.moduleReport.create({
    data: {
      module_id: args.moduleId,
      reporter_account_id: args.reporterAccountId,
      reason: args.reason,
      module_version: module.version,
      previously_reviewed: previouslyReviewed,
      created_at: now,
    },
  });

  // Evaluate the takedown thresholds while the module is live OR already on hold
  // (so a 1st report → hold can still escalate to auto-takedown on the 2nd).
  if (!previouslyReviewed && (module.status === "published" || module.status === "moderation_hold")) {
    // Distinct reporters against THIS version (armed).
    const reports = await prisma.moduleReport.findMany({
      where: { module_id: args.moduleId, module_version: module.version, previously_reviewed: false },
      select: { reporter_account_id: true },
    });
    const distinct = new Set(reports.map((r) => r.reporter_account_id)).size;

    if (distinct >= 2) {
      // 2 different users → automatic takedown, pending moderator review.
      await prisma.contextualizedModule.update({
        where: { module_id: args.moduleId },
        data: { status: "moderation_hold", auto_taken_down: true },
      });
    } else if (distinct >= 1) {
      // 1 report → Moderation Hold queue.
      await prisma.contextualizedModule.update({
        where: { module_id: args.moduleId },
        data: { status: "moderation_hold" },
      });
    }
  }

  return report;
}

export function listPendingModuleReports() {
  return prisma.moduleReport.findMany({ where: { status: "pending" }, orderBy: { created_at: "asc" } });
}

// --- moderator review decision + Standing Score consequence (Tasks 4-5) ------

// A Moderator resolves the reports on a module with a single retain/reject
// decision. Creates a ModuleReviewDecision (with a STRUCTURED clause citation on
// rejection) AND the Standing Score events — CSS to each reporter, DSS tier to
// the author on rejection — all in ONE transaction.
export async function moderatorReviewModule(
  args: {
    moduleId: string;
    moderatorAccountId: string;
    decision: "retain" | "reject";
    rationale: string;
    citedClause?: CitedClause;
    sectionReference?: string;
    severity?: ModuleSeverity; // reject only: DSS tier on the author
  },
  now: Date = new Date(),
) {
  if (!args.rationale.trim()) throw new ModuleReportError("A rationale is required.");
  if (args.decision === "reject" && (!args.citedClause || !args.sectionReference?.trim())) {
    // Section 5: a rejection must cite a specific clause and section.
    throw new ModuleReportError("A rejection requires a cited_clause and a section_reference.");
  }

  const module = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: args.moduleId } });

  return prisma.$transaction(async (tx) => {
    const decision = await tx.moduleReviewDecision.create({
      data: {
        module_id: args.moduleId,
        moderator_account_id: args.moderatorAccountId,
        decision: args.decision,
        cited_clause: args.decision === "reject" ? args.citedClause : null,
        section_reference: args.decision === "reject" ? args.sectionReference : null,
        rationale: args.rationale,
      },
    });

    // Resolve all pending reports on this module and reward/penalize each reporter.
    const pending = await tx.moduleReport.findMany({
      where: { module_id: args.moduleId, status: "pending" },
    });
    const cssDelta = args.decision === "reject" ? CSS_MODULE_REJECT : CSS_MODULE_RETAIN;
    for (const report of pending) {
      await tx.moduleReport.update({
        where: { report_id: report.report_id },
        data: { status: "resolved", resolved_at: now, resolved_by: args.moderatorAccountId },
      });
      await applyStandingScoreDeltaWithin(
        tx,
        {
          accountId: report.reporter_account_id,
          scoreType: "CSS",
          delta: cssDelta,
          eventType: args.decision === "reject" ? "module_report_rejected" : "module_report_retained",
          moderatorAccountId: args.moderatorAccountId,
          explanation: args.rationale,
        },
        now,
      );
    }

    // EVERY retain/reject decision leaves a moderator-attributed record on the
    // author's DSS history via the SAME shared helper the manual-takedown path
    // uses — reject applies the severity tier, retain applies a 0 delta (no
    // infraction). This is independent of whether any reporter existed: a
    // discretionary retain (zero pending reports) still records the decision.
    // The per-reporter CSS events above are ADDITIVE, not a substitute.
    await applyAuthorDssTierWithin(
      tx,
      {
        authorAccountId: module.author_account_id,
        // Only a rejection carries a severity tier; a retain is always 0-delta.
        severity: args.decision === "reject" ? args.severity : undefined,
        moderatorAccountId: args.moderatorAccountId,
        explanation: args.rationale,
      },
      now,
    );

    if (args.decision === "reject") {
      // Rejected → taken down (removed from public, in moderation hold).
      await tx.contextualizedModule.update({
        where: { module_id: args.moduleId },
        data: { status: "moderation_hold", auto_taken_down: true },
      });
    } else {
      // Retained → this version is permanently DISARMED and restored to public.
      await tx.contextualizedModule.update({
        where: { module_id: args.moduleId },
        data: {
          status: "published",
          auto_taken_down: false,
          takedown_disarmed_version: module.version,
        },
      });
    }

    return decision;
  });
}

// A Moderator's manual takedown authority — absolute and independent of the
// automated state. Requires a brief rationale logged for accountability.
//
// DSS: applies the SAME severity-classified tier to the author as the
// report-rejection path (via the shared applyAuthorDssTierWithin), because what
// drives DSS is the moderator's substantiated judgment about the content, not
// which path surfaced it. Severity stays OPTIONAL — with none given, no DSS
// effect. The one correct difference from the report path: NO CSS is applied
// here, since a manual takedown has no reporter.
export async function moderatorManualTakedown(
  moduleId: string,
  moderatorAccountId: string,
  rationale: string,
  opts: { severity?: ModuleSeverity; citedClause?: CitedClause; sectionReference?: string } = {},
) {
  if (!rationale.trim()) throw new ModuleReportError("A rationale is required for a manual takedown.");
  const module = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: moduleId } });
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const decision = await tx.moduleReviewDecision.create({
      data: {
        module_id: moduleId,
        moderator_account_id: moderatorAccountId,
        decision: "reject",
        // Manual takedown may optionally carry the same structured citation the
        // report path records; a clause is not forced (this is discretionary,
        // absolute authority).
        cited_clause: opts.citedClause ?? null,
        section_reference: opts.sectionReference ?? null,
        rationale,
      },
    });
    // Same DSS-tier logic as the report-rejection path (no CSS — no reporter).
    await applyAuthorDssTierWithin(
      tx,
      {
        authorAccountId: module.author_account_id,
        severity: opts.severity,
        moderatorAccountId,
        explanation: rationale,
      },
      now,
    );
    await tx.contextualizedModule.update({
      where: { module_id: moduleId },
      data: { status: "moderation_hold" },
    });
    return decision;
  });
}

// --- escalation-tier routing (Task 5) ----------------------------------------

// A module routes to the escalation tier iff its primary OR any secondary seed
// is placed under a government-or-political-systems Topic — reusing Seed Editor's
// existing Taxonomy (is_political_systems flag), NOT a module-level tag. Triggers
// purely on topic placement, never on suspicion of a specific author.
export async function moduleRequiresEscalation(moduleId: string): Promise<boolean> {
  const module = await prisma.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    include: { secondary_seeds: { include: { seed_revision: true } } },
  });
  const seedIds = [
    module.primary_seed_id,
    ...module.secondary_seeds.map((s) => s.seed_revision.seed_id),
  ];
  const seeds = await prisma.learningSeed.findMany({
    where: { seed_id: { in: seedIds } },
    select: { topic_id: true },
  });
  const topicIds = seeds.map((s) => s.topic_id);
  const political = await prisma.taxonomy.findFirst({
    where: { taxonomy_id: { in: topicIds }, is_political_systems: true },
    select: { taxonomy_id: true },
  });
  return political != null;
}

// --- appeal process (Task 5) -------------------------------------------------

// A disputed rejection escalates to a panel of 3+ DISTINCT reviewers, not limited
// to credentialed VEs. The reasoning is never confidential and must be retained.
export async function createModuleReviewAppeal(args: {
  moduleId: string;
  originalDecisionId: string;
  panelReviewerIds: string[];
  panelRationale?: string;
}) {
  const decision = await prisma.moduleReviewDecision.findUniqueOrThrow({
    where: { decision_id: args.originalDecisionId },
  });
  if (decision.decision !== "reject") {
    throw new ModuleReportError("Only a rejection can be appealed.");
  }
  const distinct = new Set(args.panelReviewerIds);
  if (distinct.size < 3) {
    throw new ModuleReportError("An appeal panel requires at least 3 distinct reviewers.");
  }
  return prisma.moduleReviewAppeal.create({
    data: {
      module_id: args.moduleId,
      original_decision_id: args.originalDecisionId,
      panel_reviewer_ids: [...distinct],
      panel_rationale: args.panelRationale ?? null,
    },
  });
}

export async function resolveModuleReviewAppeal(
  appealId: string,
  panelRationale: string,
  now: Date = new Date(),
) {
  return prisma.moduleReviewAppeal.update({
    where: { appeal_id: appealId },
    data: { status: "resolved", panel_rationale: panelRationale, resolved_at: now },
  });
}
