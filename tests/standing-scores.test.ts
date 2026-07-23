import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  canRestoreEss,
  getStandingScore,
  isScoreLocked,
  driftedValue,
  lockStandingScoreDirectly,
  recordStandingScoreDelta,
  restoreEssLock,
  restoreStandingScore,
  triggerDiscretionaryReview,
  StandingScoreError,
  RESTORE_VALUE,
} from "@/lib/standing-scores";
import { grantPeerToken } from "@/lib/verification";
import { makeAccount } from "./helpers/factory";

const WEEK = 7 * 24 * 60 * 60 * 1000;
function value(row: { current_value: unknown }): number {
  return Number(row.current_value);
}

describe("Standing Scores — drift, locking, restoration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --- drift ----------------------------------------------------------------

  it("computes cumulative multi-week drift in one read and stops at 50", () => {
    // Pure closed-form checks of the per-week table.
    expect(driftedValue(45, 3)).toBe(48); // 1..49, +1/week
    expect(driftedValue(48, 5)).toBe(50); // stops at 50, no overshoot
    expect(driftedValue(48, 3)).toBe(50); // 48->49->50->50 over 3 weeks, not 51
    expect(driftedValue(55, 3)).toBe(52); // 51..100, -1/week
    expect(driftedValue(52, 9)).toBe(50); // stops at 50
    expect(driftedValue(50, 4)).toBe(50); // 50 -> +0
    expect(driftedValue(0, 3)).toBe(0); // 0 -> +0 (locked floor, no drift up)
    expect(driftedValue(30, 0)).toBe(30); // no elapsed weeks
  });

  it("applies and persists drift lazily on read (3-week catch-up at once)", async () => {
    const account = await makeAccount();
    const t0 = new Date("2025-01-01T00:00:00Z");
    // Seed a below-50 value by recording a delta at t0.
    await recordStandingScoreDelta(
      { accountId: account.account_id, scoreType: "CSS", delta: -10, eventType: "test" },
      t0,
    );
    // Value is 40; read 3 weeks later → +3 drift → 43, persisted.
    const later = new Date(t0.getTime() + 3 * WEEK);
    const row = await getStandingScore(account.account_id, "CSS", later);
    expect(value(row)).toBe(43);
  });

  it("sits at 50 with a no-op drift for an account with no activity", async () => {
    const account = await makeAccount();
    const row = await getStandingScore(account.account_id, "CSS", new Date());
    expect(value(row)).toBe(50);
    expect(row.locked_at).toBeNull();
  });

  // --- "clean first week" ---------------------------------------------------

  it("proves the clean-first-week behavior (drift absorbs a repeat infraction)", async () => {
    const t0 = new Date("2025-02-01T00:00:00Z");

    // Account A: restored to 5, then a -5 infraction IMMEDIATELY → lands at 0, locks.
    const a = await makeAccount();
    await restoreStandingScore({ accountId: a.account_id, scoreType: "CSS", resolutionTime: t0 });
    const aAfter = await recordStandingScoreDelta(
      { accountId: a.account_id, scoreType: "CSS", delta: -5, eventType: "infraction" },
      t0,
    );
    expect(value(aAfter)).toBe(0);
    expect(aAfter.locked_at).not.toBeNull();

    // Account B: restored to 5, a full week of drift elapses (→ 6), THEN -5 → 1.
    const b = await makeAccount();
    await restoreStandingScore({ accountId: b.account_id, scoreType: "CSS", resolutionTime: t0 });
    const oneWeekLater = new Date(t0.getTime() + WEEK);
    const bAfter = await recordStandingScoreDelta(
      { accountId: b.account_id, scoreType: "CSS", delta: -5, eventType: "infraction" },
      oneWeekLater,
    );
    expect(value(bAfter)).toBe(1); // above the floor — absorbed, not re-locked
    expect(bAfter.locked_at).toBeNull();
  });

  // --- locking / floor ------------------------------------------------------

  it("keeps logging events while locked but never moves the value below 0", async () => {
    const account = await makeAccount();
    const t0 = new Date("2025-03-01T00:00:00Z");
    await recordStandingScoreDelta(
      { accountId: account.account_id, scoreType: "DSS", delta: -60, eventType: "big" },
      t0,
    );
    expect(await isScoreLocked(account.account_id, "DSS", t0)).toBe(true);

    // A further infraction while locked: event still recorded, value stays 0.
    const after = await recordStandingScoreDelta(
      { accountId: account.account_id, scoreType: "DSS", delta: -10, eventType: "more" },
      t0,
    );
    expect(value(after)).toBe(0);
    const events = await prisma.standingScoreEvent.count({
      where: { account_id: account.account_id, score_type: "DSS" },
    });
    // big + dss_lock marker + more = 3 events.
    expect(events).toBe(3);
  });

  it("restores uniformly to 5, unlocking and resuming drift", async () => {
    const account = await makeAccount();
    const t0 = new Date("2025-04-01T00:00:00Z");
    await recordStandingScoreDelta(
      { accountId: account.account_id, scoreType: "CSS", delta: -55, eventType: "lockit" },
      t0,
    );
    expect(await isScoreLocked(account.account_id, "CSS", t0)).toBe(true);

    const restored = await restoreStandingScore({
      accountId: account.account_id,
      scoreType: "CSS",
      resolutionTime: t0,
    });
    expect(value(restored)).toBe(RESTORE_VALUE);
    expect(restored.locked_at).toBeNull();
    // Drift resumes from the restore anchor: +2 after 2 weeks → 7.
    const twoWeeks = new Date(t0.getTime() + 2 * WEEK);
    expect(value(await getStandingScore(account.account_id, "CSS", twoWeeks))).toBe(7);
  });

  // --- ESS lock consequences + restoration token check ----------------------

  it("ESS lock sets ve_status AND lnc_status false regardless of which was held", async () => {
    const account = await makeAccount({ ve: true });
    await prisma.account.update({
      where: { account_id: account.account_id },
      data: { lnc_status: true },
    });
    await lockStandingScoreDirectly({
      accountId: account.account_id,
      scoreType: "ESS",
      eventType: "direct_lock",
    });
    const after = await prisma.account.findUniqueOrThrow({ where: { account_id: account.account_id } });
    expect(after.ve_status).toBe(false);
    expect(after.lnc_status).toBe(false);
  });

  it("ESS restoration rejects a fresh grant from the ORIGINAL granter, accepts a different VE", async () => {
    const veA = await makeAccount({ ve: true });
    const veB = await makeAccount({ ve: true });
    const account = await makeAccount();

    // Original peer-token grant from VE-A.
    await grantPeerToken(veA.account_id, account.account_id);
    // ESS gets locked.
    await lockStandingScoreDirectly({ accountId: account.account_id, scoreType: "ESS", eventType: "lock" });

    // A fresh grant from the SAME granter (VE-A) does not qualify.
    await prisma.account.update({ where: { account_id: veA.account_id }, data: { ve_token_available: true } });
    await grantPeerToken(veA.account_id, account.account_id);
    expect(await canRestoreEss(account.account_id)).toBe(false);
    await expect(
      restoreEssLock({ accountId: account.account_id, resolutionTime: new Date() }),
    ).rejects.toBeInstanceOf(StandingScoreError);

    // A fresh grant from a DIFFERENT VE (VE-B) qualifies.
    await grantPeerToken(veB.account_id, account.account_id);
    expect(await canRestoreEss(account.account_id)).toBe(true);
    const restored = await restoreEssLock({ accountId: account.account_id, resolutionTime: new Date() });
    expect(restored.locked_at).toBeNull();
    expect(value(restored)).toBe(RESTORE_VALUE);
  });

  // --- moderator attribution ------------------------------------------------

  it("requires moderator_account_id and explanation together, or neither", async () => {
    const account = await makeAccount();
    const mod = await makeAccount();
    // Moderator id without explanation → rejected.
    await expect(
      recordStandingScoreDelta({
        accountId: account.account_id,
        scoreType: "CSS",
        delta: -2,
        eventType: "x",
        moderatorAccountId: mod.account_id,
      }),
    ).rejects.toBeInstanceOf(StandingScoreError);

    // Both present → allowed, event carries both.
    await recordStandingScoreDelta({
      accountId: account.account_id,
      scoreType: "CSS",
      delta: -2,
      eventType: "x",
      moderatorAccountId: mod.account_id,
      explanation: "documented reason",
    });
    const ev = await prisma.standingScoreEvent.findFirstOrThrow({
      where: { account_id: account.account_id, event_type: "x" },
    });
    expect(ev.moderator_account_id).toBe(mod.account_id);
    expect(ev.explanation).toBe("documented reason");

    // A system lock event carries neither.
    const lockEv = await prisma.standingScoreEvent.findFirst({
      where: { account_id: account.account_id, event_type: "css_lock" },
    });
    if (lockEv) {
      expect(lockEv.moderator_account_id).toBeNull();
      expect(lockEv.explanation).toBeNull();
    }
  });

  it("lets a Moderator trigger discretionary review without changing the value", async () => {
    const account = await makeAccount();
    const mod = await makeAccount();
    const before = value(await getStandingScore(account.account_id, "CSS"));
    await triggerDiscretionaryReview({
      accountId: account.account_id,
      scoreType: "CSS",
      moderatorAccountId: mod.account_id,
      explanation: "manual review",
    });
    const after = value(await getStandingScore(account.account_id, "CSS"));
    expect(after).toBe(before);
    const ev = await prisma.standingScoreEvent.findFirst({
      where: { account_id: account.account_id, event_type: "discretionary_review" },
    });
    expect(ev?.moderator_account_id).toBe(mod.account_id);
  });
});
