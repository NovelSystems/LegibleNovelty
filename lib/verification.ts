import { prisma } from "@/lib/prisma";
import type { RejectionReasonCode, TokenGrant } from "@prisma/client";
import {
  sendPeerTokenInvite,
  sendPeerTokenReceived,
  sendPeerTokenRefreshed,
  sendVeDecision,
} from "@/lib/mail";
import { signup, type SignupArgs } from "@/lib/accounts";
import { isScoreLocked } from "@/lib/standing-scores";

// A latched ESS is a hard gate on conferring ve_status: nothing except moderator
// restoration may lift it. A peer token or a fresh verification approval must NOT
// silently restore ve_status on a latched account (that would bypass the appeal).
async function assertEssNotLatched(accountId: string, now: Date) {
  if (await isScoreLocked(accountId, "ESS", now)) {
    throw new VerificationError(
      "This account's Educator Standing Score is latched; VE status cannot be " +
        "conferred until a moderator restores it.",
    );
  }
}

// Verified Educator verification — Phase 1 manual only (brief Task 6,
// Section 4.1). Backed by real VerificationApplication (Path 1) and TokenGrant
// (Path 2) schema. No AI screening (deferred to Phase 2), but rejection reason
// codes are captured on every rejection regardless — the Phase 2 training signal
// costs nothing to log now.

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

const TOKEN_REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // "1 month after use".

// --- Path 1: institutional email/directory (K-12/professor) ------------------

// K-12 teachers and professors: NO document upload. Every application routes to
// a human reviewer, who checks the institution's public directory.
export async function applyK12Professor(applicantAccountId: string) {
  return prisma.verificationApplication.create({
    data: {
      applicant_account_id: applicantAccountId,
      path: "k12_professor",
      status: "pending",
    },
  });
}

// --- Path 1: license-holder document review ----------------------------------

// Teaching credential/license holders: the ONE credential type with a real
// document-upload + human-review path (it has an external registry to check).
// Proof-of-employment and grad-enrollment letters are explicitly excluded from
// the document surface (no external source of truth) — enforce that at the call
// site; this entity only accepts a license document ref.
export async function applyLicenseHolder(
  applicantAccountId: string,
  submittedDocumentRef: string,
) {
  return prisma.verificationApplication.create({
    data: {
      applicant_account_id: applicantAccountId,
      path: "license_holder",
      status: "pending",
      submitted_document_ref: submittedDocumentRef,
    },
  });
}

export interface ReviewApproveArgs {
  applicationId: string;
  reviewerAccountId: string;
  // K-12 path: the reviewer confirmed the applicant in the institutional
  // directory. The confirm mail then goes to the institutional address.
  directoryLookupConfirmed?: boolean;
  institutionalEmail?: string;
}

// Reviewer approves an application → grants VE status. Both Path-1 sub-paths
// produce identical VE status (no visible distinction from a peer-token grant).
export async function approveApplication(args: ReviewApproveArgs, now: Date = new Date()) {
  const app = await prisma.verificationApplication.findUniqueOrThrow({
    where: { application_id: args.applicationId },
  });
  if (app.status !== "pending") {
    throw new VerificationError("Application is not pending.");
  }
  // AUDIT FIX (flagged): approveApplication also confers ve_status, so it is the
  // same ESS-latch bypass class as grantPeerToken. A latched applicant cannot
  // regain VE via a fresh institutional/license approval either — only moderator
  // restoration lifts the latch.
  await assertEssNotLatched(app.applicant_account_id, now);

  const applicant = await prisma.account.update({
    where: { account_id: app.applicant_account_id },
    // Institutional/directory grant: ve_granted_by_account_id stays NULL (only
    // peer-token grants populate it). Grantee becomes a VE holding one token.
    data: { ve_status: true, ve_token_available: true },
  });

  await prisma.verificationApplication.update({
    where: { application_id: args.applicationId },
    data: {
      status: "approved",
      reviewer_account_id: args.reviewerAccountId,
      directory_lookup_confirmed:
        app.path === "k12_professor" ? (args.directoryLookupConfirmed ?? true) : null,
      decided_at: new Date(),
    },
  });

  const to = args.institutionalEmail ?? applicant.email;
  if (to) await sendVeDecision(to, applicant.notification_opt_outs, true);
  return applicant;
}

export interface ReviewRejectArgs {
  applicationId: string;
  reviewerAccountId: string;
  // Rejection reason is captured on EVERY rejection, every path (structured
  // code + optional free-text elaboration).
  reasonCode: RejectionReasonCode;
  reasonElaboration?: string;
}

