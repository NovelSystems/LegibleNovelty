import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient, StandingScore, StandingScoreType } from "@prisma/client";

// Standing Scores (ESS / DSS / CSS) — shared governance mechanic (Section 10).
//
// One scale for all three: everyone starts at 50, passive weekly drift pulls the
// value back toward 50, hitting 0 LOCKS the score (forced review), and a
// successful appeal RESTORES to 5 (not 50) and resumes drift. All three scores
// apply to every account simultaneously and independently — CSS is NOT gated on
// lacking VE/LNC status.

export const START_VALUE = 50;
export const DRIFT_TARGET = 50;
export const RESTORE_VALUE = 5;
export const LOCK_FLOOR = 0;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Values only ever carry 0.1 granularity (DSS's +0.1 trigger is the finest);
// round to one decimal after arithmetic so JS float noise can't accumulate.
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export class StandingScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandingScoreError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

function num(v: Prisma.Decimal | number): number {
  return typeof v === "number" ? v : Number(v);
}

// --- Drift -------------------------------------------------------------------

// Passive weekly drift as a plain per-week table applied directly to the value,
// with NO separate is-locked condition:
//
//   0        -> +0     (0 already means locked — handled for free by arithmetic)
//   1..49    -> +1
//   50       -> +0
//   51..100  -> -1
//
// Closed form over any number of elapsed weeks, never overshooting 50 (e.g.
// 48 over 3 weeks is 48->49->50->50 = 50, not 51). A value of exactly 0 is a
// fixed point, so a locked-at-0 score stays put without any lock check.
export function driftedValue(value: number, weeks: number): number {
  if (weeks <= 0) return value;
  if (value <= 0) return 0; // 0 -> +0
  if (value === DRIFT_TARGET) return value; // 50 -> +0
  if (value < DRIFT_TARGET) return round1(Math.min(DRIFT_TARGET, value + weeks)); // 1..49 -> +1/wk
  return round1(Math.max(DRIFT_TARGET, value - weeks)); // >50 -> -1/wk
}

async function getOrCreateRow(
  db: Db,
  accountId: string,
  scoreType: StandingScoreType,
  now: Date,
): Promise<StandingScore> {
  const existing = await db.standingScore.findUnique({
    where: { account_id_score_type: { account_id: accountId, score_type: scoreType } },
  });
  if (existing) return existing;
  // Lazily created at 50 with drift anchored to now (a no-op until it moves).
  return db.standingScore.create({
    data: {
      account_id: accountId,
      score_type: scoreType,
      current_value: START_VALUE,
      last_drift_computed_at: now,
    },
  });
}

// Apply lazy weekly drift and PERSIST (value + a fresh anchor advanced by whole
// weeks, preserving the sub-week remainder). There is NO separate is-locked
// check: the drift table's 0 -> +0 fixed point keeps a locked-at-0 score put,
// and unlock is governed by locked_at (cleared only by restoration), never by
// the value, so drift is safe to apply unconditionally.
async function readWithDrift(
  db: Db,
  accountId: string,
  scoreType: StandingScoreType,
  now: Date,
): Promise<StandingScore> {
  const row = await getOrCreateRow(db, accountId, scoreType, now);

  const elapsed = now.getTime() - row.last_drift_computed_at.getTime();
  const weeks = Math.floor(elapsed / WEEK_MS);
  if (weeks <= 0) return row;

  const newValue = driftedValue(num(row.current_value), weeks);
  const newAnchor = new Date(row.last_drift_computed_at.getTime() + weeks * WEEK_MS);
  return db.standingScore.update({
    where: { standing_score_id: row.standing_score_id },
    data: { current_value: newValue, last_drift_computed_at: newAnchor },
  });
}

// Public read: drift-applied current state of a score (creating the row if
// absent). Reading is what advances drift — there is no scheduler.
export function getStandingScore(
  accountId: string,
  scoreType: StandingScoreType,
  now: Date = new Date(),
) {
  return readWithDrift(prisma, accountId, scoreType, now);
}

export async function isScoreLocked(
  accountId: string,
  scoreType: StandingScoreType,
  now: Date = new Date(),
): Promise<boolean> {
  const row = await getStandingScore(accountId, scoreType, now);
  return row.locked_at != null;
}

// --- Events / attribution ----------------------------------------------------

interface ModeratorAttribution {
  moderatorAccountId?: string;
  explanation?: string;
}

// moderator_account_id and explanation are required TOGETHER, or neither.
function normalizedAttribution(a: ModeratorAttribution): {
  moderator_account_id: string | null;
  explanation: string | null;
} {
  const mod = a.moderatorAccountId ?? null;
  const exp = a.explanation?.trim() || null;
  if ((mod && !exp) || (!mod && exp)) {
    throw new StandingScoreError(
      "A moderator-attributed event requires both moderator_account_id and a non-empty explanation.",
    );
  }
  return { moderator_account_id: mod, explanation: exp };
}

async function insertEvent(
  db: Db,
  args: {
    accountId: string;
    scoreType: StandingScoreType;
    delta: number;
    eventType: string;
  } & ModeratorAttribution,
) {
  return db.standingScoreEvent.create({
    data: {
      account_id: args.accountId,
      score_type: args.scoreType,
      point_delta: args.delta,
      event_type: args.eventType,
      ...normalizedAttribution(args),
    },
  });
}

// --- Lock consequences -------------------------------------------------------

// ESS lock revokes BOTH held credentials regardless of which was held.
async function applyLockConsequences(
  db: Db,
  accountId: string,
  scoreType: StandingScoreType,
) {
  if (scoreType === "ESS") {
    await db.account.update({
      where: { account_id: accountId },
      data: { ve_status: false, lnc_status: false },
    });
  }
  // DSS lock is enforced in the Seed Editor authoring path (retrofit); CSS lock
  // is enforced by comment/report surfaces once they exist. Neither writes an
  // Account field here — the lock state itself is the source of truth.
}

// --- Record a point delta (infraction or reward) -----------------------------

// Applies a delta to a score. Drift is brought current first, the delta event is
// always recorded (append-only), the stored value is clamped at 0, and crossing
// to <=0 (when not already locked) LOCKS the score and fires its consequences.
// A delta while already locked is still logged but never moves the value below 0.
export async function recordStandingScoreDelta(
  args: {
    accountId: string;
    scoreType: StandingScoreType;
    delta: number;
    eventType: string;
  } & ModeratorAttribution,
  now: Date = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const row = await readWithDrift(tx, args.accountId, args.scoreType, now);
    const wasLocked = row.locked_at != null;
    const raw = round1(num(row.current_value) + args.delta);
    const newValue = Math.max(LOCK_FLOOR, raw);
    const shouldLock = !wasLocked && raw <= LOCK_FLOOR;

    // The infraction/reward event records the NOMINAL delta (faithful history),
    // even when the stored value is clamped at the floor.
    await insertEvent(tx, args);

    await tx.standingScore.update({
      where: { standing_score_id: row.standing_score_id },
      data: {
        current_value: newValue,
        ...(shouldLock ? { locked_at: now } : {}),
      },
    });

    if (shouldLock) {
      await applyLockConsequences(tx, args.accountId, args.scoreType);
      // Distinct system-triggered lock marker (moderator null).
      await insertEvent(tx, {
        accountId: args.accountId,
        scoreType: args.scoreType,
        delta: 0,
        eventType: `${args.scoreType.toLowerCase()}_lock`,
      });
    }

    return tx.standingScore.findUniqueOrThrow({
      where: { standing_score_id: row.standing_score_id },
    });
  });
}

