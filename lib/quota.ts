import { prisma } from "@/lib/prisma";
import { startOfPacificDay } from "@/lib/pacific-time";

// Publish quota (Seed Editor Task 5) — anti-spam, NOT human review. Seed
// publication has no review gate; this quota is the actual control.
//
// Two regimes, keyed off the cached Account.first_seed_endorsement_received:
//   * Before an architect's first endorsement: a CONCURRENT cap of 3 published
//     seeds (status = published AND deleted_at IS NULL). Deleting one frees a
//     slot immediately. Not a lifetime or daily count.
//   * After: the concurrent cap lifts entirely, replaced by a RATE limit of 10
//     published seeds per calendar day (midnight Pacific reset).
//
// No counter/ledger table: a live count against published_at is sufficient.
//
// STATED ASSUMPTION (flagged for confirmation, not silently settled): the quota
// applies UNIFORMLY regardless of role — a Verified Educator or Admin authoring
// their own seed gets NO exemption from the pre-endorsement cap. Hence there is
// no role check anywhere here.

export const CONCURRENT_CAP = 3;
export const DAILY_LIMIT = 10;

export class PublishQuotaError extends Error {
  constructor(
    public readonly kind: "concurrent_cap" | "daily_rate",
    message: string,
  ) {
    super(message);
    this.name = "PublishQuotaError";
  }
}

// How many published, non-deleted seeds this architect currently holds.
export function concurrentPublishedCount(architectAccountId: string) {
  return prisma.learningSeed.count({
    where: {
      architect_account_id: architectAccountId,
      status: "published",
      deleted_at: null,
    },
  });
}

// How many seeds this architect has published since the start of the current
// Pacific calendar day (a live count against published_at — no ledger). A
// publish counts toward the day's rate even if the seed was later deleted.
export function publishesTodayCount(
  architectAccountId: string,
  now: Date = new Date(),
) {
  return prisma.learningSeed.count({
    where: {
      architect_account_id: architectAccountId,
      status: "published",
      published_at: { gte: startOfPacificDay(now) },
    },
  });
}

// Throws PublishQuotaError if this architect may NOT publish another seed right
// now. Call immediately before flipping a seed to published.
export async function assertCanPublish(
  architectAccountId: string,
  now: Date = new Date(),
): Promise<void> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { account_id: architectAccountId },
    select: { first_seed_endorsement_received: true },
  });

  if (!account.first_seed_endorsement_received) {
    const concurrent = await concurrentPublishedCount(architectAccountId);
    if (concurrent >= CONCURRENT_CAP) {
      throw new PublishQuotaError(
        "concurrent_cap",
        `Publishing is capped at ${CONCURRENT_CAP} concurrently-published seeds ` +
          `until one of your seeds is endorsed. Delete a published seed to free a slot.`,
      );
    }
    return;
  }

  const today = await publishesTodayCount(architectAccountId, now);
  if (today >= DAILY_LIMIT) {
    throw new PublishQuotaError(
      "daily_rate",
      `You have reached the limit of ${DAILY_LIMIT} seeds published per day ` +
        `(resets at midnight Pacific).`,
    );
  }
}
