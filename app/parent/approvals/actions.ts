"use server";

import { approveParentApproval, denyParentApproval } from "@/lib/connections";

// Server actions for the parent-approval surface. The distinct consequence
// logic per approval_type lives in lib/connections.ts (approveParentApproval
// branches on type); these just adapt it to the UI.

export async function approveApprovalAction(approvalId: string) {
  await approveParentApproval(approvalId);
}

export async function denyApprovalAction(approvalId: string) {
  await denyParentApproval(approvalId);
}
