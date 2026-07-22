"use client";

import type { ApprovalType } from "@prisma/client";

// ParentApproval UI (brief Task 4). The two approval types MUST be visually and
// functionally distinct — a child-safety requirement, not a UX nicety. A parent
// must not be able to mistake "approve this one lesson plan" (one_time_pass) for
// "grant this person standing access to my child" (standing_connection).
//
// The distinction is enforced at the interface layer here: different heading,
// different scope description, different emphasis, and a different primary
// action label per type — not merely a shared "Approve" button.

export interface ParentApprovalView {
  approvalId: string;
  approvalType: ApprovalType;
  requestingAdultName: string;
  childPublicIdentity: string;
  lessonPlanId: string | null;
}

const COPY: Record<
  ApprovalType,
  { heading: string; scope: string; approveLabel: string; tone: string }
> = {
  one_time_pass: {
    heading: "Approve a single lesson plan",
    scope:
      "This grants access to ONE specific lesson plan only. It does NOT create a " +
      "standing connection, and it does not let this person assign anything else " +
      "in the future.",
    approveLabel: "Approve this one lesson plan",
    tone: "one-time",
  },
  standing_connection: {
    heading: "Grant a standing connection",
    scope:
      "This grants this person STANDING access to assign lesson plans to your " +
      "child in the future WITHOUT asking again. This is broader than a single " +
      "lesson plan — approve it only if you intend an ongoing relationship.",
    approveLabel: "Grant standing access to my child",
    tone: "standing",
  },
};

export function ParentApprovalCard({
  approval,
  onApprove,
  onDeny,
}: {
  approval: ParentApprovalView;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}) {
  const copy = COPY[approval.approvalType];
  return (
    <section
      // Data attributes make the functional distinction assertable in tests and
      // keep the two types from sharing a generic surface.
      data-approval-type={approval.approvalType}
      data-tone={copy.tone}
      aria-label={copy.heading}
      style={{
        border:
          approval.approvalType === "standing_connection"
            ? "3px solid #b30000"
            : "1px solid #666",
        padding: "1rem",
        margin: "0.5rem 0",
      }}
    >
      <h3>{copy.heading}</h3>
      <p>
        <strong>{approval.requestingAdultName}</strong> is requesting access
        involving {approval.childPublicIdentity}.
      </p>
      {approval.approvalType === "one_time_pass" && approval.lessonPlanId && (
        <p>Lesson plan reference: {approval.lessonPlanId}</p>
      )}
      <p data-testid="approval-scope">{copy.scope}</p>
      <button
        type="button"
        data-action="approve"
        onClick={() => onApprove(approval.approvalId)}
      >
        {copy.approveLabel}
      </button>
      <button
        type="button"
        data-action="deny"
        onClick={() => onDeny(approval.approvalId)}
      >
        Deny
      </button>
    </section>
  );
}

export default ParentApprovalCard;
