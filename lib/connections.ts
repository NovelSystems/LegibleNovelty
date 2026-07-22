import { prisma } from "@/lib/prisma";
import { ageInYears } from "@/lib/grade";

// Connection & ParentApproval logic (brief Task 4).
//
// Built ahead of its own use case on purpose: Connection/ParentApproval exist to
// grant eligibility for direct, un-gated LESSON PLAN ASSIGNMENT, but LessonPlan
// itself ships with Workshop. So `lesson_plan_id` is a soft reference (a plain
// UUID, no FK) here, and the invite-link auto-accept path is inert until real
// lesson plans exist. Tests exercise it against a stubbed lesson-plan UUID.
//
// A Connection is always "standing" and is NOT a social/messaging feature; it
// only makes future assignments not need re-approval.

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

// Two accounts are "connected" iff an accepted Connection exists in either
// direction. Used by the Share Contact Information gate (brief Task 5).
export async function areConnected(
  accountAId: string,
  accountBId: string,
): Promise<boolean> {
  const conn = await prisma.connection.findFirst({
    where: {
      status: "accepted",
      OR: [
        { account_a_id: accountAId, account_b_id: accountBId },
        { account_a_id: accountBId, account_b_id: accountAId },
      ],
    },
    select: { connection_id: true },
  });
  return conn != null;
}

// --- Adult-to-adult ----------------------------------------------------------

// A standing connection request (never auto-forms except the invite-link path).
export async function requestConnection(fromAccountId: string, toAccountId: string) {
  return prisma.connection.create({
    data: {
      account_a_id: fromAccountId,
      account_b_id: toAccountId,
      status: "requested",
      created_via: "request",
    },
  });
}

export async function acceptConnection(connectionId: string) {
  return prisma.connection.update({
    where: { connection_id: connectionId },
    data: { status: "accepted" },
  });
}

// Adult-to-adult one-off assignment can target a RAW (non-public) email instead
// of requiring a Connection. Crucially: NO Connection auto-forms from this. This
// is a stub for the real assignment surface Workshop will build — it returns the
// targeting result without persisting a Connection.
export function assignAdultToAdultByEmail(rawEmail: string, lessonPlanId: string) {
  return { targetedEmail: rawEmail, lessonPlanId, connectionCreated: false };
}

// --- Adult-to-child: two distinct pathways, each its own ParentApproval type --

// Pathway 1: one-time assignment pass — invite to one specific lesson plan →
// parent approval → access to that single assignment only → NO standing
// Connection. lesson_plan_id is set (soft reference).
export async function requestOneTimePass(args: {
  childAccountId: string;
  requestingAdultAccountId: string;
  lessonPlanId: string;
}) {
  return prisma.parentApproval.create({
    data: {
      child_account_id: args.childAccountId,
      requesting_adult_account_id: args.requestingAdultAccountId,
      approval_type: "one_time_pass",
      lesson_plan_id: args.lessonPlanId,
      status: "pending",
    },
  });
}

// Pathway 2: standing connection — a separate request type, also requires parent
// approval. Once approved, future assignments don't need re-approval.
export async function requestStandingConnection(args: {
  childAccountId: string;
  requestingAdultAccountId: string;
}) {
  return prisma.parentApproval.create({
    data: {
      child_account_id: args.childAccountId,
      requesting_adult_account_id: args.requestingAdultAccountId,
      approval_type: "standing_connection",
      status: "pending",
    },
  });
}

// Parent approves. The consequence differs by approval_type — the two paths are
// deliberately NOT the same handler (child-safety requirement):
//  * one_time_pass       → access to that single lesson plan; NO Connection.
//  * standing_connection → an accepted, standing Connection is established.
export async function approveParentApproval(approvalId: string) {
  const approval = await prisma.parentApproval.findUniqueOrThrow({
    where: { approval_id: approvalId },
  });
  if (approval.status !== "pending") {
    throw new ConnectionError("Approval is not pending.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.parentApproval.update({
      where: { approval_id: approvalId },
      data: { status: "approved" },
    });

    if (approval.approval_type === "standing_connection") {
      await tx.connection.create({
        data: {
          account_a_id: approval.requesting_adult_account_id,
          account_b_id: approval.child_account_id,
          status: "accepted",
          created_via: "request",
        },
      });
    }
    // one_time_pass: no Connection is created — access is scoped to
    // approval.lesson_plan_id only.

    return updated;
  });
}

export async function denyParentApproval(approvalId: string) {
  return prisma.parentApproval.update({
    where: { approval_id: approvalId },
    data: { status: "denied" },
  });
}

// --- Invite-link auto-acceptance: the ONE exception to "never auto-form" ------

// Following an invite link tied to a specific lesson plan assignment, when it
// leads to NEW account creation, auto-accepts that assignment and auto-forms an
// accepted Connection with the assigner (created_via = invite_link_autoaccept).
//
// INERT until LessonPlan exists — the lessonPlanId is a stubbed soft reference
// here. The new account is assumed already created by the caller; this wires up
// the auto-accepted Connection.
export async function acceptInviteLink(args: {
  assignerAdultAccountId: string;
  newAccountId: string;
  lessonPlanId: string;
}) {
  const connection = await prisma.connection.create({
    data: {
      account_a_id: args.assignerAdultAccountId,
      account_b_id: args.newAccountId,
      status: "accepted",
      created_via: "invite_link_autoaccept",
    },
  });
  return { connection, lessonPlanId: args.lessonPlanId, autoAccepted: true };
}

// Helper for age checks used by the two-pathway UI / gating.
export function accountAge(dateOfBirth: Date | null, now: Date = new Date()) {
  return dateOfBirth == null ? null : ageInYears(dateOfBirth, now);
}
