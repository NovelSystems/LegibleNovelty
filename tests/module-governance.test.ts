import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { publishModule, submitForReview } from "@/lib/modules";
import {
  createModuleReviewAppeal,
  fileModuleReport,
  moderatorReviewModule,
  moduleRequiresEscalation,
  ModuleReportError,
} from "@/lib/module-reports";
import { getStandingScore } from "@/lib/standing-scores";
import { fileSeedReport } from "@/lib/seed-reports";
import { makeAccount } from "./helpers/factory";
import { makePublishedPrimarySeed, makeModuleWithText } from "./helpers/module-factory";

function value(row: { current_value: unknown }): number {
  return Number(row.current_value);
}

async function publishedModule(political = false) {
  const { seed } = await makePublishedPrimarySeed({ political });
  const author = await makeAccount();
  const module = await makeModuleWithText(author.account_id, seed.seed_id, "some module content here");
  await submitForReview(module.module_id, author.account_id);
  await publishModule(module.module_id, author.account_id);
  return { module, author };
}

describe("Module Editor — reports, takedown, governance", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1 report → Moderation Hold; 2 distinct reporters → automatic takedown", async () => {
    const { module } = await publishedModule();
    const r1 = await makeAccount();
    const r2 = await makeAccount();

    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: r1.account_id, reason: "bad" });
    let m = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: module.module_id } });
    expect(m.status).toBe("moderation_hold");
    expect(m.auto_taken_down).toBe(false);

    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: r2.account_id, reason: "also bad" });
    m = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: module.module_id } });
    expect(m.auto_taken_down).toBe(true); // automatic takedown pending review
  });

  it("permanently disarms after a moderator clears a version, re-arms on a new version", async () => {
    const { module, author } = await publishedModule();
    const r1 = await makeAccount();
    const mod = await makeAccount();
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: r1.account_id, reason: "x" });

    // Moderator RETAINS (clears) the current version → disarmed + republished.
    await moderatorReviewModule({
      moduleId: module.module_id,
      moderatorAccountId: mod.account_id,
      decision: "retain",
      rationale: "content is fine",
    });
    let m = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: module.module_id } });
    expect(m.status).toBe("published");
    expect(m.takedown_disarmed_version).toBe(m.version);

    // Further reports on the SAME version → flagged previously_reviewed, no auto-takedown.
    const r2 = await makeAccount();
    const r3 = await makeAccount();
    const rep2 = await fileModuleReport({ moduleId: module.module_id, reporterAccountId: r2.account_id, reason: "again" });
    const rep3 = await fileModuleReport({ moduleId: module.module_id, reporterAccountId: r3.account_id, reason: "again2" });
    expect(rep2.previously_reviewed).toBe(true);
    expect(rep3.previously_reviewed).toBe(true);
    m = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: module.module_id } });
    expect(m.auto_taken_down).toBe(false); // stayed cleared

    // Publishing a NEW version re-arms the trigger.
    await publishModule(module.module_id, author.account_id);
    const newR = await makeAccount();
    const newR2 = await makeAccount();
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: newR.account_id, reason: "new-v" });
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: newR2.account_id, reason: "new-v2" });
    m = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: module.module_id } });
    expect(m.auto_taken_down).toBe(true); // re-armed on the new version
  });

  it("a reject decision creates a ModuleReviewDecision AND scored StandingScoreEvents in one transaction", async () => {
    const { module, author } = await publishedModule();
    const reporter = await makeAccount();
    const mod = await makeAccount();
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: reporter.account_id, reason: "advocacy framing" });

    const decision = await moderatorReviewModule({
      moduleId: module.module_id,
      moderatorAccountId: mod.account_id,
      decision: "reject",
      citedClause: "functional_test",
      sectionReference: "page 2, paragraph 3",
      rationale: "Presents the system's claims as settled fact (advocacy mode).",
      severity: "inappropriate", // -10 DSS
    });

    // Structured decision record.
    expect(decision.decision).toBe("reject");
    expect(decision.cited_clause).toBe("functional_test");
    expect(decision.section_reference).toContain("page 2");

    // Reporter +10 CSS; author -10 DSS (inappropriate tier).
    expect(value(await getStandingScore(reporter.account_id, "CSS"))).toBe(60);
    expect(value(await getStandingScore(author.account_id, "DSS"))).toBe(40);

    // The score events are moderator-attributed and reference the rationale.
    const cssEv = await prisma.standingScoreEvent.findFirstOrThrow({
      where: { account_id: reporter.account_id, event_type: "module_report_rejected" },
    });
    expect(cssEv.moderator_account_id).toBe(mod.account_id);
    expect(cssEv.explanation).toContain("advocacy");
    const dssEv = await prisma.standingScoreEvent.findFirstOrThrow({
      where: { account_id: author.account_id, event_type: "module_report_dss_inappropriate" },
    });
    expect(dssEv.moderator_account_id).toBe(mod.account_id);

    // Module is taken down.
    const m = await prisma.contextualizedModule.findUniqueOrThrow({ where: { module_id: module.module_id } });
    expect(m.status).toBe("moderation_hold");
  });

  it("a retain decision applies CSS -5 to the reporter and requires no clause", async () => {
    const { module } = await publishedModule();
    const reporter = await makeAccount();
    const mod = await makeAccount();
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: reporter.account_id, reason: "meh" });
    await moderatorReviewModule({
      moduleId: module.module_id,
      moderatorAccountId: mod.account_id,
      decision: "retain",
      rationale: "content is within charter",
    });
    expect(value(await getStandingScore(reporter.account_id, "CSS"))).toBe(45); // 50 - 5
  });

  it("rejects a decision that cites no clause on a rejection", async () => {
    const { module } = await publishedModule();
    const mod = await makeAccount();
    await expect(
      moderatorReviewModule({
        moduleId: module.module_id,
        moderatorAccountId: mod.account_id,
        decision: "reject",
        rationale: "no clause given",
      }),
    ).rejects.toBeInstanceOf(ModuleReportError);
  });

  it("shares the 3/day report cap across seeds and modules", async () => {
    const reporter = await makeAccount();
    const { module } = await publishedModule();
    const { seed } = await makePublishedPrimarySeed();
    // 2 seed reports + 1 module report = 3 (cap reached).
    await fileSeedReport({ seedId: seed.seed_id, reporterAccountId: reporter.account_id, reason: "s1" });
    await fileSeedReport({ seedId: seed.seed_id, reporterAccountId: reporter.account_id, reason: "s2" });
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: reporter.account_id, reason: "m1" });
    // 4th (a module report) is blocked by the shared cap.
    await expect(
      fileModuleReport({ moduleId: module.module_id, reporterAccountId: reporter.account_id, reason: "m2" }),
    ).rejects.toBeInstanceOf(ModuleReportError);
  });

  it("routes a political-Topic module to escalation and a non-political one not", async () => {
    const { module: political } = await publishedModule(true);
    const { module: ordinary } = await publishedModule(false);
    expect(await moduleRequiresEscalation(political.module_id)).toBe(true);
    expect(await moduleRequiresEscalation(ordinary.module_id)).toBe(false);
  });

  it("creates an appeal referencing its decision, requiring 3+ distinct reviewers", async () => {
    const { module } = await publishedModule();
    const reporter = await makeAccount();
    const mod = await makeAccount();
    await fileModuleReport({ moduleId: module.module_id, reporterAccountId: reporter.account_id, reason: "dispute me" });
    const decision = await moderatorReviewModule({
      moduleId: module.module_id,
      moderatorAccountId: mod.account_id,
      decision: "reject",
      citedClause: "charter",
      sectionReference: "page 1",
      rationale: "out of charter scope",
    });

    const p1 = await makeAccount();
    const p2 = await makeAccount();
    const p3 = await makeAccount();
    // Fewer than 3 distinct → rejected.
    await expect(
      createModuleReviewAppeal({
        moduleId: module.module_id,
        originalDecisionId: decision.decision_id,
        panelReviewerIds: [p1.account_id, p1.account_id, p2.account_id],
      }),
    ).rejects.toBeInstanceOf(ModuleReportError);

    const appeal = await createModuleReviewAppeal({
      moduleId: module.module_id,
      originalDecisionId: decision.decision_id,
      panelReviewerIds: [p1.account_id, p2.account_id, p3.account_id],
      panelRationale: "revisiting the charter reading",
    });
    expect(appeal.original_decision_id).toBe(decision.decision_id);
    expect(appeal.panel_reviewer_ids).toHaveLength(3);
  });
});