// --- Direct lock (no numeric deduction) --------------------------------------

// Lock a score directly, independent of its numeric value — e.g. a confirmed
// ve_conduct_review AccountFlag triggering an ESS lock. Idempotent: a
// still-locked score is left as-is.
export async function lockStandingScoreDirectly(
  args: {
    accountId: string;
    scoreType: StandingScoreType;
    eventType: string;
  } & ModeratorAttribution,
  now: Date = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const row = await readWithDrift(tx, args.accountId, args.scoreType, now);
    if (row.locked_at) return row;

    await tx.standingScore.update({
      where: { standing_score_id: row.standing_score_id },
      data: { locked_at: now },
    });
    await applyLockConsequences(tx, args.accountId, args.scoreType);
    await insertEvent(tx, { ...args, delta: 0 });
    return tx.standingScore.findUniqueOrThrow({
      where: { standing_score_id: row.standing_score_id },
    });
  });
}

// A Moderator may trigger discretionary review at ANY value — a direct action
// that records an event but neither locks nor changes the value.
export async function triggerDiscretionaryReview(
  args: { accountId: string; scoreType: StandingScoreType; moderatorAccountId: string; explanation: string },
  now: Date = new Date(),
) {
  return recordDiscretionaryEvent(args, now);
}
async function recordDiscretionaryEvent(
  args: { accountId: string; scoreType: StandingScoreType; moderatorAccountId: string; explanation: string },
  now: Date,
) {
  await readWithDrift(prisma, args.accountId, args.scoreType, now);
  return insertEvent(prisma, {
    accountId: args.accountId,
    scoreType: args.scoreType,
    delta: 0,
    eventType: "discretionary_review",
    moderatorAccountId: args.moderatorAccountId,
    explanation: args.explanation,
  });
}

