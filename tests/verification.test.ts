import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  applyForPeerToken,
  applyK12Professor,
  applyLicenseHolder,
  approveApplication,
  grantPeerToken,
  listTokenRequestThreads,
  refreshDueTokens,
  rejectApplication,
} from "@/lib/verification";
import { makeAccount, uniqueEmail } from "./helpers/factory";
import { waitForMessagesTo } from "./helpers/mailpit";

describe("Verified Educator verification (Task 6)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("approves a K-12/professor application and grants VE (Path 1)", async () => {
    const applicantEmail = uniqueEmail("k12");
    const applicant = await makeAccount({ email: applicantEmail });
    const reviewer = await makeAccount();

    const app = await applyK12Professor(applicant.account_id);
    expect(app.path).toBe("k12_professor");

    await approveApplication({
      applicationId: app.application_id,
      reviewerAccountId: reviewer.account_id,
      directoryLookupConfirmed: true,
    });

    const after = await prisma.account.findUniqueOrThrow({
      where: { account_id: applicant.account_id },
    });
    expect(after.ve_status).toBe(true);
    expect(after.ve_token_available).toBe(true);
    // Path 1 grant leaves the peer-token pointer null.
    expect(after.ve_granted_by_account_id).toBeNull();

    const msgs = await waitForMessagesTo(applicantEmail);
    expect(msgs.some((m) => /verified educator/i.test(m.Subject))).toBe(true);
  });

  it("rejects a license-holder application capturing a reason code (Path 1)", async () => {
    const applicant = await makeAccount({ email: uniqueEmail("license") });
    const reviewer = await makeAccount();

    const app = await applyLicenseHolder(applicant.account_id, "s3://doc/license.pdf");
    expect(app.submitted_document_ref).toBe("s3://doc/license.pdf");

    const rejected = await rejectApplication({
      applicationId: app.application_id,
      reviewerAccountId: reviewer.account_id,
      reasonCode: "registry_mismatch",
      reasonElaboration: "Name not found in the state licensing registry.",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejection_reason_code).toBe("registry_mismatch");
    expect(rejected.rejection_reason_elaboration).toContain("registry");

    const stillNotVe = await prisma.account.findUniqueOrThrow({
      where: { account_id: applicant.account_id },
    });
    expect(stillNotVe.ve_status).toBe(false);
  });

  it("grants a peer token, populates ve_granted_by, and refreshes after a month (Path 2)", async () => {
    const granterEmail = uniqueEmail("granter");
    const granter = await makeAccount({ email: granterEmail, ve: true });
    const recipientEmail = uniqueEmail("recip");
    const recipient = await makeAccount({ email: recipientEmail });

    // A VE cannot grant a token to themselves.
    await expect(
      grantPeerToken(granter.account_id, granter.account_id),
    ).rejects.toThrow();

    const grant = await grantPeerToken(granter.account_id, recipient.account_id);
    expect(grant.granting_account_id).toBe(granter.account_id);

    const recipAfter = await prisma.account.findUniqueOrThrow({
      where: { account_id: recipient.account_id },
    });
    expect(recipAfter.ve_status).toBe(true);
    expect(recipAfter.ve_granted_by_account_id).toBe(granter.account_id);

    const granterAfter = await prisma.account.findUniqueOrThrow({
      where: { account_id: granter.account_id },
    });
    expect(granterAfter.ve_token_available).toBe(false); // Token consumed.

    const received = await waitForMessagesTo(recipientEmail);
    expect(received.some((m) => /peer token/i.test(m.Subject))).toBe(true);

    // Backdate the grant beyond the refresh window and refresh.
    await prisma.tokenGrant.update({
      where: { grant_id: grant.grant_id },
      data: { granted_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    });
    const refreshed = await refreshDueTokens();
    expect(refreshed).toContain(grant.grant_id);

    const granterRefreshed = await prisma.account.findUniqueOrThrow({
      where: { account_id: granter.account_id },
    });
    expect(granterRefreshed.ve_token_available).toBe(true);

    // Task 10 trigger: "peer token refreshed" email visible in Mailpit.
    const refreshMsgs = await waitForMessagesTo(granterEmail);
    expect(refreshMsgs.some((m) => /refresh/i.test(m.Subject))).toBe(true);
  });

  it("auto-posts a public token-request thread at application time", async () => {
    const applicant = await makeAccount();
    const thread = await applyForPeerToken(
      applicant.account_id,
      "I am a graduate student teaching an intro seminar.",
    );
    expect(thread.rationale).toMatch(/graduate student/);
    const threads = await listTokenRequestThreads();
    expect(threads.some((t) => t.thread_id === thread.thread_id)).toBe(true);
  });
});
