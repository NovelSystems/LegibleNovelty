import { prisma } from "@/lib/prisma";
import { ParentApprovalCard } from "@/app/components/ParentApprovalCard";
import { childPublicIdentity } from "@/lib/lifecycle";
import { approveApprovalAction, denyApprovalAction } from "./actions";

// Queries the database per request; never prerendered at build time.
export const dynamic = "force-dynamic";

// Parent-facing pending-approvals list (brief Task 4). Each pending request is
// rendered through ParentApprovalCard, which keeps the two approval types
// visually AND functionally distinct (child-safety requirement).
//
// NOTE: Moderator/System_Admin and per-parent scoping is manual/DB-only in
// Stage 1 (no admin UI, no session-scoped filtering wired here yet) — a stated
// Stage 1 limitation. This page renders the mechanism, not access control.
export default async function ParentApprovalsPage() {
  const approvals = await prisma.parentApproval.findMany({
    where: { status: "pending" },
    include: { requesting_adult: true, child_account: true },
    orderBy: { created_at: "desc" },
  });

  return (
    <main>
      <h1>Pending approval requests</h1>
      {approvals.length === 0 && <p>No pending requests.</p>}
      {approvals.map((a) => (
        <ParentApprovalCard
          key={a.approval_id}
          approval={{
            approvalId: a.approval_id,
            approvalType: a.approval_type,
            requestingAdultName:
              a.requesting_adult.preferred_display_name ??
              a.requesting_adult.legal_name,
            childPublicIdentity: childPublicIdentity(a.child_account),
            lessonPlanId: a.lesson_plan_id,
          }}
          onApprove={approveApprovalAction}
          onDeny={denyApprovalAction}
        />
      ))}
    </main>
  );
}