// --- Restoration (UNIFORM across score types and lock causes) ----------------

// Reset to 5, unlock, and anchor drift to the resolution time. Identical for
// ESS/DSS/CSS and for numeric-trigger vs direct-trigger locks — no special
// cases. ESS's extra token-grant precondition is enforced by restoreEssLock().
export async function restoreStandingScore(
  args: {
    accountId: string;
    scoreType: StandingScoreType;
    resolutionTime: Date;
  } & ModeratorAttribution,
) {
  return prisma.$transaction(async (tx) => {
    const row = await getOrCreateRow(tx, args.accountId, args.scoreType, args.resolutionTime);
    const updated = await tx.standingScore.update({
      where: { standing_score_id: row.standing_score_id },
      data: {
        current_value: RESTORE_VALUE,
        locked_at: null,
        last_drift_computed_at: args.resolutionTime,
      },
    });
    await insertEvent(tx, {
      accountId: args.accountId,
      scoreType: args.scoreType,
      delta: 0,
      eventType: "restored",
      moderatorAccountId: args.moderatorAccountId,
      explanation: args.explanation,
    });
    return updated;
  });
}

// --- ESS-specific restoration precondition -----------------------------------

// ESS restoration additionally requires a FRESH TokenGrant from a VE whose
// account differs from the original granter — queried from Stage 1's existing
// TokenGrant table (no new field). "Original" = the earliest grant to this
// account; "fresh" = a later grant from a DIFFERENT granting account.
export async function canRestoreEss(accountId: string): Promise<boolean> {
  const grants = await prisma.tokenGrant.findMany({
    where: { recipient_account_id: accountId },
    orderBy: { granted_at: "asc" },
  });
  if (grants.length === 0) return false; // No original grant to supersede.
  const original = grants[0]; // Earliest grant by granted_at.
  // The distinguishing requirement is a grant from a DIFFERENT VE than the
  // original granter. Every non-original grant is by construction >= the
  // original in time, so a granter-identity check alone is correct (and avoids
  // false negatives when grants share a timestamp).
  return grants.some((g) => g.granting_account_id !== original.granting_account_id);
}

export async function restoreEssLock(
  args: { accountId: string; resolutionTime: Date } & ModeratorAttribution,
) {
  if (!(await canRestoreEss(args.accountId))) {
    throw new StandingScoreError(
      "ESS restoration requires a fresh TokenGrant from a different VE than the original granter.",
    );
  }
  return restoreStandingScore({ ...args, scoreType: "ESS" });
}

// --- Seed Editor retrofit hook -----------------------------------------------

// A DSS-locked account is blocked from seed authoring/publishing entirely —
// independent of and prior to the publish quota tiers.
export async function assertDssNotLocked(accountId: string, now: Date = new Date()) {
  if (await isScoreLocked(accountId, "DSS", now)) {
    throw new StandingScoreError(
      "This account's Developer Standing Score is locked; seed authoring is blocked.",
    );
  }
}
