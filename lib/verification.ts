import { prisma } from "@/lib/prisma";
import type { RejectionReasonCode } from "@prisma/client";
import { sendPeerTokenReceived, sendPeerTokenRefreshed, sendVeDecision } from "@/lib/mail";

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
export async function approveApplication(args: ReviewApproveArgs) {
  const app = await prisma.verificationApplication.findUniqueOrThrow({
    where: { application_id: args.applicationId },
  });
  if (app.status !== "pending") {
    throw new VerificationError("Application is not pending.");
  }

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
) {
  const granter = await prisma.account.findUniqueOrThrow({
    where: { account_id: grantingAccountId },
  });
  if (!granter.ve_status) {
    throw new VerificationError("Only a Verified Educator can grant a token.");
  }
  if (!granter.ve_token_available) {
    throw new VerificationError("You have no token available to grant.");
  }

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
