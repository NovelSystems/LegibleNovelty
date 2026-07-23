import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { grantPeerToken } from "@/lib/verification";
import {
  confirmFlag,
  flagBadPeerTokenGrant,
  flagVeConductReview,
  revokeVeStatus,
} from "@/lib/flags";
import { makeAccount } from "./helpers/factory";

describe("Peer token accountability (Task 7) — the two paths differ", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("confirming bad_peer_token_grant auto-revokes the RECIPIENT's ve_status", async () => {
    const granter = await makeAccount({ ve: true });
    const recipient = await makeAccount();
    const moderator = await makeAccount();

    const grant = await grantPeerToken(granter.account_id, recipient.account_id);
    // Recipient legitimately holds VE for now.
    expect(
      (await prisma.account.findUniqueOrThrow({
        where: { account_id: recipient.account_id },
      })).ve_status,
    ).toBe(true);

    const flag = await flagBadPeerTokenGrant({
      tokenGrantId: grant.grant_id,
      reason: "Recipient turned out to be unqualified.",
    });
    // The flag is against the GRANTING educator and points at the grant.
    expect(flag.account_id).toBe(granter.account_id);
    expect(flag.related_token_grant_id).toBe(grant.grant_id);

    await confirmFlag(flag.flag_id, moderator.account_id);

    // Automatic correction: the recipient's ve_status flips to false.
    const recipAfter = await prisma.account.findUniqueOrThrow({
      where: { account_id: recipient.account_id },
    });
    expect(recipAfter.ve_status).toBe(false);
  });

  it("confirming ve_conduct_review does NOT change ve_status; revoke is separate", async () => {
    const educator = await makeAccount({ ve: true });
    const moderator = await makeAccount();

    const flag = await flagVeConductReview({
      accountId: educator.account_id,
      reason: "Conduct concern raised.",
    });
    expect(flag.related_token_grant_id).toBeNull();

    await confirmFlag(flag.flag_id, moderator.account_id);

    // Confirmation alone leaves ve_status untouched.
    let after = await prisma.account.findUniqueOrThrow({
      where: { account_id: educator.account_id },
    });
    expect(after.ve_status).toBe(true);

    // A SEPARATE explicit Moderator action is required to revoke.
    await revokeVeStatus(educator.account_id);
    after = await prisma.account.findUniqueOrThrow({
      where: { account_id: educator.account_id },
    });
    expect(after.ve_status).toBe(false);
  });
});