export async function rejectApplication(args: ReviewRejectArgs) {
  const app = await prisma.verificationApplication.findUniqueOrThrow({
    where: { application_id: args.applicationId },
  });
  if (app.status !== "pending") {
    throw new VerificationError("Application is not pending.");
  }

  const updated = await prisma.verificationApplication.update({
    where: { application_id: args.applicationId },
    data: {
      status: "rejected",
      reviewer_account_id: args.reviewerAccountId,
      rejection_reason_code: args.reasonCode,
      rejection_reason_elaboration: args.reasonElaboration ?? null,
      decided_at: new Date(),
    },
    include: { applicant: true },
  });

  if (updated.applicant.email) {
    await sendVeDecision(updated.applicant.email, updated.applicant.notification_opt_outs, false);
  }
  return updated;
}

// --- Path 2: peer token ------------------------------------------------------

// Every Verified Educator holds exactly 1 token at a time, grantable to another
// account to immediately confer VE status. Populates TokenGrant AND
// Account.ve_granted_by_account_id on the recipient. The granter's token is
// consumed (refreshes 1 month after use).
export async function grantPeerToken(
  grantingAccountId: string,
  recipientAccountId: string,
  now: Date = new Date(),
) {
  if (grantingAccountId === recipientAccountId) {
    throw new VerificationError("A token cannot be granted to oneself.");
  }
  // Free the token first if a prior email invite lapsed unclaimed (no-op
  // otherwise, so the instant-grant behavior is unchanged in the common case).
  await reconcileExpiredPeerTokenGrants(grantingAccountId, now);
  const granter = await prisma.account.findUniqueOrThrow({
    where: { account_id: grantingAccountId },
  });
  if (!granter.ve_status) {
    throw new VerificationError("Only a Verified Educator can grant a token.");
  }
  if (!granter.ve_token_available) {
    throw new VerificationError("You have no token available to grant.");
  }
  // A latched ESS recipient cannot have VE restored by a fresh grant.
  await assertEssNotLatched(recipientAccountId, now);

  const result = await prisma.$transaction(async (tx) => {
    const grant = await tx.tokenGrant.create({
      data: {
        granting_account_id: grantingAccountId,
        recipient_account_id: recipientAccountId,
      },
    });
    // Consume the granter's token.
    await tx.account.update({
      where: { account_id: grantingAccountId },
      data: { ve_token_available: false },
    });
    // Recipient becomes a VE (identical status), holding their own token, with
    // the convenience pointer set. TokenGrant remains the accountability SoR.
    const recipient = await tx.account.update({
      where: { account_id: recipientAccountId },
      data: {
        ve_status: true,
        ve_token_available: true,
        ve_granted_by_account_id: grantingAccountId,
      },
    });
    return { grant, recipient };
  });

  if (result.recipient.email) {
    await sendPeerTokenReceived(
      result.recipient.email,
      result.recipient.notification_opt_outs,
    );
  }
  return result.grant;
}

// --- Grant to an email with no account yet (invite-link path) ----------------

const TOKEN_INVITE_EXPIRY_MS = 28 * 24 * 60 * 60 * 1000; // "28 days".

// A pending grant is one made to an email that hasn't been claimed by creating
// an account yet. It EXPIRES if unclaimed 28 days after the grant.
function isPendingInvite(grant: TokenGrant): boolean {
  return grant.recipient_account_id === null && grant.claimed_at === null;
}
export function isPeerTokenInviteExpired(grant: TokenGrant, now: Date = new Date()): boolean {
  return (
    isPendingInvite(grant) &&
    now.getTime() - grant.granted_at.getTime() >= TOKEN_INVITE_EXPIRY_MS
  );
}

// Lazily reclaim a granter's token when their outstanding invite has expired
// unclaimed (computed at check time — no scheduler, no status enum). Only the
// granter's MOST RECENT grant can be holding the current token, so we only free
// when that one is an expired pending invite; this stays correct after the
// granter later grants again.
export async function reconcileExpiredPeerTokenGrants(
  grantingAccountId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const latest = await prisma.tokenGrant.findFirst({
    where: { granting_account_id: grantingAccountId },
    orderBy: { granted_at: "desc" },
  });
  if (!latest || !isPeerTokenInviteExpired(latest, now)) return false;
  await prisma.account.update({
    where: { account_id: grantingAccountId },
    data: { ve_token_available: true }, // As if the grant never happened.
  });
  return true;
}

