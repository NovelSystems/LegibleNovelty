import { prisma } from "@/lib/prisma";
import { lockStandingScoreDirectly } from "@/lib/standing-scores";

// Peer token accountability and VE status review (brief Task 7), backed by the
// generic AccountFlag entity.
//
// TWO distinct flag types with GENUINELY DIFFERENT consequence logic — kept as
// separate handlers on purpose (the brief forbids conflating them):
//
//  * bad_peer_token_grant: account_id is the GRANTING educator. Confirming it
//    AUTOMATICALLY flips the recipient's ve_status to false — the grant was
//    invalid, so the recipient never legitimately held the status. Nothing for
//    a Moderator to weigh beyond confirming the grant was bad.
//
//  * ve_conduct_review: account_id is the educator whose OWN conduct is under
//    review. Confirming it does NOT change ve_status. A Moderator must take a
//    SEPARATE, explicit action to revoke status if warranted.

export class FlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagError";
  }
}

// Raise a bad-peer-token-grant flag against the granting educator, pointing at
// the specific disputed TokenGrant (the accountability system of record — a
// single current-pointer field on the recipient is not enough for review).
export async function flagBadPeerTokenGrant(args: {
  tokenGrantId: string;
  reason: string;
}) {
  const grant = await prisma.tokenGrant.findUniqueOrThrow({
    where: { grant_id: args.tokenGrantId },
  });
  return prisma.accountFlag.create({
    data: {
      account_id: grant.granting_account_id, // The GRANTING educator.
      flag_type: "bad_peer_token_grant",
      related_token_grant_id: grant.grant_id,
      reason: args.reason,
      status: "pending",
    },
  });
}

// Raise a conduct-review flag against a VE (regardless of how status was
// obtained). related_token_grant_id stays null — this isn't about how status
// was obtained, it's about conduct since.
export async function flagVeConductReview(args: {
  accountId: string;
  reason: string;
}) {
  return prisma.accountFlag.create({
    data: {
      account_id: args.accountId, // The VE whose conduct is reviewed.
      flag_type: "ve_conduct_review",
      reason: args.reason,
      status: "pending",
    },
  });
}

// Moderator confirms a flag. The consequence branches HARD on flag_type.
export async function confirmFlag(flagId: string, moderatorAccountId: string) {
  const flag = await prisma.accountFlag.findUniqueOrThrow({
    where: { flag_id: flagId },
  });
  if (flag.status !== "pending") {
    throw new FlagError("Flag is not pending.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.accountFlag.update({
      where: { flag_id: flagId },
      data: {
        status: "confirmed",
        reviewed_by: moderatorAccountId,
        resolved_at: new Date(),
      },
    });

    if (flag.flag_type === "bad_peer_token_grant") {
      // AUTOMATIC status correction on the RECIPIENT of the bad grant. Not a
      // discretionary revocation — the grant was invalid.
      if (!flag.related_token_grant_id) {
        throw new FlagError(
          "bad_peer_token_grant flag is missing its related TokenGrant.",
        );
      }
      const grant = await tx.tokenGrant.findUniqueOrThrow({
        where: { grant_id: flag.related_token_grant_id },
      });
      await tx.account.update({
        where: { account_id: grant.recipient_account_id },
        data: { ve_status: false },
      });
    }

    return row;
  });

  // BEHAVIOR CHANGE vs. Stage 1 Task 7 (flagged in the delivery summary): the
  // Standing Scores brief supersedes Stage 1's "confirmation does not revoke"
  // asymmetry — a confirmed ve_conduct_review now DIRECTLY triggers an ESS lock,
  // which itself sets ve_status/lnc_status false. Done after the flag
  // transaction (the lock runs its own transaction), attributed to the
  // confirming moderator with the flag's reason as the required explanation.
  if (flag.flag_type === "ve_conduct_review") {
    await lockStandingScoreDirectly({
      accountId: flag.account_id,
      scoreType: "ESS",
      eventType: "ve_conduct_review_confirmed",
      moderatorAccountId,
      explanation: flag.reason,
    });
  }

  return updated;
}

export async function dismissFlag(flagId: string, moderatorAccountId: string) {
  return prisma.accountFlag.update({
    where: { flag_id: flagId },
    data: {
      status: "dismissed",
      reviewed_by: moderatorAccountId,
      resolved_at: new Date(),
    },
  });
}

// The SEPARATE, explicit Moderator action that a confirmed ve_conduct_review
// may (but need not) lead to. This is deliberately not part of confirmFlag —
// the asymmetry is the whole point of Task 7.
export async function revokeVeStatus(accountId: string) {
  return prisma.account.update({
    where: { account_id: accountId },
    data: { ve_status: false },
  });
}
