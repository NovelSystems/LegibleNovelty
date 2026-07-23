import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  fileSeedReport,
  listPendingSeedReports,
  resolveSeedReportUnfounded,
  resolveSeedReportWithCorrection,
  SeedReportError,
} from "@/lib/seed-reports";
import { getStandingScore } from "@/lib/standing-scores";
import { makeAccount } from "./helpers/factory";
import { makeTaxonomyPair, publishSeedFixture } from "./helpers/seed-factory";

function value(row: { current_value: unknown }): number {
  return Number(row.current_value);
}

async function aPublishedSeed(architectId: string) {
  const { subject, topic } = await makeTaxonomyPair({ subject: `Rep-${Date.now()}-${Math.random()}` });
  return publishSeedFixture({ architectId, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });
}

describe("SeedReport — reporting + score consequences (Tasks 5 & 6)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("files a report that surfaces to Moderators as pending", async () => {
    const architect = await makeAccount({ endorsed: true });
    const reporter = await makeAccount();
    const seed = await aPublishedSeed(architect.account_id);

    const report = await fileSeedReport({
      seedId: seed.seed_id,
      reporterAccountId: reporter.account_id,
      reason: "notes field contains profanity",
    });
    expect(report.status).toBe("pending");
    const pending = await listPendingSeedReports();
    expect(pending.some((r) => r.report_id === report.report_id)).toBe(true);
  });

  it("resolving with a correction gives the reporter +5 CSS and applies the DSS severity tier to the architect", async () => {
    const architect = await makeAccount({ endorsed: true });
    const reporter = await makeAccount();
    const moderator = await makeAccount();
    const seed = await aPublishedSeed(architect.account_id);
    const report = await fileSeedReport({
      seedId: seed.seed_id,
      reporterAccountId: reporter.account_id,
      reason: "garbage in learning_objective",
    });

    const resolved = await resolveSeedReportWithCorrection({
      reportId: report.report_id,
      moderatorAccountId: moderator.account_id,
      explanation: "Rewrote the objective; content was vandalized.",
      severity: "egregious", // -20 DSS
    });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolved_by).toBe(moderator.account_id);

    // Reporter +5 CSS.
    expect(value(await getStandingScore(reporter.account_id, "CSS"))).toBe(55);
    // Architect -20 DSS (egregious tier).
    expect(value(await getStandingScore(architect.account_id, "DSS"))).toBe(30);

    // Both effects are moderator-attributed events.
    const cssEv = await prisma.standingScoreEvent.findFirstOrThrow({
      where: { account_id: reporter.account_id, event_type: "seed_report_upheld" },
    });
    expect(cssEv.moderator_account_id).toBe(moderator.account_id);
    const dssEv = await prisma.standingScoreEvent.findFirstOrThrow({
      where: { account_id: architect.account_id, event_type: "seed_report_dss_egregious" },
    });
    expect(dssEv.explanation).toContain("vandalized");
  });

  it("resolving as unfounded gives the reporter -2 CSS and no architect penalty", async () => {
    const architect = await makeAccount({ endorsed: true });
    const reporter = await makeAccount();
    const moderator = await makeAccount();
    const seed = await aPublishedSeed(architect.account_id);
    const report = await fileSeedReport({
      seedId: seed.seed_id,
      reporterAccountId: reporter.account_id,
      reason: "I just don't like it",
    });

    await resolveSeedReportUnfounded({
      reportId: report.report_id,
      moderatorAccountId: moderator.account_id,
      explanation: "Content is fine; report is unfounded.",
    });
    expect(value(await getStandingScore(reporter.account_id, "CSS"))).toBe(48); // 50 - 2
    expect(value(await getStandingScore(architect.account_id, "DSS"))).toBe(50); // untouched
  });

  it("enforces the combined 3-reports-per-day cap (midnight Pacific)", async () => {
    const architect = await makeAccount({ endorsed: true });
    const reporter = await makeAccount();
    const seed = await aPublishedSeed(architect.account_id);
    const day = new Date("2025-07-15T18:00:00Z"); // 11:00 PDT

    for (let i = 0; i < 3; i++) {
      await fileSeedReport(
        { seedId: seed.seed_id, reporterAccountId: reporter.account_id, reason: `r${i}` },
        day,
      );
    }
    // 4th same day → blocked.
    await expect(
      fileSeedReport({ seedId: seed.seed_id, reporterAccountId: reporter.account_id, reason: "r4" }, day),
    ).rejects.toBeInstanceOf(SeedReportError);

    // Next Pacific day → allowed again (count reset).
    const nextDay = new Date("2025-07-16T18:00:00Z");
    await expect(
      fileSeedReport({ seedId: seed.seed_id, reporterAccountId: reporter.account_id, reason: "r5" }, nextDay),
    ).resolves.toBeTruthy();
  });

  it("applies CSS to a VE reporter too — CSS is not gated on VE/LNC status", async () => {
    const architect = await makeAccount({ endorsed: true });
    const veReporter = await makeAccount({ ve: true }); // Holds VE status.
    const moderator = await makeAccount();
    const seed = await aPublishedSeed(architect.account_id);
    const report = await fileSeedReport({
      seedId: seed.seed_id,
      reporterAccountId: veReporter.account_id,
      reason: "frivolous",
    });
    await resolveSeedReportUnfounded({
      reportId: report.report_id,
      moderatorAccountId: moderator.account_id,
      explanation: "Unfounded.",
    });
    // The VE still accrues CSS.
    expect(value(await getStandingScore(veReporter.account_id, "CSS"))).toBe(48);
  });
});