// Grant a peer token to an EMAIL ADDRESS. If an account with that email already
// exists, the grant is INSTANT (unchanged behavior). If not, a pending invite is
// created and an invite-link email is sent; VE status is conferred only when the
// recipient claims it by creating an account (claimPeerTokenGrant).
export async function grantPeerTokenByEmail(
  grantingAccountId: string,
  recipientEmail: string,
  now: Date = new Date(),
) {
  // Reclaim any expired outstanding invite first, so a granter whose previous
  // invite lapsed can grant again.
  await reconcileExpiredPeerTokenGrants(grantingAccountId, now);

  const existing = await prisma.account.findUnique({
    where: { email: recipientEmail },
    select: { account_id: true },
  });
  if (existing) {
    // Existing account → instant grant, exactly as originally built.
    return { instant: true as const, grant: await grantPeerToken(grantingAccountId, existing.account_id) };
  }

  // No account yet → pending invite.
  const granter = await prisma.account.findUniqueOrThrow({
    where: { account_id: grantingAccountId },
  });
  if (!granter.ve_status) throw new VerificationError("Only a Verified Educator can grant a token.");
  if (!granter.ve_token_available) throw new VerificationError("You have no token available to grant.");

  const grant = await prisma.$transaction(async (tx) => {
    const g = await tx.tokenGrant.create({
      data: {
        granting_account_id: grantingAccountId,
        recipient_account_id: null, // Unknown until the link is used.
        recipient_email: recipientEmail,
        granted_at: now,
      },
    });
    // Consume the granter's token now; it's returned if the invite expires.
    await tx.account.update({
      where: { account_id: grantingAccountId },
      data: { ve_token_available: false },
    });
    return g;
  });

  await sendPeerTokenInvite(recipientEmail, grant.grant_id);
  return { instant: false as const, grant };
}

// The recipient claims a pending invite by creating their account via the link.
// VE status is conferred at THIS moment (claimed_at set), not at grant time.
// Reuses Stage 1's signup() for account creation (the Connection invite-link is
// not factored as a reusable email-invite primitive, so this follows the same
// pattern rather than duplicating a non-existent abstraction).
export async function claimPeerTokenGrant(
  grantId: string,
  signupArgs: SignupArgs,
  now: Date = new Date(),
) {
  const grant = await prisma.tokenGrant.findUniqueOrThrow({ where: { grant_id: grantId } });
  if (!isPendingInvite(grant)) {
    throw new VerificationError("This grant is not an unclaimed invite.");
  }
  if (isPeerTokenInviteExpired(grant, now)) {
    throw new VerificationError("This invite has expired.");
  }
  if (grant.recipient_email && signupArgs.email !== grant.recipient_email) {
    throw new VerificationError("The account email must match the invited address.");
  }

  // Create the recipient's account (Stage 1 signup; sends its own verification).
  const account = await signup(signupArgs);

  // Defensive: a freshly created account is never latched, but the same
  // no-bypass rule applies here as to a direct grant.
  await assertEssNotLatched(account.account_id, now);

  const linked = await prisma.$transaction(async (tx) => {
    await tx.tokenGrant.update({
      where: { grant_id: grantId },
      data: { recipient_account_id: account.account_id, claimed_at: now },
    });
    return tx.account.update({
      where: { account_id: account.account_id },
      data: {
        ve_status: true,
        ve_token_available: true,
        ve_granted_by_account_id: grant.granting_account_id,
      },
    });
  });

  if (linked.email) {
    await sendPeerTokenReceived(linked.email, linked.notification_opt_outs);
  }
  return { account: linked, grantId };
}

// A used token refreshes 1 month after use. Batch: find grants older than the
// refresh window whose granter still has no token available, mark refreshed_at,
// restore the granter's token, and notify. Idempotent per grant via refreshed_at.
export async function refreshDueTokens(now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - TOKEN_REFRESH_MS);
  const due = await prisma.tokenGrant.findMany({
    where: { refreshed_at: null, granted_at: { lte: cutoff } },
    include: { granting_account: true },
  });

  const refreshed: string[] = [];
  for (const grant of due) {
    await prisma.$transaction([
      prisma.tokenGrant.update({
        where: { grant_id: grant.grant_id },
        data: { refreshed_at: now },
      }),
      prisma.account.update({
        where: { account_id: grant.granting_account_id },
        data: { ve_token_available: true },
      }),
    ]);
    if (grant.granting_account.email) {
      await sendPeerTokenRefreshed(
        grant.granting_account.email,
        grant.granting_account.notification_opt_outs,
      );
    }
    refreshed.push(grant.grant_id);
  }
  return refreshed;
}

// --- Token-request subforum (PROVISIONAL TokenRequestThread) ------------------

// A Community Member applies to view the subforum; the rationale auto-posts
// PUBLICLY as a new thread at the moment of application. The applicant has NO
// subforum access (no browsing, no back-and-forth) until a token is granted.
// Reviewer either grants (via grantPeerToken) or takes no action.
export async function applyForPeerToken(applicantAccountId: string, rationale: string) {
  if (!rationale.trim()) {
    throw new VerificationError("A rationale is required.");
  }
  return prisma.tokenRequestThread.create({
    data: { applicant_account_id: applicantAccountId, rationale },
  });
}

// Reviewer-facing listing of the public token-request threads. (Applicants have
// no browse access until granted — that access rule is enforced at the UI/route
// layer, not here.)
export async function listTokenRequestThreads() {
  return prisma.tokenRequestThread.findMany({ orderBy: { created_at: "desc" } });
}
